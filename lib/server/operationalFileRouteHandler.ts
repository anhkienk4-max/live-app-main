import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { MAX_FILE_NAME_LENGTH, sanitizeFileName, sanitizeFileNameWithoutLengthLimit } from '@/lib/files/fileValidation'
import {
  MAX_OPERATIONAL_FILE_BYTES,
  OPERATIONAL_FILE_CATEGORIES,
  OPERATIONAL_FILE_CATEGORY_LABELS,
  resolveOperationalFileMime,
  type OperationalFileCategory,
} from '@/lib/files/operationalFileCatalog'
import { resolveOperationalFilePlacement, toOperationalFileRouteInput } from '@/lib/files/operationalFilePlacement'
import { OperationalStoragePlacementError, type OperationalStoragePlacement } from '@/lib/files/operationalStoragePlacementResolver'
import { createOperationalStorageRouteRepository, type OperationalStorageRouteRepository } from '@/lib/server/operationalStorageRouteRepository'
import { createStaticOperationalStorageRouteRepository } from '@/lib/server/staticOperationalStorageRouteRepository'
import { resolveOperationalStorageRoutingMode, type OperationalStorageRoutingMode } from '@/lib/server/operationalStorageRoutingMode'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { fileStorageService, createFileStorageService } from '@/lib/services/fileStorageService'
import { requireRole, authorizationErrorResponse, isAuthorizationError, type ServerUserResolver } from '@/lib/server/authGuards'
import { readFormDataBody, readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { loadOperationalSystemExport, encodeOperationalSystemExport } from '@/lib/server/operationalSystemExport'

type Provider = 'google_drive' | 'onedrive'
type StorageGateway = Pick<ReturnType<typeof createFileStorageService>, 'upload' | 'read' | 'delete' | 'ensureFolder' | 'getMetadata' | 'getViewUrl'>
type ScopeInput = {
  shift_id?: string
  campaign_id?: string
  brand_id?: string
  platform_id?: string
  period_date?: string
  execution_source?: 'internal' | 'agency'
  provider?: Provider
}
type ResolvedScope = {
  scope_key: string
  shift_id: string | null
  campaign_id: string | null
  brand_id: string
  platform_id: string
  period_date: string
  execution_source: 'internal' | 'agency'
  brand_label: string
  platform_label: string
}

const scopeFields = z.object({
  shift_id: z.string().min(1).max(120).optional(),
  campaign_id: z.string().min(1).max(120).optional(),
  brand_id: z.string().min(1).max(120).optional(),
  platform_id: z.string().min(1).max(120).optional(),
  period_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  execution_source: z.enum(['internal', 'agency']).optional(),
  provider: z.enum(['google_drive', 'onedrive']).optional(),
}).strict()

const restrictedCategories = new Set(['payment_document', 'system_export'])
// Operator must review the provider/root ACL and approve confidential writes
// separately. Admin RBAC alone does not secure provider links.
const confidentialWriteCategories = new Set(['payment_document', 'system_export'])

const removeFields = z.object({ file_id: z.string().min(1).max(120) }).strict()
const folderFields = scopeFields.extend({
  action: z.literal('prepare_folder'),
  category: z.enum(OPERATIONAL_FILE_CATEGORIES as [OperationalFileCategory, ...OperationalFileCategory[]]),
}).strict()
const generateExportFields = scopeFields.extend({
  action: z.literal('generate_system_export'),
  brand_id: z.string().min(1).max(120),
  platform_id: z.string().min(1).max(120),
  period_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  execution_source: z.enum(['internal', 'agency']),
}).strict()
const attachFields = scopeFields.extend({
  action: z.literal('attach_existing'),
  category: z.enum(OPERATIONAL_FILE_CATEGORIES as [OperationalFileCategory, ...OperationalFileCategory[]]),
  external_file_id: z.string().trim().min(1).max(512),
}).strict()


function errorResponse(code: string, status = 400) {
  return Response.json({ ok: false, error: { code } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

function cleanCategory(value: unknown): OperationalFileCategory {
  if (typeof value !== 'string' || !OPERATIONAL_FILE_CATEGORIES.includes(value as OperationalFileCategory)) {
    throw new Error('OPERATIONAL_FILE_CATEGORY_INVALID')
  }
  return value as OperationalFileCategory
}

function safeName(name: string, category: string, date: string, checksum: string) {
  const original = sanitizeFileNameWithoutLengthLimit(name)
  const prefix = date.replaceAll('-', '') + '_' + category + '_' + checksum.slice(0, 16)
  const budget = MAX_FILE_NAME_LENGTH - prefix.length - 1
  if (budget < 12) throw new Error('OPERATIONAL_FILE_NAME_INVALID')
  const dot = original.lastIndexOf('.')
  const ext = dot > 0 ? original.slice(dot) : ''
  if (ext.length >= budget) throw new Error('OPERATIONAL_FILE_NAME_INVALID')
  const stem = dot > 0 ? original.slice(0, dot) : original
  return sanitizeFileName(prefix + '_' + stem.slice(0, budget - ext.length).replace(/[. ]+$/u, '') + ext)
}

function publicFile(row: Record<string, unknown>) {
  return {
    id: row.id, category: row.category,
    folder_path: row.folder_path, file_name: row.file_name,
    size_bytes: row.size_bytes, mime_type: row.mime_type,
    checksum_sha256: row.checksum_sha256, created_at: row.created_at,
    scope_key: row.scope_key, provider: row.provider,
    access_url: '/api/operational-files?file_id=' + encodeURIComponent(String(row.id)),
  }
}

async function scopeFromInput(client: SupabaseClient, input: ScopeInput): Promise<ResolvedScope> {
  if (input.shift_id && input.campaign_id) {
    throw new Error('OPERATIONAL_FILE_SCOPE_MISMATCH')
  }
  let campaign: Record<string, unknown> | null = null
  if (input.campaign_id) {
    const result = await client.from('campaigns')
      .select('id,brand_id,start_date,end_date,platform_source,platform_ids')
      .eq('id', input.campaign_id).is('deleted_at', null).maybeSingle()
    if (result.error) throw new Error('OPERATIONAL_FILE_SCOPE_LOOKUP_FAILED')
    if (!result.data) throw new Error('OPERATIONAL_FILE_CAMPAIGN_NOT_FOUND')
    campaign = result.data as Record<string, unknown>
    if (input.brand_id && input.brand_id !== campaign.brand_id) {
      throw new Error('OPERATIONAL_FILE_SCOPE_MISMATCH')
    }
    if (!input.platform_id || !input.period_date || !input.execution_source) {
      throw new Error('OPERATIONAL_FILE_SCOPE_INVALID')
    }
    if (typeof campaign.start_date !== 'string' || typeof campaign.end_date !== 'string'
      || input.period_date < campaign.start_date || input.period_date > campaign.end_date) {
      throw new Error('OPERATIONAL_FILE_CAMPAIGN_DATE_MISMATCH')
    }
  }
  let shift: Record<string, unknown> | null = null
  if (input.shift_id) {
    const result = await client.from('shifts').select('id,brand_id,platform_id,date,execution_source')
      .eq('id', input.shift_id).is('deleted_at', null).maybeSingle()
    if (result.error) throw new Error('OPERATIONAL_FILE_SCOPE_LOOKUP_FAILED')
    if (!result.data) throw new Error('OPERATIONAL_FILE_SHIFT_NOT_FOUND')
    shift = result.data as Record<string, unknown>
    if ((input.brand_id && input.brand_id !== shift.brand_id)
      || (input.platform_id && input.platform_id !== shift.platform_id)
      || (input.period_date && input.period_date !== shift.date)
      || (input.execution_source && input.execution_source !== shift.execution_source)) {
      throw new Error('OPERATIONAL_FILE_SCOPE_MISMATCH')
    }
  }

  const brandId = shift ? shift.brand_id : (campaign ? campaign.brand_id : input.brand_id)
  const platformId = shift ? shift.platform_id : input.platform_id
  const periodDate = shift ? shift.date : input.period_date
  const executionSource = shift ? shift.execution_source : input.execution_source

  if (typeof brandId !== 'string' || typeof platformId !== 'string'
      || typeof periodDate !== 'string'
      || (executionSource !== 'internal' && executionSource !== 'agency')) {
    throw new Error('OPERATIONAL_FILE_SCOPE_INVALID')
  }

  const date = new Date(periodDate + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(periodDate)
    || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== periodDate) {
    throw new Error('OPERATIONAL_FILE_DATE_INVALID')
  }

  const [brand, platform] = await Promise.all([
    client.from('brands').select('id,name').eq('id', brandId).is('deleted_at', null).maybeSingle(),
    client.from('platforms').select('id,name').eq('id', platformId).is('deleted_at', null).maybeSingle(),
  ])
  if (brand.error || platform.error) throw new Error('OPERATIONAL_FILE_SCOPE_LOOKUP_FAILED')
  if (!brand.data || !platform.data) throw new Error('OPERATIONAL_FILE_SCOPE_INVALID')
  if (campaign) {
    const allowedIds = Array.isArray(campaign.platform_ids)
      ? campaign.platform_ids.filter((id): id is string => typeof id === 'string') : []
    const platformSource = typeof campaign.platform_source === 'string'
      ? campaign.platform_source.trim().toLowerCase() : ''
    if ((allowedIds.length > 0 && !allowedIds.includes(platformId))
      || (allowedIds.length === 0 && platformSource && platformSource !== String(platform.data.name).trim().toLowerCase())) {
      throw new Error('OPERATIONAL_FILE_CAMPAIGN_PLATFORM_MISMATCH')
    }
  }

  const key = shift
    ? 'shift:' + String(shift.id)
    : campaign
      ? ['campaign', String(campaign.id), platformId, executionSource, periodDate].join(':')
      : ['period', brandId, platformId, executionSource, periodDate].join(':')
  return {
    scope_key: key,
    shift_id: shift ? String(shift.id) : null,
    campaign_id: campaign ? String(campaign.id) : null,
    brand_id: brandId,
    platform_id: platformId,
    period_date: periodDate,
    execution_source: executionSource,
    brand_label: String(brand.data.name),
    platform_label: String(platform.data.name),
  }
}

function fromQuery(params: URLSearchParams): ScopeInput {
  const raw: Record<string, string> = {}
  for (const key of ['shift_id', 'campaign_id', 'brand_id', 'platform_id', 'period_date', 'execution_source', 'provider']) {
    const value = params.get(key)
    if (value) raw[key] = value
  }
  return scopeFields.parse(raw)
}

async function loadFile(client: SupabaseClient, id: string) {
  const res = await client.from('operational_files').select('*')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (res.error) throw res.error
  return res.data as Record<string, unknown> | null
}

export function createOperationalFileRouteHandler(deps: {
  resolveUser?: ServerUserResolver
  createClient?: () => SupabaseClient
  storage?: StorageGateway
  routes?: Pick<OperationalStorageRouteRepository, 'resolvePlacement'>
  materializeFolders?: (placement: OperationalStoragePlacement) => Promise<string>
  routingMode?: OperationalStorageRoutingMode
  /** Injected for testing; Production requires explicit operator approval after ACL review. */
  allowConfidentialWrites?: () => boolean
} = {}) {
  const clientFactory = deps.createClient ?? createSupabaseAdminClient
  const storage = deps.storage ?? fileStorageService
  const routingMode = deps.routingMode ?? resolveOperationalStorageRoutingMode()
  const allowConfidentialWrites = deps.allowConfidentialWrites ??
    (() => process.env.STORAGE_CONFIDENTIAL_UPLOAD_APPROVED === 'true')
  const confidentialWriteBlocked = (category: string) =>
    confidentialWriteCategories.has(category) && !allowConfidentialWrites()
  let routeRepository: OperationalStorageRouteRepository | undefined
  const routes = deps.routes ?? {
    resolvePlacement(input: Parameters<OperationalStorageRouteRepository['resolvePlacement']>[0]) {
      routeRepository ??= routingMode === 'compat'
        ? createStaticOperationalStorageRouteRepository()
        : createOperationalStorageRouteRepository()
      return routeRepository.resolvePlacement(input)
    },
  }
  const materialize = deps.materializeFolders ?? createOperationalStorageFolderMaterializer(
    (parentId, name, provider) => storage.ensureFolder(parentId, name, provider),
  )

  async function resolveFolder(scope: ResolvedScope, category: OperationalFileCategory, provider: Provider, fileName: string) {
    const base = await routes.resolvePlacement(toOperationalFileRouteInput({
      provider, executionSource: scope.execution_source, brandId: scope.brand_id,
      platformId: scope.platform_id, subbrandKey: null, shiftDate: scope.period_date,
      fileName, brandLabel: scope.brand_label, platformLabel: scope.platform_label,
    }))
    const placement = resolveOperationalFilePlacement(base, category, {
      brandId: scope.brand_id, platformId: scope.platform_id,
      executionSource: scope.execution_source,
    })
    const parentId = await materialize(placement)
    return { placement, parentId }
  }

  async function run<T extends Response>(operation: () => Promise<T>): Promise<Response> {
    try { return await operation() } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) return errorResponse(error.code, error.status)
      if (error instanceof OperationalStoragePlacementError) return errorResponse(error.code, 409)
      if (error instanceof z.ZodError) return errorResponse('OPERATIONAL_FILE_REQUEST_INVALID')
      const code = error instanceof Error ? error.message : 'OPERATIONAL_FILE_FAILED'
      const known = code.startsWith('OPERATIONAL_FILE_') || code.startsWith('FILE_')
      const status = code.endsWith('NOT_FOUND') ? 404
        : code.endsWith('CONFLICT') || code.endsWith('MISMATCH') ? 409
        : code.endsWith('TOO_LARGE') ? 413
        : known ? 400 : 502
      if (!known) console.error('OPERATIONAL_FILE_GATEWAY_FAILED')
      return errorResponse(known ? code : 'OPERATIONAL_FILE_GATEWAY_FAILED', status)
    }
  }

  return {
    GET(request: Request) {
      return run(async () => {
        const actor = await requireRole(request, ['leader', 'admin'], deps.resolveUser)
        const params = new URL(request.url).searchParams
        const client = clientFactory()
        if (params.get('catalog') === '1') {
          const [brands, platforms, campaigns] = await Promise.all([
            client.from('brands').select('id,name').is('deleted_at', null).order('name', { ascending: true }),
            client.from('platforms').select('id,name').is('deleted_at', null).order('name', { ascending: true }),
            client.from('campaigns').select('id,name,brand_id,start_date,end_date,platform_ids,platform_source')
              .is('deleted_at', null).order('name', { ascending: true }),
          ])
          if (brands.error || platforms.error || campaigns.error) throw new Error('OPERATIONAL_FILE_SCOPE_LOOKUP_FAILED')
          return Response.json({
            ok: true,
            categories: OPERATIONAL_FILE_CATEGORIES.filter(id => actor.systemPermission === 'admin' || !restrictedCategories.has(id)).map(id => ({ id, label: OPERATIONAL_FILE_CATEGORY_LABELS[id] })),
            brands: brands.data ?? [], platforms: platforms.data ?? [], campaigns: campaigns.data ?? [],
            max_single_upload_bytes: MAX_OPERATIONAL_FILE_BYTES,
            confidential_write_ready: allowConfidentialWrites(),
          }, { headers: { 'Cache-Control': 'no-store' } })
        }

        const fileId = params.get('file_id')
        if (fileId) {
          const row = await loadFile(client, fileId)
          if (!row) return errorResponse('OPERATIONAL_FILE_NOT_FOUND', 404)
          if (restrictedCategories.has(String(row.category)) && actor.systemPermission !== 'admin') return errorResponse('PERMISSION_DENIED', 403)
          if ((row.provider !== 'google_drive' && row.provider !== 'onedrive') || typeof row.external_file_id !== 'string') {
            return errorResponse('OPERATIONAL_FILE_PROVIDER_INVALID', 409)
          }
          // Never buffer large videos in a serverless response. The authenticated
          // route delegates large downloads to the native provider viewer.
          if (Number(row.size_bytes) > 4 * 1024 * 1024 || String(row.mime_type).startsWith('application/vnd.google-apps.')) {
            const viewUrl = await storage.getViewUrl({
              provider: row.provider as Provider, external_file_id: row.external_file_id,
            })
            return Response.redirect(viewUrl, 302)
          }
          const bytes = await storage.read({
            provider: row.provider as Provider,
            external_file_id: row.external_file_id,
          })
          return new Response(bytes as BodyInit, {
            headers: {
              'Cache-Control': 'private, no-store',
              'Content-Type': String(row.mime_type),
              'Content-Disposition': 'attachment; filename="' + sanitizeFileName(row.file_name) + '"',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        }

        const scope = await scopeFromInput(client, fromQuery(params))
        const result = await client.from('operational_files').select('*')
          .eq('scope_key', scope.scope_key).is('deleted_at', null)
          .order('created_at', { ascending: false })
        if (result.error) throw result.error
        return Response.json({ ok: true, files: (result.data ?? []).filter(row => actor.systemPermission === 'admin' || !restrictedCategories.has(row.category)).map(row => publicFile(row as Record<string, unknown>)) },
          { headers: { 'Cache-Control': 'no-store' } })
      })
    },
    POST(request: Request) {
      return run(async () => {
        const actor = await requireRole(request, ['leader', 'admin'], deps.resolveUser)
        if ((request.headers.get('content-type') || '').includes('application/json')) {
          const raw = await readJsonBody(request, 16384)
          const generated = generateExportFields.safeParse(raw)
          if (generated.success) {
            if (actor.systemPermission !== 'admin') return errorResponse('PERMISSION_DENIED', 403)
            if (confidentialWriteBlocked('system_export')) {
              return errorResponse('OPERATIONAL_FILE_CONFIDENTIAL_STORAGE_NOT_APPROVED', 423)
            }
            const input = generated.data
            if (input.shift_id || input.campaign_id) return errorResponse('OPERATIONAL_FILE_EXPORT_SCOPE_INVALID', 400)
            const client = clientFactory()
            const scope = await scopeFromInput(client, input)
            const provider = input.provider ?? 'google_drive'
            const category = 'system_export' as const
            // Never export an unbounded full database. The snapshot is exact
            // brand/platform/day/execution-source and explicitly counts records.
            const bundle = await loadOperationalSystemExport(client, {
              brand_id: scope.brand_id, platform_id: scope.platform_id,
              period_date: scope.period_date, execution_source: scope.execution_source,
            })
            const bytes = encodeOperationalSystemExport(bundle)
            const checksum = createHash('sha256').update(bytes).digest('hex')
            const artifactKey = 'file:' + checksum
            const lookup = () => client.from('operational_files').select('*')
              .eq('scope_key', scope.scope_key).eq('category', category)
              .eq('artifact_key', artifactKey).is('deleted_at', null).maybeSingle()
            const previous = await lookup()
            if (previous.error) throw previous.error
            if (previous.data) {
              if (previous.data.provider !== provider) return errorResponse('OPERATIONAL_FILE_PROVIDER_CONFLICT', 409)
              return Response.json({ ok: true, file: publicFile(previous.data as Record<string, unknown>),
                counts: bundle.counts, reused: true }, { headers: { 'Cache-Control': 'no-store' } })
            }
            const name = safeName('operational_daily_snapshot.json', category, scope.period_date, checksum)
            const { placement, parentId } = await resolveFolder(scope, category, provider, name)
            const uploaded = await storage.upload({
              name: placement.fileName, mime_type: 'application/json',
              size_bytes: bytes.byteLength, checksum_sha256: checksum, content: bytes,
              entity_type: 'brand', entity_id: scope.brand_id,
              created_by: actor.businessUserId ?? actor.id,
              logical_path: [...placement.folderSegments, placement.fileName].join('/'),
              external_parent_id: parentId, destination: { provider },
            })
            const inserted = await client.from('operational_files').insert({
              scope_key: scope.scope_key, category,
              brand_id: scope.brand_id, platform_id: scope.platform_id,
              shift_id: null, campaign_id: null, period_date: scope.period_date,
              execution_source: scope.execution_source, provider,
              external_file_id: uploaded.asset.external_file_id, external_parent_id: parentId,
              provider_metadata: uploaded.asset.provider_metadata ?? {},
              folder_path: placement.folderPath, file_name: placement.fileName,
              mime_type: 'application/json', size_bytes: bytes.byteLength,
              checksum_sha256: checksum, integrity_status: 'sha256_verified',
              artifact_key: artifactKey, uploaded_by: actor.businessUserId ?? null,
            }).select('*').single()
            if (inserted.error || !inserted.data) {
              const winner = await lookup()
              if (!winner.error && winner.data && winner.data.provider === provider) {
                // Never delete an object we may share with the winning row.
                if (winner.data.external_file_id !== uploaded.asset.external_file_id) {
                  try { await storage.delete({ provider, external_file_id: uploaded.asset.external_file_id }) }
                  catch { console.error('OPERATIONAL_FILE_ORPHAN_CLEANUP_FAILED') }
                }
                return Response.json({ ok: true, file: publicFile(winner.data as Record<string, unknown>),
                  counts: bundle.counts, reused: true }, { headers: { 'Cache-Control': 'no-store' } })
              }
              try { await storage.delete({ provider, external_file_id: uploaded.asset.external_file_id }) }
              catch { console.error('OPERATIONAL_FILE_ORPHAN_CLEANUP_FAILED') }
              throw new Error('OPERATIONAL_FILE_METADATA_WRITE_FAILED')
            }
            return Response.json({ ok: true, file: publicFile(inserted.data as Record<string, unknown>),
              counts: bundle.counts, reused: false }, { headers: { 'Cache-Control': 'no-store' } })
          }
          const folder = folderFields.safeParse(raw)
          const linked = folder.success ? null : attachFields.safeParse(raw)
          if (!folder.success && !linked?.success) return errorResponse('OPERATIONAL_FILE_REQUEST_INVALID')
          const input = folder.success ? folder.data : linked!.data!
          const category = input.category
          if (restrictedCategories.has(category) && actor.systemPermission !== 'admin') {
            return errorResponse('PERMISSION_DENIED', 403)
          }
          if (!folder.success && confidentialWriteBlocked(category)) {
            return errorResponse('OPERATIONAL_FILE_CONFIDENTIAL_STORAGE_NOT_APPROVED', 423)
          }
          const client = clientFactory()
          const scope = await scopeFromInput(client, input)
          const provider = input.provider ?? 'google_drive'
          // Placement is derived server-side; arbitrary folder IDs are never accepted.
          const { placement, parentId } = await resolveFolder(scope, category, provider, 'provider-existing-file')
          if (folder.success) {
            const url = await storage.getViewUrl({ provider, external_file_id: parentId })
            return Response.json({ ok: true, folder_path: placement.folderPath, folder_url: url },
              { headers: { 'Cache-Control': 'no-store' } })
          }

          const fileId = linked!.data!.external_file_id
          const metadata = await storage.getMetadata({ provider, external_file_id: fileId })
          if (metadata.kind !== 'file' || !metadata.parent_ids?.includes(parentId)) {
            return errorResponse('OPERATIONAL_FILE_EXTERNAL_PARENT_MISMATCH', 409)
          }
          const mime = resolveOperationalFileMime(category, metadata.name, metadata.mime_type || '')
          const isNative = mime.startsWith('application/vnd.google-apps.')
          if (!isNative && (typeof metadata.size_bytes !== 'number' || metadata.size_bytes <= 0)) {
            return errorResponse('OPERATIONAL_FILE_PROVIDER_SIZE_UNKNOWN', 409)
          }
          const key = 'provider:' + provider + ':' + metadata.id
          const lookup = await client.from('operational_files').select('*')
            .eq('scope_key', scope.scope_key).eq('category', category)
            .eq('artifact_key', key).is('deleted_at', null).maybeSingle()
          if (lookup.error) throw lookup.error
          if (lookup.data) return Response.json({
            ok: true, file: publicFile(lookup.data as Record<string, unknown>), reused: true,
          }, { headers: { 'Cache-Control': 'no-store' } })

          const inserted = await client.from('operational_files').insert({
            scope_key: scope.scope_key, category,
            brand_id: scope.brand_id, platform_id: scope.platform_id,
            shift_id: scope.shift_id, campaign_id: scope.campaign_id, period_date: scope.period_date,
            execution_source: scope.execution_source, provider,
            external_file_id: metadata.id, external_parent_id: parentId,
            provider_metadata: metadata.provider_metadata ?? {},
            folder_path: placement.folderPath, file_name: sanitizeFileName(metadata.name),
            mime_type: mime, size_bytes: metadata.size_bytes ?? 0, checksum_sha256: null,
            integrity_status: 'provider_reference', artifact_key: key,
            uploaded_by: actor.businessUserId ?? null,
          }).select('*').single()
          if (inserted.error || !inserted.data) {
            // If two operators link the same object concurrently, return the winner.
            // Never delete a manually managed provider object on metadata conflicts.
            const winner = await client.from('operational_files').select('*')
              .eq('scope_key', scope.scope_key).eq('category', category)
              .eq('artifact_key', key).is('deleted_at', null).maybeSingle()
            if (!winner.error && winner.data && winner.data.provider === provider) {
              return Response.json({ ok: true, file: publicFile(winner.data as Record<string, unknown>), reused: true },
                { headers: { 'Cache-Control': 'no-store' } })
            }
            throw new Error('OPERATIONAL_FILE_METADATA_WRITE_FAILED')
          }
          return Response.json({ ok: true, file: publicFile(inserted.data as Record<string, unknown>), reused: false },
            { headers: { 'Cache-Control': 'no-store' } })
        }

        const form = await readFormDataBody(request, MAX_OPERATIONAL_FILE_BYTES + 4096)
        const payload = Object.fromEntries(['shift_id', 'campaign_id', 'brand_id', 'platform_id', 'period_date', 'execution_source', 'provider']
          .flatMap(key => {
            const value = form.get(key)
            return typeof value === 'string' && value ? [[key, value]] : []
          }))
        const parsed = scopeFields.parse(payload)
        const category = cleanCategory(form.get('category'))
        if (restrictedCategories.has(category) && actor.systemPermission !== 'admin') return errorResponse('PERMISSION_DENIED', 403)
        if (confidentialWriteBlocked(category)) {
          return errorResponse('OPERATIONAL_FILE_CONFIDENTIAL_STORAGE_NOT_APPROVED', 423)
        }
        const file = form.get('file')
        if (!(file instanceof File) || !file.name) return errorResponse('OPERATIONAL_FILE_REQUIRED')
        if (file.size < 1 || file.size > MAX_OPERATIONAL_FILE_BYTES) {
          return errorResponse('OPERATIONAL_FILE_TOO_LARGE', 413)
        }
        const mime = resolveOperationalFileMime(category, file.name, file.type)
        const bytes = new Uint8Array(await file.arrayBuffer())
        const checksum = createHash('sha256').update(bytes).digest('hex')
        const client = clientFactory()
        const scope = await scopeFromInput(client, parsed)
        const provider = parsed.provider ?? 'google_drive'
        const artifactKey = 'file:' + checksum

        const lookup = () => client.from('operational_files').select('*')
          .eq('scope_key', scope.scope_key).eq('category', category)
          .eq('artifact_key', artifactKey).is('deleted_at', null).maybeSingle()
        const previous = await lookup()
        if (previous.error) throw previous.error
        if (previous.data) {
          if (previous.data.provider !== provider) return errorResponse('OPERATIONAL_FILE_PROVIDER_CONFLICT', 409)
          return Response.json({ ok: true, file: publicFile(previous.data as Record<string, unknown>), reused: true },
            { headers: { 'Cache-Control': 'no-store' } })
        }

        const storageName = safeName(file.name, category, scope.period_date, checksum)
        const { placement, parentId } = await resolveFolder(scope, category, provider, storageName)
        const actorId = actor.businessUserId ?? actor.id
        const uploaded = await storage.upload({
          name: placement.fileName,
          mime_type: mime,
          size_bytes: bytes.byteLength,
          checksum_sha256: checksum,
          content: bytes,
          entity_type: scope.shift_id ? 'shift' : 'brand',
          entity_id: scope.shift_id ?? scope.brand_id,
          created_by: actorId,
          logical_path: [...placement.folderSegments, placement.fileName].join('/'),
          external_parent_id: parentId,
          destination: { provider },
        })
        const row = {
          scope_key: scope.scope_key,
          category,
          brand_id: scope.brand_id,
          platform_id: scope.platform_id,
          shift_id: scope.shift_id,
          campaign_id: scope.campaign_id,
          period_date: scope.period_date,
          execution_source: scope.execution_source,
          provider,
          external_file_id: uploaded.asset.external_file_id,
          external_parent_id: parentId,
          provider_metadata: uploaded.asset.provider_metadata ?? {},
          folder_path: placement.folderPath,
          file_name: placement.fileName,
          mime_type: mime,
          size_bytes: bytes.byteLength,
          checksum_sha256: checksum,
          integrity_status: 'sha256_verified',
          artifact_key: artifactKey,
          uploaded_by: actor.businessUserId ?? null,
        }
        const inserted = await client.from('operational_files').insert(row).select('*').single()
        if (inserted.error || !inserted.data) {
          const winner = await lookup()
          // A provider can deduplicate physical content and return the same
          // external ID as the winning metadata row. Never trash that ID.
          if (!winner.error && winner.data &&
            winner.data.provider === provider &&
            winner.data.external_file_id === uploaded.asset.external_file_id) {
            return Response.json({ ok: true, file: publicFile(winner.data as Record<string, unknown>), reused: true },
              { headers: { 'Cache-Control': 'no-store' } })
          }
          // Our newly uploaded object is not the winning row; clean it up.
          try { await storage.delete({ provider, external_file_id: uploaded.asset.external_file_id }) }
          catch { console.error('OPERATIONAL_FILE_ORPHAN_CLEANUP_FAILED') }
          if (!winner.error && winner.data && winner.data.provider === provider) {
            return Response.json({ ok: true, file: publicFile(winner.data as Record<string, unknown>), reused: true },
              { headers: { 'Cache-Control': 'no-store' } })
          }
          throw new Error('OPERATIONAL_FILE_METADATA_WRITE_FAILED')
        }
        return Response.json({ ok: true, file: publicFile(inserted.data as Record<string, unknown>), reused: false },
          { headers: { 'Cache-Control': 'no-store' } })
      })
    },
    DELETE(request: Request) {
      return run(async () => {
        const actor = await requireRole(request, ['leader', 'admin'], deps.resolveUser)
        const parsed = removeFields.parse(await readJsonBody(request, 4096))
        const client = clientFactory()
        const row = await loadFile(client, parsed.file_id)
        if (!row) return errorResponse('OPERATIONAL_FILE_NOT_FOUND', 404)
        if (restrictedCategories.has(String(row.category)) && actor.systemPermission !== 'admin') return errorResponse('PERMISSION_DENIED', 403)
        if ((row.provider !== 'google_drive' && row.provider !== 'onedrive') || typeof row.external_file_id !== 'string') {
          return errorResponse('OPERATIONAL_FILE_PROVIDER_INVALID', 409)
        }
        await storage.delete({ provider: row.provider as Provider, external_file_id: row.external_file_id })
        const result = await client.from('operational_files')
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', parsed.file_id).is('deleted_at', null).select('id').maybeSingle()
        if (result.error || !result.data) throw new Error('OPERATIONAL_FILE_METADATA_DELETE_FAILED')
        return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
      })
    },
  }
}
