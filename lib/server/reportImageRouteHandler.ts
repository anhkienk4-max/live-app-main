import { z } from 'zod'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FileProviderName } from '@/lib/files/fileProvider'
import { logicalFilePlacement } from '@/lib/files/filePlacement'
import { sanitizeFileName, validateFileUploadInput } from '@/lib/files/fileValidation'
import { createFileStorageService, fileStorageService } from '@/lib/services/fileStorageService'
import { createClient } from '@/lib/supabase/server'
import {
  authorizationErrorResponse,
  AuthorizationError,
  isAuthorizationError,
  requirePermission,
  requireUser,
  type AuthenticatedServerUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { readFormDataBody, readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

type ReportImageKind = 'report' | 'live'
type CloudProvider = Extract<FileProviderName, 'google_drive' | 'onedrive'>
type StorageGateway = Pick<ReturnType<typeof createFileStorageService>, 'upload' | 'read' | 'delete'>

const reportType = z.enum(['dashboard', 'livestream', 'host', 'support', 'technical', 'voucher', 'product', 'other'])
const liveCategory = z.enum(['key_visual', 'live_session', 'other'])
const providerType = z.enum(['google_drive', 'onedrive'])
const kindType = z.enum(['report', 'live'])

const reportUploadFields = z.object({
  kind: z.literal('report'),
  report_id: z.string().trim().min(1).max(200),
  image_type: reportType,
  provider: providerType.optional(),
}).strict()

const liveUploadFields = z.object({
  kind: z.literal('live'),
  report_id: z.string().trim().min(1).max(200),
  category: liveCategory,
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1_000).optional(),
  captured_at: z.string().trim().max(80).optional(),
  sort_order: z.coerce.number().int().min(0).max(30).default(0),
  is_cover: z.enum(['true', 'false']).default('false'),
  provider: providerType.optional(),
}).strict()

const deleteFields = z.object({
  kind: kindType,
  image_id: z.string().trim().min(1).max(200),
}).strict()

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function safeError(error: unknown, fallback: string, code = 'REPORT_IMAGE_PROVIDER_ERROR') {
  return errorResponse(code, error instanceof Error && error.message ? error.message : fallback, 502)
}

function permissionError() {
  return new AuthorizationError(403, 'PERMISSION_DENIED', 'You do not have permission to access report images.')
}

async function requireReportReadUser(request: Request, resolveUser?: ServerUserResolver) {
  const user = await requireUser(request, resolveUser)
  if (user.systemPermission === 'member' || user.systemPermission === 'leader' || user.systemPermission === 'admin') return user
  throw permissionError()
}

function formString(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value : undefined
}

function publicRow(row: Record<string, unknown>) {
  const result = { ...row }
  delete result.provider
  delete result.external_file_id
  return result
}

async function reportRow(client: SupabaseClient, kind: ReportImageKind, imageId: string) {
  const table = kind === 'report' ? 'report_images' : 'live_report_images'
  const result = await client.from(table).select('*').eq('id', imageId).maybeSingle()
  if (result.error) throw result.error
  return result.data as Record<string, unknown> | null
}

async function reportForUpload(client: SupabaseClient, reportId: string, user: AuthenticatedServerUser) {
  const result = await client
    .from('reports')
    .select('id,created_at,submitted_by,metrics_confirmed,status')
    .eq('id', reportId)
    .maybeSingle()
  if (result.error) throw result.error
  const report = result.data as Record<string, unknown> | null
  if (!report) throw new Error('REPORT_NOT_FOUND')
  if (report.metrics_confirmed === true || report.status === 'confirmed') throw new Error('REPORT_CONFIRMED')
  if (user.systemPermission === 'member' && report.submitted_by !== user.businessUserId) throw permissionError()
  return report
}

async function uploadReportImage(
  client: SupabaseClient,
  storage: StorageGateway,
  user: AuthenticatedServerUser,
  form: FormData,
) {
  const fileValue = form.get('file')
  if (!(fileValue instanceof Blob)) throw new Error('REPORT_IMAGE_FILE_REQUIRED')
  const parsed = reportUploadFields.safeParse({
    kind: formString(form, 'kind'),
    report_id: formString(form, 'report_id'),
    image_type: formString(form, 'image_type'),
    provider: formString(form, 'provider'),
  })
  if (!parsed.success) throw new Error('REPORT_IMAGE_REQUEST_INVALID')
  const report = await reportForUpload(client, parsed.data.report_id, user)
  const name = sanitizeFileName(typeof File !== 'undefined' && fileValue instanceof File ? fileValue.name : formString(form, 'file_name'))
  const bytes = new Uint8Array(await fileValue.arrayBuffer())
  const logical = logicalFilePlacement('report', parsed.data.report_id, String(report.created_at)).logical_path
  const logicalPath = `${logical}/${parsed.data.image_type}/${name}`
  const existing = await client.from('report_images').select('*').eq('report_id', parsed.data.report_id).eq('storage_path', logicalPath).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return publicRow(existing.data as Record<string, unknown>)
  validateFileUploadInput({
    name,
    mime_type: fileValue.type,
    size_bytes: bytes.byteLength,
    content: bytes,
    entity_type: 'report',
    entity_id: parsed.data.report_id,
    created_by: user.businessUserId || user.id,
    logical_path: logicalPath,
  })
  const result = await storage.upload({
    name,
    mime_type: fileValue.type,
    size_bytes: bytes.byteLength,
    content: bytes,
    entity_type: 'report',
    entity_id: parsed.data.report_id,
    created_by: user.businessUserId || user.id,
    logical_path: logicalPath,
    destination: parsed.data.provider ? { provider: parsed.data.provider } : undefined,
  })
  try {
    const persisted = await client.rpc('upload_report_image_with_provider', {
      p_report_id: parsed.data.report_id,
      p_storage_path: logicalPath,
      p_image_url: logicalPath,
      p_original_name: name,
      p_mime_type: fileValue.type,
      p_size_bytes: bytes.byteLength,
      p_image_type: parsed.data.image_type,
      p_provider: result.asset.provider,
      p_external_file_id: result.asset.external_file_id,
    }).single()
    if (persisted.error) throw persisted.error
    return publicRow((persisted.data || {}) as Record<string, unknown>)
  } catch (error) {
    try {
      await storage.delete({ provider: result.asset.provider as CloudProvider, external_file_id: result.asset.external_file_id })
    } catch (cleanupError) {
      console.error('Report image provider cleanup failed after metadata failure:', cleanupError)
    }
    throw error
  }
}

async function uploadLiveReportImage(
  client: SupabaseClient,
  storage: StorageGateway,
  user: AuthenticatedServerUser,
  form: FormData,
) {
  const fileValue = form.get('file')
  if (!(fileValue instanceof Blob)) throw new Error('REPORT_IMAGE_FILE_REQUIRED')
  const parsed = liveUploadFields.safeParse({
    kind: formString(form, 'kind'),
    report_id: formString(form, 'report_id'),
    category: formString(form, 'category'),
    title: formString(form, 'title'),
    description: formString(form, 'description'),
    captured_at: formString(form, 'captured_at'),
    sort_order: formString(form, 'sort_order'),
    is_cover: formString(form, 'is_cover'),
    provider: formString(form, 'provider'),
  })
  if (!parsed.success) throw new Error('REPORT_IMAGE_REQUEST_INVALID')
  const report = await reportForUpload(client, parsed.data.report_id, user)
  const sourceName = typeof File !== 'undefined' && fileValue instanceof File ? fileValue.name : formString(form, 'file_name')
  const name = sanitizeFileName(sourceName)
  const bytes = new Uint8Array(await fileValue.arrayBuffer())
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('LIVE_REPORT_IMAGE_TOO_LARGE')
  const logical = logicalFilePlacement('report', parsed.data.report_id, String(report.created_at)).logical_path
  const logicalPath = `${logical}/live/${name}`
  const existing = await client.from('live_report_images').select('*').eq('report_id', parsed.data.report_id).eq('file_url', logicalPath).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return publicRow(existing.data as Record<string, unknown>)
  validateFileUploadInput({
    name,
    mime_type: fileValue.type,
    size_bytes: bytes.byteLength,
    content: bytes,
    entity_type: 'report',
    entity_id: parsed.data.report_id,
    created_by: user.businessUserId || user.id,
    logical_path: logicalPath,
  })
  const result = await storage.upload({
    name,
    mime_type: fileValue.type,
    size_bytes: bytes.byteLength,
    content: bytes,
    entity_type: 'report',
    entity_id: parsed.data.report_id,
    created_by: user.businessUserId || user.id,
    logical_path: logicalPath,
    destination: parsed.data.provider ? { provider: parsed.data.provider } : undefined,
  })
  try {
    const persisted = await client.rpc('upsert_live_report_image_with_provider', {
      p_data: {
        report_id: parsed.data.report_id,
        category: parsed.data.category,
        title: parsed.data.title || undefined,
        description: parsed.data.description || undefined,
        captured_at: parsed.data.captured_at || undefined,
        file_url: logicalPath,
        file_name: name,
        mime_type: fileValue.type,
        size_bytes: bytes.byteLength,
        sort_order: parsed.data.sort_order,
        is_cover: parsed.data.is_cover === 'true',
        provider: result.asset.provider,
        external_file_id: result.asset.external_file_id,
      },
    }).single()
    if (persisted.error) throw persisted.error
    return publicRow((persisted.data || {}) as Record<string, unknown>)
  } catch (error) {
    try {
      await storage.delete({ provider: result.asset.provider as CloudProvider, external_file_id: result.asset.external_file_id })
    } catch (cleanupError) {
      console.error('Live report image provider cleanup failed after metadata failure:', cleanupError)
    }
    throw error
  }
}

export function createReportImageRouteHandler(dependencies: {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<SupabaseClient>
  storage?: StorageGateway
} = {}) {
  const clientFactory = dependencies.createClient || createClient
  const storage = dependencies.storage || fileStorageService

  return {
    async POST(request: Request) {
      try {
        const user = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
        const form = await readFormDataBody(request, 25 * 1024 * 1024)
        const kind = formString(form, 'kind')
        if (kind !== 'report' && kind !== 'live') return errorResponse('REPORT_IMAGE_REQUEST_INVALID', 'The report image request is invalid.', 400)
        const image = kind === 'report'
          ? await uploadReportImage(await clientFactory(), storage, user, form)
          : await uploadLiveReportImage(await clientFactory(), storage, user, form)
        return Response.json({ ok: true, image }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return errorResponse(error.code, error.message, error.status)
        const code = error instanceof Error ? error.message : 'REPORT_IMAGE_PROVIDER_ERROR'
        const status = code === 'REPORT_NOT_FOUND' ? 404 : code === 'REPORT_CONFIRMED' ? 409 : code === 'REPORT_IMAGE_REQUEST_INVALID' || code === 'REPORT_IMAGE_FILE_REQUIRED' ? 400 : 502
        return errorResponse(code, status === 502 ? 'The report image could not be stored.' : 'The report image request is invalid.', status)
      }
    },

    async GET(request: Request) {
      try {
        await requireReportReadUser(request, dependencies.resolveUser)
        const params = new URL(request.url).searchParams
        const kind = kindType.safeParse(params.get('kind')).data
        const imageId = params.get('image_id')?.trim()
        if (!kind || !imageId) return errorResponse('REPORT_IMAGE_REQUEST_INVALID', 'The report image request is invalid.', 400)
        const client = await clientFactory()
        const row = await reportRow(client, kind, imageId)
        if (!row) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
        const provider = row.provider
        const externalId = row.external_file_id
        let bytes: Uint8Array
        if (typeof provider === 'string' && typeof externalId === 'string' && provider !== '' && externalId !== '') {
          bytes = await storage.read({ provider: provider as CloudProvider, external_file_id: externalId })
        } else {
          const path = kind === 'report' ? row.storage_path || row.image_url : row.file_url
          if (typeof path !== 'string' || !path) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
          const result = await client.storage.from('report-images').download(path)
          if (result.error || !result.data) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
          bytes = new Uint8Array(await result.data.arrayBuffer())
        }
        return new Response(bytes as BodyInit, {
          headers: {
            'Cache-Control': 'private, no-store',
            'Content-Type': typeof row.mime_type === 'string' && row.mime_type ? row.mime_type : 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        return safeError(error, 'The report image could not be read.')
      }
    },

    async DELETE(request: Request) {
      try {
        const user = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
        const parsed = deleteFields.safeParse(await readJsonBody(request, 16 * 1024))
        if (!parsed.success) return errorResponse('REPORT_IMAGE_REQUEST_INVALID', 'The report image request is invalid.', 400)
        const client = await clientFactory()
        const row = await reportRow(client, parsed.data.kind, parsed.data.image_id)
        if (!row) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
        const provider = typeof row.provider === 'string' ? row.provider : null
        const externalId = typeof row.external_file_id === 'string' ? row.external_file_id : null
        const rpc = parsed.data.kind === 'report' ? 'remove_report_image' : 'remove_live_report_image'
        if (provider && externalId) {
          const authorizationRpc = parsed.data.kind === 'report'
            ? 'authorize_report_image_delete'
            : 'authorize_live_report_image_delete'
          const authorization = await client.rpc(authorizationRpc, { p_image_id: parsed.data.image_id }).single()
          if (authorization.error) throw authorization.error
          if ((authorization.data as unknown as boolean) !== true) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
          try {
            await storage.delete({ provider: provider as CloudProvider, external_file_id: externalId })
          } catch (error) {
            return safeError(error, 'The provider file could not be deleted; report image metadata was preserved for retry.', 'REPORT_IMAGE_PROVIDER_DELETE_FAILED')
          }
          const result = await client.rpc(rpc, { p_image_id: parsed.data.image_id }).single()
          if (result.error) {
            return errorResponse('REPORT_IMAGE_METADATA_DELETE_FAILED', 'The provider file was deleted, but report image metadata could not be removed.', 502)
          }
          if ((result.data as unknown as boolean) !== true) {
            return errorResponse('REPORT_IMAGE_METADATA_DELETE_FAILED', 'The provider file was deleted, but report image metadata could not be removed.', 502)
          }
        } else {
          const result = await client.rpc(rpc, { p_image_id: parsed.data.image_id }).single()
          if (result.error) throw result.error
          if ((result.data as unknown as boolean) !== true) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
          const path = parsed.data.kind === 'report' ? row.storage_path || row.image_url : row.file_url
          if (typeof path === 'string' && path) {
            const cleanup = await client.storage.from('report-images').remove([path])
            if (cleanup.error) console.error('Orphaned legacy report image object after metadata delete:', path, cleanup.error)
          }
        }
        return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return errorResponse(error.code, error.message, error.status)
        return safeError(error, 'The report image could not be deleted.', 'REPORT_IMAGE_DELETE_FAILED')
      }
    },
  }
}
