import { z } from 'zod'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FileProviderName } from '@/lib/files/fileProvider'
import {
  OperationalStoragePlacementError,
  type OperationalLogicalCategory,
  type OperationalStoragePlacementInput,
  type OperationalStorageProvider,
} from '@/lib/files/operationalStoragePlacementResolver'
import { sanitizeFileName, validateFileUploadInput } from '@/lib/files/fileValidation'
import { createFileStorageService, fileStorageService } from '@/lib/services/fileStorageService'
import { createClient } from '@/lib/supabase/server'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import { createOperationalStorageRouteRepository, type OperationalStorageRouteRepository } from '@/lib/server/operationalStorageRouteRepository'
import type { OperationalStoragePlacement } from '@/lib/files/operationalStoragePlacementResolver'
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
type StorageGateway = Pick<ReturnType<typeof createFileStorageService>, 'upload' | 'read' | 'delete' | 'ensureFolder'>
type ReportShiftContext = {
  date: string
  brand_id: string
  platform_id: string | null
  execution_source: 'internal' | 'agency'
}

class ReportImageRouteError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code)
    this.name = 'ReportImageRouteError'
  }
}

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

function safeError(_error: unknown, fallback: string, code = 'REPORT_IMAGE_PROVIDER_ERROR') {
  return errorResponse(code, fallback, 502)
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

async function reportForUpload(client: SupabaseClient, reportId: string, user: AuthenticatedServerUser): Promise<{ report: Record<string, unknown>; shift: ReportShiftContext }> {
  const result = await client
    .from('reports')
    .select('id,shift_id,submitted_by,metrics_confirmed,status')
    .eq('id', reportId)
    .maybeSingle()
  if (result.error) throw result.error
  const report = result.data as Record<string, unknown> | null
  if (!report) throw new ReportImageRouteError('REPORT_NOT_FOUND', 404)
  if (report.metrics_confirmed === true || report.status === 'confirmed') throw new ReportImageRouteError('REPORT_CONFIRMED', 409)
  if (user.systemPermission === 'member' && report.submitted_by !== user.businessUserId) throw permissionError()
  if (typeof report.shift_id !== 'string' || !report.shift_id) throw new ReportImageRouteError('REPORT_SHIFT_CONTEXT_NOT_CONFIGURED', 409)
  const shiftResult = await client
    .from('shifts')
    .select('date,brand_id,platform_id,execution_source')
    .eq('id', report.shift_id)
    .maybeSingle()
  if (shiftResult.error) throw shiftResult.error
  const shift = shiftResult.data as Record<string, unknown> | null
  if (!shift) throw new ReportImageRouteError('REPORT_SHIFT_CONTEXT_NOT_FOUND', 404)
  if (shift.execution_source !== 'internal' && shift.execution_source !== 'agency') {
    throw new OperationalStoragePlacementError('STORAGE_EXECUTION_SOURCE_NOT_CONFIGURED')
  }
  if (typeof shift.date !== 'string' || typeof shift.brand_id !== 'string' || !shift.brand_id) {
    throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
  }
  return {
    report,
    shift: {
      date: shift.date,
      brand_id: shift.brand_id,
      platform_id: typeof shift.platform_id === 'string' ? shift.platform_id : null,
      execution_source: shift.execution_source,
    },
  }
}

export function reportImageLogicalCategory(kind: ReportImageKind, category: string): OperationalLogicalCategory {
  if (kind === 'report' && category === 'dashboard') return 'dashboard'
  if (kind === 'live' && (category === 'key_visual' || category === 'live_session')) return 'live_visual'
  throw new OperationalStoragePlacementError('STORAGE_CATEGORY_NOT_CONFIGURED')
}

function routedPlacementInput(
  provider: OperationalStorageProvider,
  shift: ReportShiftContext,
  logicalCategory: OperationalLogicalCategory,
  fileName: string,
): OperationalStoragePlacementInput {
  return {
    provider,
    executionSource: shift.execution_source,
    brandId: shift.brand_id,
    platformId: shift.platform_id,
    subbrandKey: null,
    shiftDate: shift.date,
    logicalCategory,
    fileName,
  }
}

function logicalMetadataPath(placement: OperationalStoragePlacement): string {
  return [...placement.folderSegments, placement.fileName].join('/')
}

function existingRoutedImage(
  row: Record<string, unknown>,
  categoryField: 'image_type' | 'category',
  requestedCategory: string,
  requestedProvider: CloudProvider,
) {
  if (row[categoryField] !== requestedCategory || row.provider !== requestedProvider) {
    throw new ReportImageRouteError('REPORT_IMAGE_FILE_NAME_CONFLICT', 409)
  }
  return publicRow(row)
}

function placementErrorResponse(error: unknown) {
  if (error instanceof OperationalStoragePlacementError) {
    return errorResponse(error.code, 'The report image could not be stored with the configured operational placement.', 409)
  }
  if (error instanceof ReportImageRouteError) {
    const message = error.code === 'REPORT_NOT_FOUND' ? 'The report was not found.' : 'The report image request could not be completed.'
    return errorResponse(error.code, message, error.status)
  }
  const requestStatuses = new Map([
    ['REPORT_IMAGE_REQUEST_INVALID', 400],
    ['REPORT_IMAGE_FILE_REQUIRED', 400],
    ['LIVE_REPORT_IMAGE_TOO_LARGE', 413],
  ])
  const message = error instanceof Error ? error.message : ''
  const status = requestStatuses.get(message)
  if (status !== undefined) return errorResponse(message, 'The report image request is invalid.', status)
  return errorResponse('REPORT_IMAGE_STORAGE_FAILED', 'The report image could not be stored.', 502)
}

type UploadPlacementDependencies = {
  routeResolver: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  materializeFolders: (placement: OperationalStoragePlacement) => Promise<string>
}

async function uploadReportImage(
  client: SupabaseClient,
  storage: StorageGateway,
  user: AuthenticatedServerUser,
  form: FormData,
  dependencies: UploadPlacementDependencies,
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
  const { shift } = await reportForUpload(client, parsed.data.report_id, user)
  const name = sanitizeFileName(typeof File !== 'undefined' && fileValue instanceof File ? fileValue.name : formString(form, 'file_name'))
  const bytes = new Uint8Array(await fileValue.arrayBuffer())
  const category = reportImageLogicalCategory('report', parsed.data.image_type)
  const provider: CloudProvider = parsed.data.provider ?? 'google_drive'
  const placement = await dependencies.routeResolver.resolvePlacement(routedPlacementInput(provider, shift, category, name))
  const logicalPath = logicalMetadataPath(placement)
  const existing = await client.from('report_images').select('*').eq('report_id', parsed.data.report_id).eq('storage_path', logicalPath).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existingRoutedImage(existing.data as Record<string, unknown>, 'image_type', parsed.data.image_type, provider)
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
  const exactParentId = await dependencies.materializeFolders(placement)
  const result = await storage.upload({
    name,
    mime_type: fileValue.type,
    size_bytes: bytes.byteLength,
    content: bytes,
    entity_type: 'report',
    entity_id: parsed.data.report_id,
    created_by: user.businessUserId || user.id,
    logical_path: logicalPath,
    external_parent_id: exactParentId,
    destination: { provider },
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
    } catch {
      console.error('REPORT_IMAGE_UPLOAD_CLEANUP_FAILED')
    }
    throw error
  }
}

async function uploadLiveReportImage(
  client: SupabaseClient,
  storage: StorageGateway,
  user: AuthenticatedServerUser,
  form: FormData,
  dependencies: UploadPlacementDependencies,
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
  const { shift } = await reportForUpload(client, parsed.data.report_id, user)
  const sourceName = typeof File !== 'undefined' && fileValue instanceof File ? fileValue.name : formString(form, 'file_name')
  const name = sanitizeFileName(sourceName)
  const bytes = new Uint8Array(await fileValue.arrayBuffer())
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('LIVE_REPORT_IMAGE_TOO_LARGE')
  const category = reportImageLogicalCategory('live', parsed.data.category)
  const provider: CloudProvider = parsed.data.provider ?? 'google_drive'
  const placement = await dependencies.routeResolver.resolvePlacement(routedPlacementInput(provider, shift, category, name))
  const logicalPath = logicalMetadataPath(placement)
  const existing = await client.from('live_report_images').select('*').eq('report_id', parsed.data.report_id).eq('file_url', logicalPath).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existingRoutedImage(existing.data as Record<string, unknown>, 'category', parsed.data.category, provider)
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
  const exactParentId = await dependencies.materializeFolders(placement)
  const result = await storage.upload({
    name,
    mime_type: fileValue.type,
    size_bytes: bytes.byteLength,
    content: bytes,
    entity_type: 'report',
    entity_id: parsed.data.report_id,
    created_by: user.businessUserId || user.id,
    logical_path: logicalPath,
    external_parent_id: exactParentId,
    destination: { provider },
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
    } catch {
      console.error('LIVE_REPORT_IMAGE_UPLOAD_CLEANUP_FAILED')
    }
    throw error
  }
}

export function createReportImageRouteHandler(dependencies: {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<SupabaseClient>
  storage?: StorageGateway
  routeResolver?: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  materializeFolders?: (placement: OperationalStoragePlacement) => Promise<string>
} = {}) {
  const clientFactory = dependencies.createClient || createClient
  const storage = dependencies.storage || fileStorageService
  let defaultRouteResolver: OperationalStorageRouteRepository | undefined
  const routeResolver = dependencies.routeResolver || {
    resolvePlacement: (input: OperationalStoragePlacementInput) => {
      defaultRouteResolver ??= createOperationalStorageRouteRepository()
      return defaultRouteResolver.resolvePlacement(input)
    },
  }
  const materializeFolders = dependencies.materializeFolders || createOperationalStorageFolderMaterializer(
    (parentId, name, provider) => storage.ensureFolder(parentId, name, provider),
  )
  const uploadPlacementDependencies = { routeResolver, materializeFolders }

  return {
    async POST(request: Request) {
      try {
        const user = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
        const form = await readFormDataBody(request, 25 * 1024 * 1024)
        const kind = formString(form, 'kind')
        if (kind !== 'report' && kind !== 'live') return errorResponse('REPORT_IMAGE_REQUEST_INVALID', 'The report image request is invalid.', 400)
        const image = kind === 'report'
          ? await uploadReportImage(await clientFactory(), storage, user, form, uploadPlacementDependencies)
          : await uploadLiveReportImage(await clientFactory(), storage, user, form, uploadPlacementDependencies)
        return Response.json({ ok: true, image }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return errorResponse(error.code, error.message, error.status)
        return placementErrorResponse(error)
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
            if (cleanup.error) console.error('LEGACY_REPORT_IMAGE_STORAGE_CLEANUP_FAILED')
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
