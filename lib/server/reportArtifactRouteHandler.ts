import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Campaign,
  DashboardUpdate,
  LiveReportImage,
  Report,
  ReportImage,
  Shift,
  ShiftRegistration,
  StoredFileArtifact,
  User,
} from '@/lib/types/database.types'
import type {
  OperationalLogicalCategory,
  OperationalStoragePlacement,
  OperationalStoragePlacementInput,
  OperationalStorageProvider,
} from '@/lib/files/operationalStoragePlacementResolver'
import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'
import {
  ALLOWED_FILE_MIME_TYPES,
  MAX_FILE_NAME_LENGTH,
  sanitizeFileName,
  sanitizeFileNameWithoutLengthLimit,
  validateFileUploadInput,
} from '@/lib/files/fileValidation'
import { createFileStorageService, fileStorageService } from '@/lib/services/fileStorageService'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import {
  createOperationalStorageRouteRepository,
  type OperationalStorageRouteRepository,
} from '@/lib/server/operationalStorageRouteRepository'
import { createStaticOperationalStorageRouteRepository } from '@/lib/server/staticOperationalStorageRouteRepository'
import {
  resolveOperationalStorageRoutingMode,
  type OperationalStorageRoutingMode,
} from '@/lib/server/operationalStorageRoutingMode'
import { resolveExecutionSource } from '@/lib/utils/executionSource'
import { buildReportDetailWorkbookBytes } from '@/lib/utils/excelUtils'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requirePermission,
  type AuthenticatedServerUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { readFormDataBody, readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

type CloudProvider = 'google_drive' | 'onedrive'
type StorageGateway = Pick<ReturnType<typeof createFileStorageService>, 'upload' | 'read' | 'delete' | 'ensureFolder'>

type ReportShiftContext = {
  date: string
  brand_id: string
  platform_id: string | null
  execution_source: 'internal' | 'agency'
  brand_label?: string
  platform_label?: string
}

const generateFields = z.object({
  action: z.literal('generate_data_report'),
  report_id: z.string().trim().min(1).max(200),
  provider: z.enum(['google_drive', 'onedrive']).optional(),
}).strict()

const deleteFields = z.object({
  file_id: z.string().trim().min(1).max(200),
}).strict()

const sourceFields = z.object({
  report_id: z.string().trim().min(1).max(200),
  provider: z.enum(['google_drive', 'onedrive']).optional(),
}).strict()

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function publicArtifact(row: Record<string, unknown>) {
  return {
    id: row.id,
    provider: row.provider,
    logical_category: row.logical_category,
    folder_path: row.folder_path,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    checksum_sha256: row.checksum_sha256,
    artifact_key: row.artifact_key,
    report_id: row.report_id,
    shift_id: row.shift_id,
    report_version: row.report_version,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    access_url: typeof row.id === 'string'
      ? `/api/report-artifacts?file_id=${encodeURIComponent(row.id)}`
      : undefined,
  }
}

async function entityLabel(
  client: SupabaseClient,
  table: 'brands' | 'platforms',
  id: string,
): Promise<string> {
  const result = await client.from(table).select('name').eq('id', id).maybeSingle()
  if (result.error) throw result.error
  const name = (result.data as { name?: unknown } | null)?.name
  if (typeof name !== 'string' || !name.trim()) {
    throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
  }
  return name
}

async function reportContext(
  client: SupabaseClient,
  reportId: string,
  user: AuthenticatedServerUser,
  routingMode: OperationalStorageRoutingMode,
): Promise<{ report: Report; shift: Shift & ReportShiftContext }> {
  const reportResult = await client.from('reports')
    .select('*')
    .eq('id', reportId)
    .is('deleted_at', null)
    .is('archived_at', null)
    .maybeSingle()
  if (reportResult.error) throw reportResult.error
  if (!reportResult.data) throw new Error('REPORT_NOT_FOUND')

  const report = reportResult.data as unknown as Report
  if (user.systemPermission === 'member' && report.submitted_by !== user.businessUserId) {
    throw new Error('REPORT_PERMISSION_DENIED')
  }

  const shiftResult = await client.from('shifts')
    .select(routingMode === 'compat' ? '*' : '*')
    .eq('id', report.shift_id)
    .maybeSingle()
  if (shiftResult.error) throw shiftResult.error
  if (!shiftResult.data) throw new Error('REPORT_SHIFT_CONTEXT_NOT_FOUND')

  const rawShift = shiftResult.data as unknown as Shift
  const platformId = rawShift.platform_id || null
  const labels = routingMode === 'compat'
    ? await Promise.all([
        entityLabel(client, 'brands', rawShift.brand_id),
        platformId ? entityLabel(client, 'platforms', platformId) : Promise.resolve(undefined),
      ])
    : []

  const executionSource = routingMode === 'compat'
    ? resolveExecutionSource({ studio: rawShift.studio })
    : rawShift.execution_source

  if (executionSource !== 'internal' && executionSource !== 'agency') {
    throw new OperationalStoragePlacementError('STORAGE_EXECUTION_SOURCE_NOT_CONFIGURED')
  }

  return {
    report,
    shift: {
      ...rawShift,
      platform_id: platformId || '',
      execution_source: executionSource,
      brand_label: labels[0],
      platform_label: labels[1],
    },
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

function providerStorageFileName(
  shiftDate: string,
  category: 'data_report' | 'data_source',
  originalName: string,
  bytes: Uint8Array,
) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(shiftDate)
  if (!date) throw new OperationalStoragePlacementError('STORAGE_DATE_INVALID')

  const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase()
  const prefix = `${date[1]}${date[2]}${date[3]}_${category.replaceAll('_', '-')}_${hash}`
  const maxOriginalLength = MAX_FILE_NAME_LENGTH - prefix.length - 1
  if (maxOriginalLength < 1) throw new OperationalStoragePlacementError('STORAGE_FILE_NAME_INVALID')

  const safeOriginal = sanitizeFileNameWithoutLengthLimit(originalName)
  const extensionIndex = safeOriginal.lastIndexOf('.')
  const extension = extensionIndex > 0 && extensionIndex < safeOriginal.length - 1
    ? safeOriginal.slice(extensionIndex)
    : ''
  const stem = extension ? safeOriginal.slice(0, extensionIndex) : safeOriginal
  if (extension.length >= maxOriginalLength) {
    throw new OperationalStoragePlacementError('STORAGE_FILE_NAME_INVALID')
  }
  const boundedStem = stem
    .slice(0, maxOriginalLength - extension.length)
    .replace(/[. ]+$/u, '')
  return sanitizeFileName(`${prefix}_${boundedStem}${extension}`)
}

function sourceMimeType(name: string, raw: string) {
  const mime = raw.trim().toLowerCase()
  if (mime && ALLOWED_FILE_MIME_TYPES.has(mime)) return mime
  const lower = name.toLowerCase()
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  return 'application/octet-stream'
}

async function workbookContext(client: SupabaseClient, report: Report, shift: Shift) {
  const [brandResult, platformResult, campaignResult, registrationsResult, snapshotsResult, imagesResult, liveImagesResult, storedFilesResult] = await Promise.all([
    client.from('brands').select('id,name').eq('id', shift.brand_id).maybeSingle(),
    client.from('platforms').select('id,name').eq('id', shift.platform_id).maybeSingle(),
    shift.campaign_id
      ? client.from('campaigns').select('id,name,brand_id,start_date,end_date,created_at,updated_at').eq('id', shift.campaign_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client.from('shift_registrations').select('*').eq('shift_id', shift.id),
    client.from('dashboard_updates').select('*').eq('shift_id', shift.id),
    client.from('report_images').select('*').eq('report_id', report.id),
    client.from('live_report_images').select('*').eq('report_id', report.id),
    client.from('stored_files').select('*').eq('report_id', report.id).is('deleted_at', null),
  ])
  if (brandResult.error || platformResult.error || campaignResult.error || registrationsResult.error || snapshotsResult.error || imagesResult.error || liveImagesResult.error || storedFilesResult.error) {
    throw new Error('REPORT_EXPORT_CONTEXT_FAILED')
  }

  const registrations = (registrationsResult.data ?? []) as unknown as ShiftRegistration[]
  const userIds = new Set<string>()
  ;[
    shift.host_id,
    shift.support_id,
    shift.technical_id,
    report.confirmed_by,
    report.submitted_by,
    ...registrations.map(item => item.user_id),
  ].forEach(id => {
    if (typeof id === 'string' && id) userIds.add(id)
  })

  const usersResult = userIds.size
    ? await client.from('business_users').select('id,full_name').in('id', [...userIds])
    : { data: [], error: null }
  if (usersResult.error) throw new Error('REPORT_EXPORT_CONTEXT_FAILED')

  return {
    shifts: [shift],
    campaigns: campaignResult.data ? [campaignResult.data as unknown as Campaign] : [],
    users: (usersResult.data ?? []) as unknown as User[],
    brands: new Map([[shift.brand_id, String((brandResult.data as { name?: unknown } | null)?.name ?? shift.brand_id)]]),
    platforms: new Map([[shift.platform_id, String((platformResult.data as { name?: unknown } | null)?.name ?? shift.platform_id)]]),
    registrations,
    dashboardUpdates: (snapshotsResult.data ?? []) as unknown as DashboardUpdate[],
    images: (imagesResult.data ?? []) as unknown as ReportImage[],
    liveImages: (liveImagesResult.data ?? []) as unknown as LiveReportImage[],
    storedFiles: (storedFilesResult.data ?? []) as unknown as StoredFileArtifact[],
  }
}

async function findExisting(
  client: SupabaseClient,
  reportId: string,
  logicalCategory: 'data_report' | 'data_source',
  artifactKey: string,
) {
  const result = await client.from('stored_files')
    .select('*')
    .eq('report_id', reportId)
    .eq('logical_category', logicalCategory)
    .eq('artifact_key', artifactKey)
    .is('deleted_at', null)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data as Record<string, unknown> | null
}

async function persistUploadedArtifact(input: {
  client: SupabaseClient
  storage: StorageGateway
  user: AuthenticatedServerUser
  report: Report
  shift: Shift & ReportShiftContext
  logicalCategory: 'data_report' | 'data_source'
  artifactKey: string
  originalName: string
  mimeType: string
  bytes: Uint8Array
  reportVersion?: number | null
  provider: CloudProvider
  routeResolver: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  materializeFolders: (placement: OperationalStoragePlacement) => Promise<string>
}) {
  const existing = await findExisting(
    input.client,
    input.report.id,
    input.logicalCategory,
    input.artifactKey,
  )
  if (existing) {
    if (existing.provider !== input.provider) throw new Error('REPORT_ARTIFACT_PROVIDER_CONFLICT')
    return publicArtifact(existing)
  }

  const checksum = createHash('sha256').update(input.bytes).digest('hex')
  const storageName = providerStorageFileName(
    input.shift.date,
    input.logicalCategory,
    input.originalName,
    input.bytes,
  )
  const placement = await input.routeResolver.resolvePlacement(routedPlacementInput(
    input.provider,
    input.shift,
    input.logicalCategory,
    storageName,
  ))
  const parentId = await input.materializeFolders(placement)
  const logicalPath = [...placement.folderSegments, placement.fileName].join('/')

  validateFileUploadInput({
    name: storageName,
    mime_type: input.mimeType,
    size_bytes: input.bytes.byteLength,
    checksum_sha256: checksum,
    content: input.bytes,
    entity_type: 'report',
    entity_id: input.report.id,
    created_by: input.user.businessUserId || input.user.id,
    logical_path: logicalPath,
  })

  const uploaded = await input.storage.upload({
    name: storageName,
    mime_type: input.mimeType,
    size_bytes: input.bytes.byteLength,
    checksum_sha256: checksum,
    content: input.bytes,
    entity_type: 'report',
    entity_id: input.report.id,
    created_by: input.user.businessUserId || input.user.id,
    logical_path: logicalPath,
    external_parent_id: parentId,
    destination: { provider: input.provider },
  })

  const row = {
    provider: uploaded.asset.provider,
    external_file_id: uploaded.asset.external_file_id,
    external_parent_id: parentId,
    provider_metadata: uploaded.asset.provider_metadata ?? {},
    logical_category: input.logicalCategory,
    folder_path: placement.folderPath,
    file_name: placement.fileName,
    mime_type: input.mimeType,
    size_bytes: input.bytes.byteLength,
    checksum_sha256: checksum,
    artifact_key: input.artifactKey,
    report_id: input.report.id,
    shift_id: input.shift.id,
    report_version: input.reportVersion ?? null,
    uploaded_by: input.user.businessUserId || null,
  }

  const inserted = await input.client.from('stored_files').insert(row).select('*').single()
  if (!inserted.error && inserted.data) return publicArtifact(inserted.data as Record<string, unknown>)

  const winner = await findExisting(
    input.client,
    input.report.id,
    input.logicalCategory,
    input.artifactKey,
  )
  try {
    await input.storage.delete({
      provider: uploaded.asset.provider as CloudProvider,
      external_file_id: uploaded.asset.external_file_id,
    })
  } catch {
    console.error('REPORT_ARTIFACT_UPLOAD_CLEANUP_FAILED')
  }
  if (winner) {
    if (winner.provider !== input.provider) throw new Error('REPORT_ARTIFACT_PROVIDER_CONFLICT')
    return publicArtifact(winner)
  }
  throw inserted.error || new Error('REPORT_ARTIFACT_METADATA_PERSIST_FAILED')
}

export function createReportArtifactRouteHandler(dependencies: {
  resolveUser?: ServerUserResolver
  createClient?: () => SupabaseClient
  storage?: StorageGateway
  routeResolver?: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  materializeFolders?: (placement: OperationalStoragePlacement) => Promise<string>
  routingMode?: OperationalStorageRoutingMode
} = {}) {
  const clientFactory = dependencies.createClient || createSupabaseAdminClient
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
  const materializeFolders = dependencies.materializeFolders
    || createOperationalStorageFolderMaterializer(
      (parentId, name, provider) => storage.ensureFolder(parentId, name, provider),
    )

  return {
    async GET(request: Request) {
      try {
        const user = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
        const params = new URL(request.url).searchParams
        const client = clientFactory()
        const fileId = params.get('file_id')?.trim()
        if (fileId) {
          const fileResult = await client.from('stored_files')
            .select('*')
            .eq('id', fileId)
            .is('deleted_at', null)
            .maybeSingle()
          if (fileResult.error) throw fileResult.error
          if (!fileResult.data) return errorResponse('REPORT_ARTIFACT_NOT_FOUND', 'The report artifact was not found.', 404)
          const row = fileResult.data as Record<string, unknown>
          await reportContext(client, String(row.report_id), user, routingMode)
          const provider = row.provider
          const externalFileId = row.external_file_id
          if ((provider !== 'google_drive' && provider !== 'onedrive') || typeof externalFileId !== 'string') {
            return errorResponse('REPORT_ARTIFACT_REFERENCE_INVALID', 'The report artifact reference is invalid.', 409)
          }
          const bytes = await storage.read({ provider, external_file_id: externalFileId })
          return new Response(bytes as BodyInit, {
            headers: {
              'Cache-Control': 'private, no-store',
              'Content-Type': typeof row.mime_type === 'string' ? row.mime_type : 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${sanitizeFileName(row.file_name)}"`,
              'X-Content-Type-Options': 'nosniff',
            },
          })
        }

        const reportId = params.get('report_id')?.trim()
        if (!reportId) return errorResponse('REPORT_ARTIFACT_REQUEST_INVALID', 'A report id is required.', 400)
        await reportContext(client, reportId, user, routingMode)
        const result = await client.from('stored_files')
          .select('*')
          .eq('report_id', reportId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
        if (result.error) throw result.error
        return Response.json({
          ok: true,
          files: (result.data ?? []).map(row => publicArtifact(row as Record<string, unknown>)),
        }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        const code = error instanceof Error ? error.message : ''
        if (code === 'REPORT_PERMISSION_DENIED') return errorResponse('PERMISSION_DENIED', 'You do not have permission to access this report.', 403)
        if (code === 'REPORT_NOT_FOUND') return errorResponse(code, 'The report was not found.', 404)
        return errorResponse('REPORT_ARTIFACT_READ_FAILED', 'The report artifact could not be read.', 502)
      }
    },

    async POST(request: Request) {
      try {
        const user = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
        const client = clientFactory()
        const contentType = request.headers.get('content-type') || ''

        if (contentType.includes('multipart/form-data')) {
          const form = await readFormDataBody(request, 25 * 1024 * 1024)
          const parsed = sourceFields.safeParse({
            report_id: typeof form.get('report_id') === 'string' ? form.get('report_id') : undefined,
            provider: typeof form.get('provider') === 'string' ? form.get('provider') : undefined,
          })
          const file = form.get('file')
          if (!parsed.success || !(file instanceof Blob)) {
            return errorResponse('REPORT_ARTIFACT_REQUEST_INVALID', 'The source file request is invalid.', 400)
          }

          const { report, shift } = await reportContext(client, parsed.data.report_id, user, routingMode)
          if (report.metrics_confirmed || report.status === 'confirmed') {
            return errorResponse('REPORT_CONFIRMED', 'Reopen the confirmed report before changing source files.', 409)
          }

          const rawName = typeof File !== 'undefined' && file instanceof File
            ? file.name
            : 'source-file'
          const originalName = sanitizeFileName(rawName)
          const mimeType = sourceMimeType(originalName, file.type)
          const bytes = new Uint8Array(await file.arrayBuffer())
          const checksum = createHash('sha256').update(bytes).digest('hex')
          const artifact = await persistUploadedArtifact({
            client,
            storage,
            user,
            report,
            shift,
            logicalCategory: 'data_source',
            artifactKey: `source:${checksum}`,
            originalName,
            mimeType,
            bytes,
            reportVersion: report.version_number,
            provider: parsed.data.provider ?? 'google_drive',
            routeResolver,
            materializeFolders,
          })
          return Response.json({ ok: true, file: artifact }, { headers: { 'Cache-Control': 'no-store' } })
        }

        const parsed = generateFields.safeParse(await readJsonBody(request, 16 * 1024))
        if (!parsed.success) {
          return errorResponse('REPORT_ARTIFACT_REQUEST_INVALID', 'The report artifact request is invalid.', 400)
        }

        const { report, shift } = await reportContext(client, parsed.data.report_id, user, routingMode)
        if (!report.metrics_confirmed || report.status !== 'confirmed') {
          return errorResponse('REPORT_NOT_CONFIRMED', 'Confirm the report before generating its data report file.', 409)
        }
        const version = report.version_number ?? 0
        const context = await workbookContext(client, report, shift)
        const bytes = buildReportDetailWorkbookBytes(report, context)
        const artifact = await persistUploadedArtifact({
          client,
          storage,
          user,
          report,
          shift,
          logicalCategory: 'data_report',
          artifactKey: `report:v${version}`,
          originalName: `report_${report.id}_v${version}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          bytes,
          reportVersion: version,
          provider: parsed.data.provider ?? 'google_drive',
          routeResolver,
          materializeFolders,
        })
        return Response.json({ ok: true, file: artifact }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return errorResponse(error.code, error.message, error.status)
        if (error instanceof OperationalStoragePlacementError) {
          return errorResponse(error.code, 'The report data file could not be placed in the configured storage route.', 409)
        }
        const code = error instanceof Error ? error.message : ''
        if (code === 'REPORT_PERMISSION_DENIED') return errorResponse('PERMISSION_DENIED', 'You do not have permission to modify this report.', 403)
        if (code === 'REPORT_NOT_FOUND') return errorResponse(code, 'The report was not found.', 404)
        if (code === 'REPORT_ARTIFACT_PROVIDER_CONFLICT') {
          return errorResponse(code, 'This report artifact already exists on a different provider.', 409)
        }
        if (code === 'FILE_MIME_NOT_ALLOWED' || code === 'FILE_SIZE_INVALID' || code === 'FILE_NAME_INVALID') {
          return errorResponse(code, 'The source file is not supported.', 400)
        }
        return errorResponse('REPORT_ARTIFACT_STORAGE_FAILED', 'The report data file could not be stored.', 502)
      }
    },

    async DELETE(request: Request) {
      try {
        const user = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
        const parsed = deleteFields.safeParse(await readJsonBody(request, 16 * 1024))
        if (!parsed.success) {
          return errorResponse('REPORT_ARTIFACT_REQUEST_INVALID', 'The report artifact request is invalid.', 400)
        }
        const client = clientFactory()
        const result = await client.from('stored_files')
          .select('*')
          .eq('id', parsed.data.file_id)
          .is('deleted_at', null)
          .maybeSingle()
        if (result.error) throw result.error
        if (!result.data) return errorResponse('REPORT_ARTIFACT_NOT_FOUND', 'The report artifact was not found.', 404)
        const row = result.data as Record<string, unknown>
        const { report } = await reportContext(client, String(row.report_id), user, routingMode)
        if (report.metrics_confirmed || report.status === 'confirmed') {
          return errorResponse('REPORT_CONFIRMED', 'Reopen the confirmed report before deleting report data files.', 409)
        }
        if (user.systemPermission === 'member' && row.uploaded_by !== user.businessUserId) {
          return errorResponse('PERMISSION_DENIED', 'You can only remove files that you uploaded.', 403)
        }
        const provider = row.provider
        const externalFileId = row.external_file_id
        if ((provider !== 'google_drive' && provider !== 'onedrive') || typeof externalFileId !== 'string') {
          return errorResponse('REPORT_ARTIFACT_REFERENCE_INVALID', 'The report artifact reference is invalid.', 409)
        }

        await storage.delete({ provider, external_file_id: externalFileId })
        const updated = await client.from('stored_files')
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', parsed.data.file_id)
          .is('deleted_at', null)
          .select('id')
          .maybeSingle()
        if (updated.error || !updated.data) {
          return errorResponse(
            'REPORT_ARTIFACT_METADATA_DELETE_FAILED',
            'The provider file was deleted, but its metadata could not be marked deleted.',
            502,
          )
        }
        return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return errorResponse(error.code, error.message, error.status)
        const code = error instanceof Error ? error.message : ''
        if (code === 'REPORT_PERMISSION_DENIED') return errorResponse('PERMISSION_DENIED', 'You do not have permission to modify this report.', 403)
        return errorResponse('REPORT_ARTIFACT_DELETE_FAILED', 'The report data file could not be deleted.', 502)
      }
    },
  }
}

export type { StoredFileArtifact }
