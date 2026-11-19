import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fileStorageService, createFileStorageService } from '@/lib/services/fileStorageService'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireRole,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

const UAT_FOLDER_ID = '1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P'
const EXPECTED_PARENT_ID = '177g-GBHRY06rHx9ID8rpQOqR-uve9-kj'
const PROBE_BYTES = new TextEncoder().encode('ADA Ops RC19 synthetic Drive probe. No business or personal data.\n')

type ProbeStorage = Pick<ReturnType<typeof createFileStorageService>, 'upload' | 'read' | 'getMetadata' | 'delete'>
const unavailable = () => Response.json({ ok: false, error: { code: 'STORAGE_PROBE_DISABLED' } }, {
  status: 404,
  headers: { 'Cache-Control': 'no-store' },
})

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{1,100}$/u.test(message) ? message : 'STORAGE_PROBE_FAILED'
}

export function createOperationalStorageDriveProbeHandler(dependencies: {
  env?: Record<string, string | undefined>
  resolveUser?: ServerUserResolver
  createClient?: () => SupabaseClient
  storage?: ProbeStorage
} = {}) {
  const env = dependencies.env ?? process.env
  const clientFactory = dependencies.createClient ?? createSupabaseAdminClient
  const storage = dependencies.storage ?? fileStorageService

  return async function POST(request: Request) {
    try {
      const actor = await requireRole(request, 'admin', dependencies.resolveUser)
      if (env.RC19_STORAGE_DRIVE_PROBE_ENABLED !== 'true') return unavailable()

      const body = await readJsonBody(request, 4096) as { mode?: unknown }
      if (body.mode !== 'metadata' && body.mode !== 'upload_readback') {
        return Response.json({ ok: false, error: { code: 'STORAGE_PROBE_REQUEST_INVALID' } }, { status: 400 })
      }

      const client = clientFactory()
      const limited = await client.rpc('claim_operational_storage_drive_probe_rate_limit', {
        p_actor_auth_user_id: actor.id,
        p_limit: 3,
        p_window_seconds: 600,
      })
      if (limited.error) throw new Error('STORAGE_PROBE_RATE_LIMIT_UNAVAILABLE')
      if (limited.data !== true) {
        return Response.json({ ok: false, error: { code: 'STORAGE_PROBE_RATE_LIMITED' } }, {
          status: 429, headers: { 'Cache-Control': 'no-store' },
        })
      }

      const run = await client.from('operational_storage_drive_probe_runs').insert({
        actor_auth_user_id: actor.id,
        actor_business_user_id: actor.businessUserId ?? null,
        actor_role: 'admin',
        mode: body.mode,
        status: 'started',
        folder_id: UAT_FOLDER_ID,
        expected_parent_id: EXPECTED_PARENT_ID,
      }).select('id').single()
      if (run.error || !run.data) throw new Error('STORAGE_PROBE_AUDIT_WRITE_FAILED')

      const runId = String((run.data as { id: string }).id)
      let providerFileId: string | null = null
      let providerParentId: string | null = null
      let checksum: string | null = null
      let canAddChildren: boolean | null = null
      let readbackVerified = false
      let cleanupStatus: 'not_applicable' | 'trashed' | 'pending_reconciliation' = 'not_applicable'
      let errorCode: string | null = null

      try {
        const folder = await storage.getMetadata(UAT_FOLDER_ID, 'google_drive')
        canAddChildren = folder.capabilities?.canAddChildren ?? null
        if (folder.id !== UAT_FOLDER_ID || folder.kind !== 'folder' || folder.trashed === true
          || !folder.parent_ids?.includes(EXPECTED_PARENT_ID) || canAddChildren !== true) {
          throw new Error('STORAGE_PROBE_FOLDER_VALIDATION_FAILED')
        }

        if (body.mode === 'upload_readback') {
          checksum = createHash('sha256').update(PROBE_BYTES).digest('hex')
          const uploaded = await storage.upload({
            name: `rc19-synthetic-probe-${runId}.txt`,
            mime_type: 'text/plain',
            size_bytes: PROBE_BYTES.byteLength,
            checksum_sha256: checksum,
            content: PROBE_BYTES,
            entity_type: 'attachment',
            entity_id: runId,
            created_by: actor.businessUserId ?? actor.id,
            logical_path: 'RC19_UAT_PROBE',
            external_parent_id: UAT_FOLDER_ID,
            destination: { provider: 'google_drive', external_folder_id: UAT_FOLDER_ID },
          })
          providerFileId = uploaded.asset.external_file_id
          providerParentId = uploaded.asset.external_parent_id ?? null
          cleanupStatus = 'pending_reconciliation'
          if (!providerFileId || providerParentId !== UAT_FOLDER_ID) {
            throw new Error('STORAGE_PROBE_UPLOAD_PARENT_MISMATCH')
          }

          const reference = { provider: 'google_drive' as const, external_file_id: providerFileId }
          const metadata = await storage.getMetadata(reference)
          const bytes = await storage.read(reference)
          readbackVerified = metadata.id === providerFileId && metadata.kind === 'file'
            && metadata.trashed !== true && metadata.parent_ids?.includes(UAT_FOLDER_ID) === true
            && bytes.byteLength === PROBE_BYTES.byteLength
            && createHash('sha256').update(bytes).digest('hex') === checksum
          if (!readbackVerified) throw new Error('STORAGE_PROBE_READBACK_MISMATCH')

          await storage.delete(reference)
          cleanupStatus = (await storage.getMetadata(reference)).trashed === true ? 'trashed' : 'pending_reconciliation'
          if (cleanupStatus !== 'trashed') throw new Error('STORAGE_PROBE_CLEANUP_UNVERIFIED')
        }
      } catch (error) {
        errorCode = safeErrorCode(error)
        if (providerFileId && cleanupStatus !== 'trashed') {
          try {
            const reference = { provider: 'google_drive' as const, external_file_id: providerFileId }
            await storage.delete(reference)
            cleanupStatus = (await storage.getMetadata(reference)).trashed === true ? 'trashed' : 'pending_reconciliation'
          } catch {
            cleanupStatus = 'pending_reconciliation'
          }
        }
      }

      const passed = errorCode === null
      const saved = await client.from('operational_storage_drive_probe_runs').update({
        status: passed ? 'passed' : 'failed',
        provider_file_id: providerFileId,
        provider_parent_id: providerParentId,
        checksum_sha256: checksum,
        folder_can_add_children: canAddChildren,
        readback_verified: readbackVerified,
        cleanup_status: cleanupStatus,
        error_code: errorCode,
        completed_at: new Date().toISOString(),
      }).eq('id', runId)
      if (saved.error) throw new Error('STORAGE_PROBE_AUDIT_WRITE_FAILED')

      return Response.json({
        ok: passed,
        run_id: runId,
        folder_id: UAT_FOLDER_ID,
        expected_parent_id: EXPECTED_PARENT_ID,
        provider_file_id: providerFileId,
        provider_parent_id: providerParentId,
        checksum_sha256: checksum,
        readback_verified: readbackVerified,
        cleanup_status: cleanupStatus,
        ...(errorCode ? { error: { code: errorCode } } : {}),
      }, { status: passed ? 200 : 502, headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) {
        return Response.json({ ok: false, error: { code: error.code } }, { status: error.status })
      }
      return Response.json({ ok: false, error: { code: safeErrorCode(error) } }, {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      })
    }
  }
}
