import { createHash } from 'node:crypto'
import { z } from 'zod'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FileProviderName } from '@/lib/files/fileProvider'
import {
  CloudAssetReferenceError,
  decodeCloudAssetReference,
  encodeCloudAssetReference,
  projectPublicReportImageRow,
  type ReportImageRouteKind,
} from '@/lib/files/cloudAssetReference'
import {
  OperationalStoragePlacementError,
  type OperationalLogicalCategory,
  type OperationalStoragePlacementInput,
  type OperationalStorageProvider,
} from '@/lib/files/operationalStoragePlacementResolver'
import {
  MAX_FILE_NAME_LENGTH,
  sanitizeFileName,
  sanitizeFileNameWithoutLengthLimit,
  validateFileUploadInput,
} from '@/lib/files/fileValidation'
import { createFileStorageService, fileStorageService } from '@/lib/services/fileStorageService'
import { createClient } from '@/lib/supabase/server'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import { createOperationalStorageRouteRepository, type OperationalStorageRouteRepository } from '@/lib/server/operationalStorageRouteRepository'
import { createStaticOperationalStorageRouteRepository } from '@/lib/server/staticOperationalStorageRouteRepository'
import { FileProviderError } from '@/lib/server/fileProviderResolver'
import {
  resolveOperationalStorageRoutingMode,
  type OperationalStorageRoutingMode,
} from '@/lib/server/operationalStorageRoutingMode'
import { resolveExecutionSource } from '@/lib/utils/executionSource'
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
  brand_label?: string
  platform_label?: string
}

class ReportImageRouteError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly context?: { brand?: string; platform?: string; execution_source?: string },
  ) {
    super(code)
    this.name = 'ReportImageRouteError'
  }
}

type ReportImageUploadPhase = 'validation' | 'folder_materialization' | 'provider_upload' | 'metadata_persist'

class ReportImageUploadPhaseError extends Error {
  constructor(readonly phase: ReportImageUploadPhase, readonly cause: unknown) {
    super('REPORT_IMAGE_UPLOAD_PHASE_FAILED')
    this.name = 'ReportImageUploadPhaseError'
  }
}

async function inUploadPhase<T>(phase: ReportImageUploadPhase, operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw new ReportImageUploadPhaseError(phase, error)
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

function publicRow(row: Record<string, unknown>, kind: ReportImageRouteKind) {
  return projectPublicReportImageRow(row, kind)
}

const legacyReportImageColumns = [
  'id', 'report_id', 'image_url', 'storage_path', 'original_name', 'mime_type', 'size_bytes',
  'image_type', 'uploaded_by', 'created_at', 'updated_at', 'deleted_at',
].join(',')
const legacyLiveImageColumns = [
  'id', 'report_id', 'category', 'title', 'description', 'captured_at', 'file_url', 'thumbnail_url',
  'file_name', 'mime_type', 'size_bytes', 'sort_order', 'is_cover', 'uploaded_by', 'created_at', 'updated_at',
].join(',')

function legacyImageColumns(kind: ReportImageKind) {
  return kind === 'report' ? legacyReportImageColumns : legacyLiveImageColumns
}

async function reportRow(
  client: SupabaseClient,
  kind: ReportImageKind,
  imageId: string,
  routingMode: OperationalStorageRoutingMode,
) {
  const table = kind === 'report' ? 'report_images' : 'live_report_images'
  const result = await client.from(table)
    .select(routingMode === 'compat' ? legacyImageColumns(kind) : '*')
    .eq('id', imageId)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data as Record<string, unknown> | null
}

async function entityLabel(client: SupabaseClient, table: 'brands' | 'platforms', id: string): Promise<string> {
  const result = await client.from(table).select('name').eq('id', id).maybeSingle()
  if (result.error) throw result.error
  const name = (result.data as { name?: unknown } | null)?.name
  if (typeof name !== 'string' || !name.trim()) throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
  return name
}

async function reportForUpload(
  client: SupabaseClient,
  reportId: string,
  user: AuthenticatedServerUser,
  routingMode: OperationalStorageRoutingMode,
): Promise<{ report: Record<string, unknown>; shift: ReportShiftContext }> {
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
    .select(routingMode === 'compat' ? 'date,brand_id,platform_id,studio' : 'date,brand_id,platform_id,execution_source')
    .eq('id', report.shift_id)
    .maybeSingle()
  if (shiftResult.error) throw shiftResult.error
  const shift = shiftResult.data as Record<string, unknown> | null
  if (!shift) throw new ReportImageRouteError('REPORT_SHIFT_CONTEXT_NOT_FOUND', 404)
  if (routingMode === 'database' && shift.execution_source !== 'internal' && shift.execution_source !== 'agency') {
    throw new OperationalStoragePlacementError('STORAGE_EXECUTION_SOURCE_NOT_CONFIGURED')
  }
  if (typeof shift.date !== 'string' || typeof shift.brand_id !== 'string' || !shift.brand_id) {
    throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
  }
  const platformId = typeof shift.platform_id === 'string' ? shift.platform_id : null
  const labels = routingMode === 'compat'
    ? await Promise.all([
      entityLabel(client, 'brands', shift.brand_id),
      platformId ? entityLabel(client, 'platforms', platformId) : Promise.resolve(undefined),
    ])
    : []
  return {
    report,
    shift: {
      date: shift.date,
      brand_id: shift.brand_id,
      platform_id: platformId,
      execution_source: routingMode === 'compat'
        ? resolveExecutionSource({ studio: shift.studio })
        : shift.execution_source as 'internal' | 'agency',
      brand_label: labels[0],
      platform_label: labels[1],
    },
  }
}

export function reportImageLogicalCategory(kind: ReportImageKind, category: string): OperationalLogicalCategory {
  if (kind === 'report' && category === 'dashboard') return 'dashboard'
  if (kind === 'live' && (category === 'key_visual' || category === 'live_session' || category === 'other')) return 'live_visual'
  throw new OperationalStoragePlacementError('STORAGE_CATEGORY_NOT_CONFIGURED')
}

function providerStorageFileName(shiftDate: string, category: string, originalName: string, bytes: Uint8Array): string {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(shiftDate)
  if (!date) throw new OperationalStoragePlacementError('STORAGE_DATE_INVALID')

  const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase()
  const prefix = `${date[1]}${date[2]}${date[3]}_${category.replaceAll('_', '-')}_${hash}`
  const maxOriginalLength = MAX_FILE_NAME_LENGTH - prefix.length - 1
  if (maxOriginalLength < 1) throw new OperationalStoragePlacementError('STORAGE_FILE_NAME_INVALID')

  const safeOriginal = sanitizeFileNameWithoutLengthLimit(originalName)
  const extensionIndex = safeOriginal.lastIndexOf('.')
  const extension = extensionIndex > 0 && extensionIndex < safeOriginal.length - 1 ? safeOriginal.slice(extensionIndex) : ''
  const stem = extension ? safeOriginal.slice(0, extensionIndex) : safeOriginal
  if (extension.length >= maxOriginalLength) throw new OperationalStoragePlacementError('STORAGE_FILE_NAME_INVALID')
  const boundedStem = stem.slice(0, maxOriginalLength - extension.length).replace(/[. ]+$/u, '')
  return sanitizeFileName(`${prefix}_${boundedStem}${extension}`)
}

async function resolvePlacementWithContext(
  resolver: UploadPlacementDependencies['routeResolver'],
  input: OperationalStoragePlacementInput,
) {
  try {
    return await resolver.resolvePlacement(input)
  } catch (error) {
    if (error instanceof OperationalStoragePlacementError
      && (error.code === 'STORAGE_ROUTE_NOT_CONFIGURED' || error.code === 'CANONICAL_STORAGE_ROUTE_NOT_INITIALIZED')) {
      throw new ReportImageRouteError(error.code, 409, {
        brand: input.brandLabel,
        platform: input.platformLabel,
        execution_source: input.executionSource,
      })
    }
    throw error
  }
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
    brandLabel: shift.brand_label,
    platformLabel: shift.platform_label,
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
  routingMode: OperationalStorageRoutingMode,
  cloudReferenceField: 'image_url' | 'file_url',
) {
  const existingProvider = routingMode === 'compat'
    ? decodeCloudAssetReference(row[cloudReferenceField])?.provider
    : row.provider
  if (row[categoryField] !== requestedCategory || existingProvider !== requestedProvider) {
    throw new ReportImageRouteError('REPORT_IMAGE_FILE_NAME_CONFLICT', 409)
  }
  return publicRow(row, categoryField === 'image_type' ? 'report' : 'live')
}

function placementErrorResponse(error: unknown) {
  if (error instanceof ReportImageUploadPhaseError) {
    const cause = error.cause
    if (cause instanceof FileProviderError && /^[A-Z][A-Z0-9_]{1,79}$/u.test(cause.code)) {
      return Response.json({
        ok: false,
        error: { code: cause.code, phase: error.phase, message: safeProviderErrorMessage(cause.code) },
      }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
    }
    if (cause instanceof OperationalStoragePlacementError) {
      return Response.json({
        ok: false,
        error: { code: cause.code, phase: error.phase, message: 'The report image could not be stored with the configured operational placement.' },
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }
    const validationCode = cause instanceof Error ? cause.message : ''
    const validationCodes = new Set([
      'FILE_INPUT_INVALID', 'FILE_NAME_INVALID', 'FILE_MIME_NOT_ALLOWED', 'FILE_SIZE_INVALID',
      'FILE_EXECUTABLE_NOT_ALLOWED', 'FILE_METADATA_INVALID', 'FILE_CHECKSUM_INVALID', 'FILE_METADATA_BINARY_FORBIDDEN',
    ])
    if (error.phase === 'validation' && validationCodes.has(validationCode)) {
      return Response.json({
        ok: false,
        error: { code: validationCode, phase: error.phase, message: 'The report image file is invalid.' },
      }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
    const code = error.phase === 'validation'
      ? 'REPORT_IMAGE_VALIDATION_FAILED'
      : error.phase === 'folder_materialization'
        ? 'REPORT_IMAGE_FOLDER_MATERIALIZATION_FAILED'
        : error.phase === 'provider_upload'
          ? 'REPORT_IMAGE_PROVIDER_UPLOAD_FAILED'
          : 'REPORT_IMAGE_METADATA_PERSIST_FAILED'
    const message = error.phase === 'validation'
      ? 'The report image file is invalid.'
      : error.phase === 'folder_materialization'
        ? 'The report image folder could not be prepared.'
        : error.phase === 'provider_upload'
          ? 'The file provider could not upload the report image.'
          : 'The report image metadata could not be saved.'
    return Response.json({ ok: false, error: { code, phase: error.phase, message } }, {
      status: error.phase === 'validation' ? 400 : 502,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  if (error instanceof OperationalStoragePlacementError) {
    return errorResponse(error.code, 'The report image could not be stored with the configured operational placement.', 409)
  }
  if (error instanceof CloudAssetReferenceError) {
    return errorResponse(error.code, 'The stored cloud file reference is invalid.', 409)
  }
  if (error instanceof ReportImageRouteError) {
    const message = error.code === 'REPORT_NOT_FOUND'
      ? 'The report was not found.'
      : error.code === 'REPORT_IMAGE_FILE_NAME_CONFLICT'
        ? 'Ảnh này đã tồn tại trong báo cáo với nội dung hoặc loại khác.'
        : error.code === 'STORAGE_ROUTE_NOT_CONFIGURED' || error.code === 'CANONICAL_STORAGE_ROUTE_NOT_INITIALIZED'
          ? 'Chưa cấu hình thư mục lưu ảnh cho thương hiệu này.'
          : 'The report image request could not be completed.'
    return Response.json({
      ok: false,
      error: { code: error.code, message, ...(error.context ? { context: error.context } : {}) },
    }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
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

function safeProviderErrorMessage(code: string) {
  const messages: Record<string, string> = {
    GOOGLE_DRIVE_FOLDER_NOT_WRITABLE: 'Google Drive destination is not writable.',
    GOOGLE_DRIVE_PERMISSION_DENIED: 'Google Drive denied access to the destination.',
    GOOGLE_DRIVE_REAUTH_REQUIRED: 'Google Drive authorization needs attention.',
    GOOGLE_DRIVE_AUTH_FAILED: 'Google Drive authentication failed.',
    GOOGLE_DRIVE_FOLDER_NOT_FOUND: 'Google Drive destination folder was not found.',
    GOOGLE_DRIVE_FOLDER_AMBIGUOUS: 'Google Drive has multiple matching destination folders.',
    GOOGLE_DRIVE_UPLOAD_FAILED: 'Google Drive could not upload the report image.',
    GOOGLE_DRIVE_NETWORK_ERROR: 'Google Drive could not be reached.',
    GOOGLE_DRIVE_RATE_LIMITED: 'Google Drive is temporarily rate limiting uploads.',
    GOOGLE_DRIVE_PROVIDER_UNAVAILABLE: 'Google Drive is temporarily unavailable.',
  }
  return messages[code] || 'The configured file provider could not store the report image.'
}

type UploadPlacementDependencies = {
  routeResolver: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  materializeFolders: (placement: OperationalStoragePlacement) => Promise<string>
  routingMode: OperationalStorageRoutingMode
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
  const { shift } = await reportForUpload(client, parsed.data.report_id, user, dependencies.routingMode)
  const sourceName = (typeof File !== 'undefined' && fileValue instanceof File ? fileValue.name : formString(form, 'file_name')) ?? ''
  const originalName = sanitizeFileName(sourceName)
  const bytes = new Uint8Array(await fileValue.arrayBuffer())
  const category = reportImageLogicalCategory('report', parsed.data.image_type)
  const name = providerStorageFileName(shift.date, parsed.data.image_type, sourceName, bytes)
  const provider: CloudProvider = parsed.data.provider ?? 'google_drive'
  const placement = await resolvePlacementWithContext(dependencies.routeResolver, routedPlacementInput(provider, shift, category, name))
  const logicalPath = logicalMetadataPath(placement)
  const existing = await client.from('report_images')
    .select(dependencies.routingMode === 'compat' ? legacyReportImageColumns : '*')
    .eq('report_id', parsed.data.report_id)
    .eq('storage_path', logicalPath)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existingRoutedImage(
    existing.data as unknown as Record<string, unknown>, 'image_type', parsed.data.image_type, provider,
    dependencies.routingMode, 'image_url',
  )
  await inUploadPhase('validation', () => validateFileUploadInput({
    name,
    mime_type: fileValue.type,
    size_bytes: bytes.byteLength,
    content: bytes,
    entity_type: 'report',
    entity_id: parsed.data.report_id,
    created_by: user.businessUserId || user.id,
    logical_path: logicalPath,
  }))
  const exactParentId = await inUploadPhase('folder_materialization', () => dependencies.materializeFolders(placement))
  const result = await inUploadPhase('provider_upload', () => storage.upload({
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
  }))
  try {
    const persisted = await inUploadPhase('metadata_persist', async () => {
      const persistedResult = await (dependencies.routingMode === 'compat'
      ? client.rpc('upload_report_image', {
          p_report_id: parsed.data.report_id,
          p_storage_path: logicalPath,
          p_image_url: encodeCloudAssetReference({
            provider: result.asset.provider as CloudProvider,
            external_file_id: result.asset.external_file_id,
          }),
          p_original_name: originalName,
          p_mime_type: fileValue.type,
          p_size_bytes: bytes.byteLength,
          p_image_type: parsed.data.image_type,
        }).single()
      : client.rpc('upload_report_image_with_provider', {
          p_report_id: parsed.data.report_id,
          p_storage_path: logicalPath,
          p_image_url: logicalPath,
          p_original_name: originalName,
          p_mime_type: fileValue.type,
          p_size_bytes: bytes.byteLength,
          p_image_type: parsed.data.image_type,
          p_provider: result.asset.provider,
          p_external_file_id: result.asset.external_file_id,
        }).single())
      if (persistedResult.error) throw persistedResult.error
      return publicRow((persistedResult.data || {}) as Record<string, unknown>, 'report')
    })
    return persisted
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
  const { shift } = await reportForUpload(client, parsed.data.report_id, user, dependencies.routingMode)
  const sourceName = (typeof File !== 'undefined' && fileValue instanceof File ? fileValue.name : formString(form, 'file_name')) ?? ''
  const originalName = sanitizeFileName(sourceName)
  const bytes = new Uint8Array(await fileValue.arrayBuffer())
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('LIVE_REPORT_IMAGE_TOO_LARGE')
  const category = reportImageLogicalCategory('live', parsed.data.category)
  const name = providerStorageFileName(shift.date, parsed.data.category, sourceName, bytes)
  const idempotencyKey = `${parsed.data.category}:${createHash('sha256').update(bytes).digest('hex')}`
  const provider: CloudProvider = parsed.data.provider ?? 'google_drive'
  const placement = await resolvePlacementWithContext(dependencies.routeResolver, routedPlacementInput(provider, shift, category, name))
  const logicalPath = logicalMetadataPath(placement)
  if (dependencies.routingMode === 'compat') {
    const existing = await client.from('live_report_images')
      .select(legacyLiveImageColumns)
      .eq('report_id', parsed.data.report_id)
      .eq('storage_idempotency_key', idempotencyKey)
      .limit(2)
    if (existing.error) throw existing.error
    const matching = (existing.data ?? []) as unknown as Record<string, unknown>[]
    if (matching.length > 1) throw new ReportImageRouteError('REPORT_IMAGE_FILE_NAME_CONFLICT', 409)
    if (matching.length > 0) return existingRoutedImage(
      matching[0], 'category', parsed.data.category, provider, 'compat', 'file_url',
    )
  } else {
    const existing = await client.from('live_report_images').select('*')
      .eq('report_id', parsed.data.report_id).eq('storage_idempotency_key', idempotencyKey).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) return existingRoutedImage(
      existing.data as Record<string, unknown>, 'category', parsed.data.category, provider, 'database', 'file_url',
    )
  }
  await inUploadPhase('validation', () => validateFileUploadInput({
    name,
    mime_type: fileValue.type,
    size_bytes: bytes.byteLength,
    content: bytes,
    entity_type: 'report',
    entity_id: parsed.data.report_id,
    created_by: user.businessUserId || user.id,
    logical_path: logicalPath,
  }))
  const exactParentId = await inUploadPhase('folder_materialization', () => dependencies.materializeFolders(placement))
  const result = await inUploadPhase('provider_upload', () => storage.upload({
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
  }))
  let persistedRow: Record<string, unknown>
  try {
    const persistedRowResult = await inUploadPhase('metadata_persist', async () => {
      const persisted = await client.rpc(
      dependencies.routingMode === 'compat' ? 'upsert_live_report_image' : 'upsert_live_report_image_with_provider', {
      p_data: {
        report_id: parsed.data.report_id,
        category: parsed.data.category,
        title: parsed.data.title || undefined,
        description: parsed.data.description || undefined,
        captured_at: parsed.data.captured_at || undefined,
        file_url: dependencies.routingMode === 'compat'
          ? encodeCloudAssetReference({
            provider: result.asset.provider as CloudProvider,
            external_file_id: result.asset.external_file_id,
          })
          : logicalPath,
        file_name: originalName,
        storage_file_name: name,
        storage_idempotency_key: idempotencyKey,
        mime_type: fileValue.type,
        size_bytes: bytes.byteLength,
        sort_order: parsed.data.sort_order,
        is_cover: parsed.data.is_cover === 'true',
        ...(dependencies.routingMode === 'database' ? {
          provider: result.asset.provider,
          external_file_id: result.asset.external_file_id,
        } : {}),
      },
      }).single()
      if (persisted.error) throw persisted.error
      return (persisted.data || {}) as Record<string, unknown>
    })
    persistedRow = persistedRowResult
  } catch (error) {
    try {
      await storage.delete({ provider: result.asset.provider as CloudProvider, external_file_id: result.asset.external_file_id })
    } catch {
      console.error('LIVE_REPORT_IMAGE_UPLOAD_CLEANUP_FAILED')
    }
    throw error
  }
  const persistedReference = dependencies.routingMode === 'compat'
    ? decodeCloudAssetReference(persistedRow.file_url)
    : { provider: persistedRow.provider, external_file_id: persistedRow.external_file_id }
  if (!persistedReference) throw new CloudAssetReferenceError()
  if (persistedReference.provider !== result.asset.provider
    || persistedReference.external_file_id !== result.asset.external_file_id) {
    // A concurrent upload won the database key. Delete only this request's redundant object.
    try {
      await storage.delete({ provider: result.asset.provider as CloudProvider, external_file_id: result.asset.external_file_id })
    } catch {
      console.error('LIVE_REPORT_IMAGE_UPLOAD_CLEANUP_FAILED')
      throw new ReportImageRouteError('REPORT_IMAGE_UPLOAD_CLEANUP_FAILED', 502)
    }
  }
  return existingRoutedImage(persistedRow, 'category', parsed.data.category, provider, dependencies.routingMode, 'file_url')
}

function cloudReferenceForRow(kind: ReportImageKind, row: Record<string, unknown>) {
  return decodeCloudAssetReference(kind === 'report' ? row.image_url : row.file_url)
}

async function authorizeCompatCloudDelete(
  client: SupabaseClient,
  row: Record<string, unknown>,
  user: AuthenticatedServerUser,
) {
  if (typeof row.report_id !== 'string' || !row.report_id) throw new ReportImageRouteError('REPORT_NOT_FOUND', 404)
  const result = await client.from('reports')
    .select('id,submitted_by,metrics_confirmed,status')
    .eq('id', row.report_id)
    .is('deleted_at', null)
    .is('archived_at', null)
    .maybeSingle()
  if (result.error) throw result.error
  const report = result.data as Record<string, unknown> | null
  if (!report) throw new ReportImageRouteError('REPORT_NOT_FOUND', 404)
  if (user.systemPermission === 'member'
    && (row.uploaded_by !== user.businessUserId || report.submitted_by !== user.businessUserId)) {
    throw permissionError()
  }
  if (report.metrics_confirmed === true || report.status === 'confirmed') {
    throw new ReportImageRouteError('REPORT_CONFIRMED', 409)
  }
}

export function createReportImageRouteHandler(dependencies: {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<SupabaseClient>
  storage?: StorageGateway
  routeResolver?: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  materializeFolders?: (placement: OperationalStoragePlacement) => Promise<string>
  routingMode?: OperationalStorageRoutingMode
} = {}) {
  const clientFactory = dependencies.createClient || createClient
  const storage = dependencies.storage || fileStorageService
  const routingMode = dependencies.routingMode ?? resolveOperationalStorageRoutingMode()
  let defaultRouteResolver: OperationalStorageRouteRepository | undefined
  const routeResolver = dependencies.routeResolver || {
    resolvePlacement: (input: OperationalStoragePlacementInput) => {
      defaultRouteResolver ??= routingMode === 'compat'
        ? createStaticOperationalStorageRouteRepository()
        : createOperationalStorageRouteRepository()
      return defaultRouteResolver.resolvePlacement(input)
    },
  }
  const materializeFolders = dependencies.materializeFolders || createOperationalStorageFolderMaterializer(
    (parentId, name, provider) => storage.ensureFolder(parentId, name, provider),
  )
  const uploadPlacementDependencies = { routeResolver, materializeFolders, routingMode }

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
        const row = await reportRow(client, kind, imageId, routingMode)
        if (!row) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
        const provider = row.provider
        const externalId = row.external_file_id
        let bytes: Uint8Array
        const cloudReference = typeof provider === 'string' && typeof externalId === 'string' && provider !== '' && externalId !== ''
          ? { provider: provider as CloudProvider, external_file_id: externalId }
          : cloudReferenceForRow(kind, row)
        if (cloudReference) {
          bytes = await storage.read(cloudReference)
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
        if (error instanceof CloudAssetReferenceError) return errorResponse(error.code, 'The stored cloud file reference is invalid.', 409)
        return safeError(error, 'The report image could not be read.')
      }
    },

    async DELETE(request: Request) {
      try {
        const user = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
        const parsed = deleteFields.safeParse(await readJsonBody(request, 16 * 1024))
        if (!parsed.success) return errorResponse('REPORT_IMAGE_REQUEST_INVALID', 'The report image request is invalid.', 400)
        const client = await clientFactory()
        const row = await reportRow(client, parsed.data.kind, parsed.data.image_id, routingMode)
        if (!row) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
        const provider = typeof row.provider === 'string' ? row.provider : null
        const externalId = typeof row.external_file_id === 'string' ? row.external_file_id : null
        const rpc = parsed.data.kind === 'report' ? 'remove_report_image' : 'remove_live_report_image'
        const persistedReference = provider && externalId
          ? { provider: provider as CloudProvider, external_file_id: externalId }
          : cloudReferenceForRow(parsed.data.kind, row)
        if (persistedReference) {
          if (provider && externalId && routingMode === 'database') {
            const authorizationRpc = parsed.data.kind === 'report'
              ? 'authorize_report_image_delete'
              : 'authorize_live_report_image_delete'
            const authorization = await client.rpc(authorizationRpc, { p_image_id: parsed.data.image_id }).single()
            if (authorization.error) throw authorization.error
            if ((authorization.data as unknown as boolean) !== true) return errorResponse('REPORT_IMAGE_NOT_FOUND', 'The report image was not found.', 404)
          } else {
            await authorizeCompatCloudDelete(client, row, user)
          }
          try {
            await storage.delete(persistedReference)
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
        if (error instanceof CloudAssetReferenceError) return errorResponse(error.code, 'The stored cloud file reference is invalid.', 409)
        return safeError(error, 'The report image could not be deleted.', 'REPORT_IMAGE_DELETE_FAILED')
      }
    },
  }
}
