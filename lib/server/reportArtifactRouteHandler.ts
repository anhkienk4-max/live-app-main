import { createHash, randomUUID } from 'node:crypto'
import * as XLSX from 'xlsx'
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
import { REPORT_ARTIFACT_GROUPS, canWriteOperationalStoragePlacement, type ReportArtifactGroup } from '@/lib/files/operationalStorageDomainMap'
import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'
import {
  MAX_FILE_NAME_LENGTH,
  sanitizeFileName,
  sanitizeFileNameWithoutLengthLimit,
  validateFileUploadInput,
} from '@/lib/files/fileValidation'
import { createFileStorageService, fileStorageService } from '@/lib/services/fileStorageService'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import {
  createOperationalStorageDomainRouteRepository,
  createOperationalStorageRouteRepository,
  type OperationalStorageDomainRouteRepository,
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
type StorageGateway = Pick<ReturnType<typeof createFileStorageService>, 'upload' | 'read' | 'getMetadata' | 'delete' | 'ensureFolder'>

type ReportShiftContext = {
  date: string
  brand_id: string
  platform_id: string | null
  execution_source?: 'internal' | 'agency'
  brand_label?: string
  platform_label?: string
}

const generateFields = z.object({
  action: z.literal('generate_data_report'),
  report_id: z.string().trim().min(1).max(200),
  provider: z.enum(['google_drive', 'onedrive']).optional(),
  artifact_group: z.enum(REPORT_ARTIFACT_GROUPS as [ReportArtifactGroup, ...ReportArtifactGroup[]]).optional(),
}).strict()

const deleteFields = z.object({
  file_id: z.string().trim().min(1).max(200),
}).strict()

const sourceFields = z.object({
  report_id: z.string().trim().min(1).max(200),
  provider: z.enum(['google_drive', 'onedrive']).optional(),
  artifact_group: z.enum(REPORT_ARTIFACT_GROUPS as [ReportArtifactGroup, ...ReportArtifactGroup[]]).optional(),
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

async function artifactHasDeletion(client: SupabaseClient, fileId: string): Promise<boolean> {
  const result = await client.from('rc19_report_artifact_deletions')
    .select('operation_id').eq('stored_file_id', fileId).maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data)
}

async function verifyLegacyReportParent(
  storage: StorageGateway,
  resolver: Pick<OperationalStorageDomainRouteRepository, 'resolveReportArtifactGroupPlacement'>,
  row: Record<string, unknown>,
  shift: Shift & ReportShiftContext,
): Promise<string | null> {
  if (typeof row.file_name !== 'string' || typeof row.folder_path !== 'string'
    || typeof row.external_file_id !== 'string') return null
  const placements = await Promise.all(REPORT_ARTIFACT_GROUPS.map(group => resolver.resolveReportArtifactGroupPlacement({
    group, shiftId: shift.id, shiftDate: shift.date, brandId: shift.brand_id, platformId: shift.platform_id,
    agencyCode: shift.agency_code ?? null, executionSource: shift.execution_source ?? null, fileName: row.file_name as string,
  })))
  const matches = placements.filter(placement => placement.folderPath === row.folder_path)
  if (matches.length !== 1) return null
  const placement = matches[0]
  if (!placement.expectedBaseParentId
    || !canWriteOperationalStoragePlacement(placement.accessClassification ?? '', placement.sensitive ?? false)) return null
  const read = (id: string) => storage.getMetadata({ provider: 'google_drive', external_file_id: id })
  const file = await read(row.external_file_id)
  if (file.id !== row.external_file_id || file.name !== row.file_name || file.kind !== 'file'
    || file.trashed === true || file.parent_ids?.length !== 1) return null
  const parentId = file.parent_ids[0]
  let currentId = parentId
  for (const segment of [...placement.folderSegments].reverse()) {
    const folder = await read(currentId)
    if (folder.id !== currentId || folder.kind !== 'folder' || folder.name !== segment
      || folder.trashed === true || folder.parent_ids?.length !== 1) return null
    currentId = folder.parent_ids[0]
  }
  if (currentId !== placement.baseFolderId) return null
  const base = await read(currentId)
  if (base.id !== currentId || base.kind !== 'folder' || base.trashed === true
    || base.parent_ids?.length !== 1 || base.parent_ids[0] !== placement.expectedBaseParentId) return null
  return parentId
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
  createScopeClient: () => Promise<Pick<SupabaseClient, 'rpc'>>,
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
  if (user.systemPermission === 'leader') {
    if (!user.businessUserId || !rawShift.brand_id) throw new Error('REPORT_PERMISSION_DENIED')
    const scopeClient = await createScopeClient()
    const [decision, review, submit] = await Promise.all([
      scopeClient.rpc('rbac_permission_decision', { p_permission: 'reports.submit' }),
      scopeClient.rpc('rc19_current_leader_brand_ids', { p_scope_key: 'reports.review' }),
      scopeClient.rpc('rc19_current_leader_brand_ids', { p_scope_key: 'reports.submit' }),
    ])
    const identity = decision.data as { actor_business_user_id?: unknown; role?: unknown; allowed?: unknown } | null
    if (decision.error || review.error || submit.error || identity?.actor_business_user_id !== user.businessUserId
      || identity.role !== 'leader' || identity.allowed !== true
      || !Array.isArray(review.data) || !Array.isArray(submit.data)
      || !(review.data.includes(rawShift.brand_id)
        || (report.submitted_by === user.businessUserId && submit.data.includes(rawShift.brand_id)))) {
      throw new Error('REPORT_PERMISSION_DENIED')
    }
  }
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

  if (routingMode !== 'domain_first' && executionSource !== 'internal' && executionSource !== 'agency') {
    throw new OperationalStoragePlacementError('STORAGE_EXECUTION_SOURCE_NOT_CONFIGURED')
  }

  return {
    report,
    shift: {
      ...rawShift,
      platform_id: platformId || '',
      execution_source: executionSource === 'internal' || executionSource === 'agency' ? executionSource : undefined,
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
  if (shift.execution_source !== 'internal' && shift.execution_source !== 'agency') {
    throw new OperationalStoragePlacementError('STORAGE_EXECUTION_SOURCE_NOT_CONFIGURED')
  }
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

const REPORT_SOURCE_MIMES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
])

function sourceMimeType(name: string, raw: string) {
  const mime = raw.trim().toLowerCase()
  if (mime && REPORT_SOURCE_MIMES.has(mime)) return mime
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

function addFinalInsights(bytes: Uint8Array, report: Report) {
  const workbook = XLSX.read(bytes, { type: 'array' })
  const rows: unknown[][] = [['Insight', 'Part', 'Content']]
  for (const [label, value] of [
    ['What Went Well', report.insights_good ?? ''],
    ['Improvement Areas', report.insights_improvement ?? ''],
  ]) {
    if (!value) rows.push([label, 1, ''])
    for (let offset = 0, part = 1; offset < value.length; part++) {
      let end = Math.min(offset + 32000, value.length)
      if (end < value.length && /[\uD800-\uDBFF]/u.test(value[end - 1])) end--
      rows.push([label, part, value.slice(offset, end)])
      offset = end
    }
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '05_FINAL_INSIGHTS')
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))
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

async function verifyProviderArtifact(
  storage: StorageGateway,
  row: Record<string, unknown>,
  provider: CloudProvider,
  parentId: string,
  checksum: string,
  sizeBytes: number,
) {
  if (row.provider !== provider || row.external_parent_id !== parentId
    || typeof row.external_file_id !== 'string' || row.checksum_sha256 !== checksum) {
    throw new Error('REPORT_ARTIFACT_PROVIDER_READBACK_FAILED')
  }
  const reference = { provider, external_file_id: row.external_file_id }
  const metadata = await storage.getMetadata(reference)
  if (metadata.kind !== 'file' || metadata.trashed === true || !metadata.parent_ids?.includes(parentId)) {
    throw new Error('REPORT_ARTIFACT_PROVIDER_READBACK_FAILED')
  }
  const bytes = await storage.read(reference)
  if (bytes.byteLength !== sizeBytes || createHash('sha256').update(bytes).digest('hex') !== checksum) {
    throw new Error('REPORT_ARTIFACT_PROVIDER_READBACK_FAILED')
  }
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
  routingMode: OperationalStorageRoutingMode
  domainRouteResolver: Pick<OperationalStorageDomainRouteRepository, 'resolveDomainCategoryPlacement' | 'resolveReportArtifactGroupPlacement'>
  artifactGroup: ReportArtifactGroup
  routeResolver: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  materializeFolders: (placement: OperationalStoragePlacement) => Promise<string>
}) {
  const checksum = createHash('sha256').update(input.bytes).digest('hex')
  const storageName = providerStorageFileName(
    input.shift.date,
    input.logicalCategory,
    input.originalName,
    input.bytes,
  )
  const placement = input.routingMode === 'domain_first' && input.provider === 'google_drive'
    ? await input.domainRouteResolver.resolveReportArtifactGroupPlacement({
      group: input.artifactGroup,
      shiftId: input.shift.id,
      shiftDate: input.shift.date,
      brandId: input.shift.brand_id,
      platformId: input.shift.platform_id,
      agencyCode: input.shift.agency_code ?? null,
      executionSource: input.shift.execution_source ?? null,
      fileName: storageName,
    })
    : await input.routeResolver.resolvePlacement(routedPlacementInput(
      input.provider,
      input.shift,
      input.logicalCategory,
      storageName,
    ))
  if (input.routingMode === 'domain_first' && input.provider === 'google_drive'
    && !canWriteOperationalStoragePlacement(placement.accessClassification ?? '', placement.sensitive ?? false)) {
    throw new Error('REPORT_ARTIFACT_CONFIDENTIAL_STORAGE_NOT_APPROVED')
  }
  const parentId = await input.materializeFolders(placement)
  const logicalPath = [placement.folderPath, placement.fileName].filter(Boolean).join('/')

  const existing = await findExisting(
    input.client,
    input.report.id,
    input.logicalCategory,
    input.artifactKey,
  )
  if (existing) {
    if (typeof existing.id !== 'string' || await artifactHasDeletion(input.client, existing.id)) {
      throw new Error('REPORT_ARTIFACT_DELETE_IN_PROGRESS')
    }
    if (existing.provider !== input.provider) throw new Error('REPORT_ARTIFACT_PROVIDER_CONFLICT')
    await verifyProviderArtifact(input.storage, existing, input.provider, parentId, checksum, input.bytes.byteLength)
    return publicArtifact(existing)
  }

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

  try {
    await verifyProviderArtifact(input.storage, {
      provider: uploaded.asset.provider,
      external_file_id: uploaded.asset.external_file_id,
      external_parent_id: uploaded.asset.external_parent_id,
      checksum_sha256: checksum,
    }, input.provider, parentId, checksum, input.bytes.byteLength)
  } catch {
    try { await input.storage.delete({ provider: input.provider, external_file_id: uploaded.asset.external_file_id }) }
    catch { console.error('REPORT_ARTIFACT_UPLOAD_CLEANUP_FAILED') }
    throw new Error('REPORT_ARTIFACT_PROVIDER_READBACK_FAILED')
  }

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
  if (winner) {
    if (winner.provider !== input.provider) throw new Error('REPORT_ARTIFACT_PROVIDER_CONFLICT')
    if (winner.external_file_id === uploaded.asset.external_file_id) {
      await verifyProviderArtifact(input.storage, winner, input.provider, parentId, checksum, input.bytes.byteLength)
      return publicArtifact(winner)
    }
    try { await input.storage.delete({ provider: input.provider, external_file_id: uploaded.asset.external_file_id }) }
    catch { console.error('REPORT_ARTIFACT_UPLOAD_CLEANUP_FAILED') }
    return publicArtifact(winner)
  }
  try { await input.storage.delete({ provider: input.provider, external_file_id: uploaded.asset.external_file_id }) }
  catch { console.error('REPORT_ARTIFACT_UPLOAD_CLEANUP_FAILED') }
  throw inserted.error || new Error('REPORT_ARTIFACT_METADATA_PERSIST_FAILED')
}

export function createReportArtifactRouteHandler(dependencies: {
  resolveUser?: ServerUserResolver
  createClient?: () => SupabaseClient
  createScopeClient?: () => Promise<Pick<SupabaseClient, 'rpc'>>
  storage?: StorageGateway
  routeResolver?: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  domainRouteResolver?: Pick<OperationalStorageDomainRouteRepository, 'resolveDomainCategoryPlacement' | 'resolveReportArtifactGroupPlacement'>
  materializeFolders?: (placement: OperationalStoragePlacement) => Promise<string>
  routingMode?: OperationalStorageRoutingMode
} = {}) {
  const clientFactory = dependencies.createClient || createSupabaseAdminClient
  const createScopeClient = dependencies.createScopeClient || (async () => (await import('@/lib/supabase/server')).createClient())
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
  let defaultDomainRouteResolver: OperationalStorageDomainRouteRepository | undefined
  const domainRouteResolver = dependencies.domainRouteResolver || {
    resolveDomainCategoryPlacement: (category: Parameters<OperationalStorageDomainRouteRepository['resolveDomainCategoryPlacement']>[0], fileName: string) => {
      defaultDomainRouteResolver ??= createOperationalStorageDomainRouteRepository()
      return defaultDomainRouteResolver.resolveDomainCategoryPlacement(category, fileName)
    },
    resolveReportArtifactGroupPlacement: (input: Parameters<OperationalStorageDomainRouteRepository['resolveReportArtifactGroupPlacement']>[0]) => {
      defaultDomainRouteResolver ??= createOperationalStorageDomainRouteRepository()
      return defaultDomainRouteResolver.resolveReportArtifactGroupPlacement(input)
    },
  }
  const materializeFolders = dependencies.materializeFolders
    || createOperationalStorageFolderMaterializer(
      (parentId, name, provider) => storage.ensureFolder(parentId, name, provider),
      (id, provider) => storage.getMetadata(id, provider),
    )

  return {
    async GET(request: Request) {
      try {
        const user = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
        const params = new URL(request.url).searchParams
        const client = clientFactory()
        const fileId = params.get('file_id')?.trim()
        if (fileId) {
          if (user.systemPermission === 'leader') {
            return errorResponse('REPORT_EXPORT_SCOPE_UNAVAILABLE', 'Leader Brand scope is not configured.', 403)
          }
          const fileResult = await client.from('stored_files')
            .select('*')
            .eq('id', fileId)
            .is('deleted_at', null)
            .maybeSingle()
          if (fileResult.error) throw fileResult.error
          if (!fileResult.data) return errorResponse('REPORT_ARTIFACT_NOT_FOUND', 'The report artifact was not found.', 404)
          const row = fileResult.data as Record<string, unknown>
          if (row.logical_category === 'data_report') {
            const exportUser = await requirePermission(request, 'reports.export', dependencies.resolveUser)
            if (exportUser.systemPermission !== 'admin' || exportUser.id !== user.id) {
              return errorResponse('REPORT_EXPORT_SCOPE_UNAVAILABLE', 'Leader Brand scope is not configured.', 403)
            }
          }
          await reportContext(client, String(row.report_id), user, routingMode, createScopeClient)
          if (typeof row.id !== 'string' || await artifactHasDeletion(client, row.id)) {
            return errorResponse('REPORT_ARTIFACT_NOT_FOUND', 'The report artifact was not found.', 404)
          }
          const provider = row.provider
          const externalFileId = row.external_file_id
          if ((provider !== 'google_drive' && provider !== 'onedrive') || typeof externalFileId !== 'string') {
            return errorResponse('REPORT_ARTIFACT_REFERENCE_INVALID', 'The report artifact reference is invalid.', 409)
          }
          const reference = { provider: provider as CloudProvider, external_file_id: externalFileId }
          const metadata = await storage.getMetadata(reference)
          if (metadata.kind !== 'file' || metadata.trashed === true || (typeof row.external_parent_id === 'string'
            && !metadata.parent_ids?.includes(row.external_parent_id))) {
            return errorResponse('REPORT_ARTIFACT_REFERENCE_STALE', 'The report artifact is no longer in its recorded Drive folder.', 409)
          }
          const bytes = await storage.read(reference)
          if ((typeof row.size_bytes === 'number' && bytes.byteLength !== row.size_bytes)
            || (typeof row.checksum_sha256 === 'string'
              && createHash('sha256').update(bytes).digest('hex') !== row.checksum_sha256)) {
            return errorResponse('REPORT_ARTIFACT_READBACK_MISMATCH', 'The report artifact failed its stored integrity check.', 502)
          }
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
        if (user.systemPermission === 'leader') {
          return errorResponse('REPORT_EXPORT_SCOPE_UNAVAILABLE', 'Leader Brand scope is not configured.', 403)
        }
        await reportContext(client, reportId, user, routingMode, createScopeClient)
        const result = await client.from('stored_files')
          .select('*')
          .eq('report_id', reportId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
        if (result.error) throw result.error
        const rows = (result.data ?? []) as Record<string, unknown>[]
        const ids = rows.map(row => row.id).filter((id): id is string => typeof id === 'string')
        const deletions = ids.length
          ? await client.from('rc19_report_artifact_deletions').select('stored_file_id').in('stored_file_id', ids)
          : { data: [], error: null }
        if (deletions.error) throw deletions.error
        const hidden = new Set((deletions.data ?? []).map(row => row.stored_file_id))
        return Response.json({
          ok: true,
          files: rows.filter(row => typeof row.id === 'string' && !hidden.has(row.id)).map(publicArtifact),
        }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        const code = error instanceof Error ? error.message : ''
        if (code === 'REPORT_PERMISSION_DENIED' || code === 'REPORT_NOT_FOUND' || code === 'REPORT_SHIFT_CONTEXT_NOT_FOUND') {
          return errorResponse('REPORT_ARTIFACT_NOT_FOUND', 'The report artifact was not found.', 404)
        }
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
            artifact_group: typeof form.get('artifact_group') === 'string' ? form.get('artifact_group') : undefined,
          })
          const file = form.get('file')
          if (!parsed.success || !(file instanceof Blob)) {
            return errorResponse('REPORT_ARTIFACT_REQUEST_INVALID', 'The source file request is invalid.', 400)
          }

          const { report, shift } = await reportContext(client, parsed.data.report_id, user, routingMode, createScopeClient)
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
            routingMode,
            domainRouteResolver,
            artifactGroup: parsed.data.artifact_group ?? 'metrics_snapshot',
            routeResolver,
            materializeFolders,
          })
          return Response.json({ ok: true, file: artifact }, { headers: { 'Cache-Control': 'no-store' } })
        }

        const parsed = generateFields.safeParse(await readJsonBody(request, 16 * 1024))
        if (!parsed.success) {
          return errorResponse('REPORT_ARTIFACT_REQUEST_INVALID', 'The report artifact request is invalid.', 400)
        }

        const exportUser = await requirePermission(request, 'reports.export', dependencies.resolveUser)
        if (exportUser.systemPermission !== 'admin' || exportUser.id !== user.id) {
          return errorResponse('REPORT_EXPORT_SCOPE_UNAVAILABLE', 'Leader Brand scope is not configured.', 403)
        }

        const { report, shift } = await reportContext(client, parsed.data.report_id, user, routingMode, createScopeClient)
        if (!report.metrics_confirmed || report.status !== 'confirmed') {
          return errorResponse('REPORT_NOT_CONFIRMED', 'Confirm the report before generating its data report file.', 409)
        }
        const version = report.version_number ?? 0
        const context = await workbookContext(client, report, shift)
        const bytes = addFinalInsights(buildReportDetailWorkbookBytes(report, context), report)
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
          routingMode,
          domainRouteResolver,
          artifactGroup: parsed.data.artifact_group ?? 'final_report_insights',
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
        if (code === 'REPORT_ARTIFACT_CONFIDENTIAL_STORAGE_NOT_APPROVED') {
          return errorResponse(code, 'Report artifacts require a restricted Drive destination.', 423)
        }
        if (code === 'REPORT_PERMISSION_DENIED' || code === 'REPORT_NOT_FOUND' || code === 'REPORT_SHIFT_CONTEXT_NOT_FOUND') {
          return errorResponse('REPORT_ARTIFACT_NOT_FOUND', 'The report artifact was not found.', 404)
        }
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
          .maybeSingle()
        if (result.error) throw result.error
        if (!result.data) return errorResponse('REPORT_ARTIFACT_NOT_FOUND', 'The report artifact was not found.', 404)
        const row = result.data as Record<string, unknown>
        const { report, shift } = await reportContext(client, String(row.report_id), user, routingMode, createScopeClient)
        if (row.shift_id !== report.shift_id) {
          return errorResponse('REPORT_ARTIFACT_REFERENCE_INVALID', 'The report artifact reference is invalid.', 409)
        }
        if (report.metrics_confirmed || report.status === 'confirmed') {
          return errorResponse('REPORT_CONFIRMED', 'Reopen the confirmed report before deleting report data files.', 409)
        }
        if (user.systemPermission === 'member' && row.uploaded_by !== user.businessUserId) {
          return errorResponse('PERMISSION_DENIED', 'You can only remove files that you uploaded.', 403)
        }
        const actionUser = await requirePermission(request,
          user.systemPermission === 'member' ? 'storage.edit_own' : 'storage.delete', dependencies.resolveUser)
        if (actionUser.id !== user.id || actionUser.businessUserId !== user.businessUserId
          || actionUser.systemPermission !== user.systemPermission) {
          return errorResponse('PERMISSION_DENIED', 'You do not have permission to remove this file.', 403)
        }
        const provider = row.provider
        const externalFileId = row.external_file_id
        const parentId = row.external_parent_id
        if ((provider !== 'google_drive' && provider !== 'onedrive') || typeof externalFileId !== 'string'
          || !externalFileId.trim()) {
          return errorResponse('REPORT_ARTIFACT_REFERENCE_INVALID', 'The report artifact reference is invalid.', 409)
        }

        const leaseOwner = randomUUID()
        const scopeClient = await createScopeClient()
        const claim = await scopeClient.rpc('rc19_claim_report_artifact_deletion', {
          p_file_id: parsed.data.file_id, p_lease_owner: leaseOwner,
        })
        if (claim.error || !claim.data || typeof claim.data !== 'object') {
          return errorResponse('REPORT_ARTIFACT_DELETE_AUTHORIZATION_FAILED', 'The report artifact could not be deleted.', 403)
        }
        const operation = claim.data as Record<string, unknown>
        if (operation.status === 'completed') return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        if (operation.status === 'in_progress') {
          return errorResponse('REPORT_ARTIFACT_DELETE_IN_PROGRESS', 'Deletion is already in progress.', 409)
        }
        if (operation.status === 'retryable_failure') {
          return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 409)
        }
        if (typeof parentId !== 'string' || !parentId.trim()) {
          if (operation.status === 'manual_review' && user.systemPermission === 'admin'
            && user.businessUserId && provider === 'google_drive' && routingMode === 'domain_first'
            && typeof operation.operation_id === 'string' && typeof operation.fencing_version === 'number') {
            const verifiedParent = await verifyLegacyReportParent(storage, domainRouteResolver, row, shift)
            if (verifiedParent) {
              const latest = await requirePermission(request, 'storage.delete', dependencies.resolveUser)
              const latestSubmit = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
              if (latest.id === user.id && latest.businessUserId === user.businessUserId && latest.systemPermission === 'admin'
                && latestSubmit.id === user.id && latestSubmit.businessUserId === user.businessUserId
                && latestSubmit.systemPermission === 'admin') {
                const { report: verifiedReport } = await reportContext(client, String(row.report_id), user, routingMode, createScopeClient)
                if (verifiedReport.shift_id === row.shift_id && !verifiedReport.metrics_confirmed && verifiedReport.status !== 'confirmed') {
                  const backfill = await client.rpc('rc19_backfill_report_artifact_parent', {
                    p_operation_id: operation.operation_id, p_fencing_version: operation.fencing_version,
                    p_provider: provider, p_external_file_id: externalFileId, p_external_parent_id: verifiedParent,
                    p_actor_business_user_id: user.businessUserId,
                  })
                  if (!backfill.error && backfill.data === 'retryable_failure') {
                    return errorResponse('REPORT_ARTIFACT_PARENT_VERIFIED_RETRY', 'The storage reference was verified; retry deletion.', 409)
                  }
                }
              }
            }
          }
          return errorResponse('REPORT_ARTIFACT_LEGACY_REVIEW_REQUIRED', 'The report artifact requires storage verification.', 409)
        }
        if (typeof operation.operation_id !== 'string' || typeof operation.lease_owner !== 'string'
          || typeof operation.fencing_version !== 'number' || operation.provider !== provider
          || operation.external_file_id !== externalFileId || operation.external_parent_id !== parentId) {
          return errorResponse('REPORT_ARTIFACT_REFERENCE_INVALID', 'The report artifact reference is invalid.', 409)
        }
        const operationArgs = { p_operation_id: operation.operation_id, p_lease_owner: operation.lease_owner,
          p_fencing_version: operation.fencing_version }
        if (operation.status === 'manual_review') {
          if (user.systemPermission !== 'admin' || !user.businessUserId || provider !== 'google_drive') {
            return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 409)
          }
          const observed = await storage.getMetadata({ provider, external_file_id: externalFileId })
          if (observed.id !== externalFileId || observed.kind !== 'file' || observed.trashed !== true
            || !observed.parent_ids?.includes(parentId)) {
            return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 409)
          }
          const latest = await requirePermission(request, 'storage.delete', dependencies.resolveUser)
          const latestSubmit = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
          if (latest.id !== user.id || latest.businessUserId !== user.businessUserId || latest.systemPermission !== 'admin') {
            return errorResponse('PERMISSION_DENIED', 'You do not have permission to remove this file.', 403)
          }
          if (latestSubmit.id !== user.id || latestSubmit.businessUserId !== user.businessUserId
            || latestSubmit.systemPermission !== 'admin') {
            return errorResponse('PERMISSION_DENIED', 'You do not have permission to remove this file.', 403)
          }
          const { report: latestReport } = await reportContext(client, String(row.report_id), user, routingMode, createScopeClient)
          if (latestReport.shift_id !== row.shift_id || latestReport.metrics_confirmed || latestReport.status === 'confirmed') {
            return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 409)
          }
          const reconciled = await client.rpc('rc19_reconcile_report_artifact_deleted', {
            ...operationArgs, p_provider: provider, p_external_file_id: externalFileId, p_external_parent_id: parentId,
            p_actor_business_user_id: user.businessUserId,
          })
          if (reconciled.error || reconciled.data !== 'provider_deleted') {
            return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 409)
          }
          const finalized = await client.rpc('rc19_finalize_report_artifact_deletion', operationArgs)
          if (finalized.error || finalized.data !== 'completed') {
            return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 502)
          }
          return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        }
        if (operation.status === 'provider_deleted') {
          const finalized = await client.rpc('rc19_finalize_report_artifact_deletion', operationArgs)
          if (finalized.error || finalized.data !== 'completed') {
            return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 502)
          }
          return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        }
        if (operation.status !== 'pending' || operation.lease_owner !== leaseOwner) {
          return errorResponse('REPORT_ARTIFACT_DELETE_IN_PROGRESS', 'Deletion is already in progress.', 409)
        }
        const releaseClaim = async (needsReview: boolean) => {
          await scopeClient.rpc('rc19_release_report_artifact_delete_claim', { ...operationArgs, p_needs_review: needsReview })
        }
        let metadata: Awaited<ReturnType<StorageGateway['getMetadata']>>
        try {
          metadata = await storage.getMetadata({ provider, external_file_id: externalFileId })
        } catch (error) {
          await releaseClaim(false)
          throw error
        }
        if (metadata.id !== externalFileId || metadata.kind !== 'file' || metadata.trashed === true
          || !metadata.parent_ids?.includes(parentId)) {
          await releaseClaim(true)
          return errorResponse('REPORT_ARTIFACT_REFERENCE_STALE', 'The report artifact is no longer in its recorded folder.', 409)
        }
        let latestReport: Report
        try {
          ;({ report: latestReport } = await reportContext(client, String(row.report_id), user, routingMode, createScopeClient))
        } catch (error) {
          await releaseClaim(false)
          throw error
        }
        if (latestReport.shift_id !== row.shift_id) {
          await releaseClaim(true)
          return errorResponse('REPORT_ARTIFACT_REFERENCE_INVALID', 'The report artifact reference is invalid.', 409)
        }
        if (latestReport.metrics_confirmed || latestReport.status === 'confirmed') {
          await releaseClaim(false)
          return errorResponse('REPORT_CONFIRMED', 'Reopen the confirmed report before deleting report data files.', 409)
        }
        let latestSubmit: AuthenticatedServerUser
        let latestUser: AuthenticatedServerUser
        try {
          latestSubmit = await requirePermission(request, 'reports.submit', dependencies.resolveUser)
          latestUser = await requirePermission(request,
            user.systemPermission === 'member' ? 'storage.edit_own' : 'storage.delete', dependencies.resolveUser)
        } catch (error) {
          await releaseClaim(false)
          throw error
        }
        if (latestSubmit.id !== user.id || latestSubmit.businessUserId !== user.businessUserId
          || latestSubmit.systemPermission !== user.systemPermission
          || latestUser.id !== user.id || latestUser.businessUserId !== user.businessUserId
          || latestUser.systemPermission !== user.systemPermission) {
          await releaseClaim(false)
          return errorResponse('PERMISSION_DENIED', 'You do not have permission to remove this file.', 403)
        }
        const begun = await scopeClient.rpc('rc19_begin_report_artifact_deletion', operationArgs)
        if (begun.error || !begun.data || typeof begun.data !== 'object') {
          await releaseClaim(false)
          return errorResponse('REPORT_ARTIFACT_DELETE_CLAIM_INVALID', 'The deletion claim is no longer valid.', 409)
        }
        const authorized = begun.data as Record<string, unknown>
        if (authorized.operation_id !== operation.operation_id || authorized.provider !== provider
          || authorized.external_file_id !== externalFileId || authorized.external_parent_id !== parentId) {
          await client.rpc('rc19_record_report_artifact_delete_outcome', { ...operationArgs, p_success: false })
          return errorResponse('REPORT_ARTIFACT_REFERENCE_INVALID', 'The report artifact reference is invalid.', 409)
        }
        try {
          await storage.delete({ provider, external_file_id: externalFileId })
        } catch {
          await client.rpc('rc19_record_report_artifact_delete_outcome', { ...operationArgs, p_success: false })
          return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 502)
        }
        const outcome = await client.rpc('rc19_record_report_artifact_delete_outcome', { ...operationArgs, p_success: true })
        if (outcome.error || outcome.data !== 'provider_deleted') {
          return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 502)
        }
        const finalized = await client.rpc('rc19_finalize_report_artifact_deletion', operationArgs)
        if (finalized.error || finalized.data !== 'completed') {
          return errorResponse('REPORT_ARTIFACT_DELETE_RECONCILIATION_REQUIRED', 'Deletion requires reconciliation.', 502)
        }
        return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return errorResponse(error.code, error.message, error.status)
        const code = error instanceof Error ? error.message : ''
        if (code === 'REPORT_PERMISSION_DENIED' || code === 'REPORT_NOT_FOUND' || code === 'REPORT_SHIFT_CONTEXT_NOT_FOUND') {
          return errorResponse('REPORT_ARTIFACT_NOT_FOUND', 'The report artifact was not found.', 404)
        }
        return errorResponse('REPORT_ARTIFACT_DELETE_FAILED', 'The report data file could not be deleted.', 502)
      }
    },
  }
}

export type { StoredFileArtifact }
