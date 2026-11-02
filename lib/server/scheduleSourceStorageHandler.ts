import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { MAX_OPERATIONAL_FILE_BYTES, resolveOperationalFileMime } from '@/lib/files/operationalFileCatalog'
import type { OperationalStoragePlacement } from '@/lib/files/operationalStoragePlacementResolver'
import { isOperationalStorageClassificationWritable } from '@/lib/files/operationalStorageDomainMap'
import { createFileStorageService, fileStorageService } from '@/lib/services/fileStorageService'
import { createOperationalStorageDomainRouteRepository, type OperationalStorageDomainRouteRepository } from '@/lib/server/operationalStorageRouteRepository'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requirePermission,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { readFormDataBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { sanitizeFileName } from '@/lib/files/fileValidation'

type StorageGateway = Pick<ReturnType<typeof createFileStorageService>, 'upload' | 'read' | 'getMetadata' | 'delete' | 'ensureFolder'>

const uploadFields = z.object({
  batch_id: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/u),
}).strict()

const readFields = z.object({ file_id: z.string().uuid() }).strict()

function response(code: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: status < 400, ...(status < 400 ? extra : { error: { code } }) }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
async function verifiedSourceFile(storage: StorageGateway, row: Record<string, unknown>) {
  const id = row.external_file_id
  const parentId = row.external_parent_id
  const provider = row.provider
  if (provider !== 'google_drive' || typeof id !== 'string' || typeof parentId !== 'string') {
    throw new Error('SCHEDULE_SOURCE_REFERENCE_INVALID')
  }
  const reference = { provider: 'google_drive' as const, external_file_id: id }
  const metadata = await storage.getMetadata(reference)
  if (metadata.kind !== 'file' || metadata.trashed === true || !metadata.parent_ids?.includes(parentId)) {
    throw new Error('SCHEDULE_SOURCE_REFERENCE_STALE')
  }
  const bytes = await storage.read(reference)
  if (bytes.byteLength !== Number(row.size_bytes)
    || createHash('sha256').update(bytes).digest('hex') !== row.checksum_sha256) {
    throw new Error('SCHEDULE_SOURCE_READBACK_MISMATCH')
  }
  return bytes
}

export function createScheduleSourceStorageHandler(dependencies: {
  resolveUser?: ServerUserResolver
  createClient?: () => SupabaseClient
  storage?: StorageGateway
  domainRoutes?: OperationalStorageDomainRouteRepository
  materializeFolders?: (placement: OperationalStoragePlacement) => Promise<string>
} = {}) {
  const clientFactory = dependencies.createClient ?? createSupabaseAdminClient
  const storage = dependencies.storage ?? fileStorageService
  let domainRoutes = dependencies.domainRoutes
  const materialize = dependencies.materializeFolders ?? createOperationalStorageFolderMaterializer(
    (parentId, name, provider) => storage.ensureFolder(parentId, name, provider),
    (id, provider) => storage.getMetadata(id, provider),
  )

  return {
    async POST(request: Request) {
      try {
        const actor = await requirePermission(request, 'shifts.import', dependencies.resolveUser)
        const form = await readFormDataBody(request, MAX_OPERATIONAL_FILE_BYTES + 4096)
        const parsed = uploadFields.safeParse({ batch_id: form.get('batch_id') })
        const file = form.get('file')
        if (!parsed.success || !(file instanceof File)) return response('SCHEDULE_SOURCE_REQUEST_INVALID', 400)
        if (file.size < 1 || file.size > MAX_OPERATIONAL_FILE_BYTES) return response('OPERATIONAL_FILE_TOO_LARGE', 413)

        const fileName = sanitizeFileName(file.name)
        const mimeType = resolveOperationalFileMime('schedule_source', fileName, file.type)
        const bytes = new Uint8Array(await file.arrayBuffer())
        const checksum = createHash('sha256').update(bytes).digest('hex')
        const client = clientFactory()
        const existing = await client.from('operational_schedule_source_files').select('*')
          .eq('batch_id', parsed.data.batch_id).eq('checksum_sha256', checksum).maybeSingle()
        if (existing.error) throw new Error('SCHEDULE_SOURCE_METADATA_LOOKUP_FAILED')
        if (existing.data) {
          const row = existing.data as Record<string, unknown>
          if (row.reconciliation_status !== 'provider_verified') {
            return response('SCHEDULE_SOURCE_RECONCILIATION_REQUIRED', 409)
          }
          await verifiedSourceFile(storage, row)
          return response('OK', 200, { file: row, reused: true })
        }

        domainRoutes ??= createOperationalStorageDomainRouteRepository({ client })
        const placement = await domainRoutes.resolveDomainCategoryPlacement('schedule_source', fileName)
        if (placement.sensitive || !isOperationalStorageClassificationWritable(placement.accessClassification ?? '')) {
          return response('OPERATIONAL_FILE_CONFIDENTIAL_STORAGE_NOT_APPROVED', 423)
        }
        const parentId = await materialize(placement)
        const receipt = await client.from('operational_schedule_source_files').insert({
          batch_id: parsed.data.batch_id,
          provider: 'google_drive',
          folder_path: placement.folderPath,
          file_name: fileName,
          mime_type: mimeType,
          size_bytes: bytes.byteLength,
          checksum_sha256: checksum,
          reconciliation_status: 'pending',
          uploaded_by: actor.businessUserId ?? actor.id,
        }).select('*').single()
        if (receipt.error || !receipt.data) {
          if (receipt.error?.code === '23505') return response('SCHEDULE_SOURCE_DUPLICATE_RETRY', 409)
          throw new Error('SCHEDULE_SOURCE_METADATA_WRITE_FAILED')
        }

        let uploadedId: string | undefined
        try {
          const uploaded = await storage.upload({
            name: placement.fileName,
            mime_type: mimeType,
            size_bytes: bytes.byteLength,
            checksum_sha256: checksum,
            content: bytes,
            entity_type: 'schedule_import',
            entity_id: parsed.data.batch_id,
            created_by: actor.businessUserId ?? actor.id,
            logical_path: [placement.folderPath, placement.fileName].filter(Boolean).join('/'),
            external_parent_id: parentId,
            destination: { provider: 'google_drive' },
          })
          uploadedId = uploaded.asset.external_file_id
          const reference = { provider: 'google_drive' as const, external_file_id: uploadedId }
          const metadata = await storage.getMetadata(reference)
          const readback = await storage.read(reference)
          if (uploaded.asset.external_parent_id !== parentId || metadata.kind !== 'file'
            || !metadata.parent_ids?.includes(parentId) || readback.byteLength !== bytes.byteLength
            || createHash('sha256').update(readback).digest('hex') !== checksum) {
            throw new Error('SCHEDULE_SOURCE_PROVIDER_READBACK_FAILED')
          }
          const saved = await client.from('operational_schedule_source_files').update({
            external_file_id: uploadedId,
            external_parent_id: parentId,
            provider_metadata: uploaded.asset.provider_metadata ?? {},
            reconciliation_status: 'provider_verified',
            updated_at: new Date().toISOString(),
          }).eq('id', receipt.data.id).select('*').single()
          if (saved.error || !saved.data) throw new Error('SCHEDULE_SOURCE_METADATA_WRITE_FAILED')
          return response('OK', 200, { file: saved.data, reused: false })
        } catch (error) {
          let cleanupVerified = false
          if (uploadedId) {
            try {
              await storage.delete({ provider: 'google_drive', external_file_id: uploadedId })
              cleanupVerified = (await storage.getMetadata({ provider: 'google_drive', external_file_id: uploadedId })).trashed === true
            } catch { /* Keep a reconciliation record if provider cleanup cannot be confirmed. */ }
          }
          await client.from('operational_schedule_source_files').update({
            external_file_id: uploadedId ?? null,
            external_parent_id: uploadedId ? parentId : null,
            reconciliation_status: cleanupVerified ? 'failed_cleaned' : 'reconciliation_required',
            updated_at: new Date().toISOString(),
          }).eq('id', receipt.data.id)
          throw error
        }
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return response(error.code, error.status)
        const code = error instanceof Error && /^[A-Z][A-Z0-9_]{1,100}$/u.test(error.message)
          ? error.message : 'SCHEDULE_SOURCE_STORAGE_FAILED'
        const status = code === 'OPERATIONAL_FILE_CONFIDENTIAL_STORAGE_NOT_APPROVED' ? 423
          : code.includes('TOO_LARGE') ? 413
          : code.startsWith('SCHEDULE_SOURCE_') ? 502 : 409
        return response(code, status)
      }
    },

    async GET(request: Request) {
      try {
        await requirePermission(request, 'shifts.import', dependencies.resolveUser)
        const parsed = readFields.safeParse({ file_id: new URL(request.url).searchParams.get('file_id') })
        if (!parsed.success) return response('SCHEDULE_SOURCE_REQUEST_INVALID', 400)
        const result = await clientFactory().from('operational_schedule_source_files').select('*')
          .eq('id', parsed.data.file_id).eq('reconciliation_status', 'provider_verified').maybeSingle()
        if (result.error || !result.data) return response('SCHEDULE_SOURCE_NOT_FOUND', 404)
        const bytes = await verifiedSourceFile(storage, result.data as Record<string, unknown>)
        return new Response(bytes as BodyInit, {
          headers: {
            'Cache-Control': 'private, no-store',
            'Content-Type': String(result.data.mime_type),
            'Content-Disposition': 'attachment; filename="' + sanitizeFileName(String(result.data.file_name)) + '"',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        const code = error instanceof Error ? error.message : 'SCHEDULE_SOURCE_READ_FAILED'
        return response(code, code === 'SCHEDULE_SOURCE_NOT_FOUND' ? 404 : 502)
      }
    },
  }
}
