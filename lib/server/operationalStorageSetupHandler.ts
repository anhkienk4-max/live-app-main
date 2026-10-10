import 'server-only'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FileProviderMetadata } from '@/lib/files/fileProvider'
import { authorizationErrorResponse, isAuthorizationError, requireRole, type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { fileStorageService } from '@/lib/services/fileStorageService'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

const id = z.string().trim().min(1).max(120)
const source = z.enum(['internal', 'agency'])
const routeInput = z.object({
  action: z.literal('register_route'),
  brand_id: id,
  platform_id: id,
  execution_source: source,
  root_folder_id: id,
  confirmation: z.literal('I_VERIFIED_PROVIDER_ROOT_AND_BRAND'),
}).strict()
const brandInput = z.object({
  action: z.literal('classify_brand_profile'),
  brand_id: id,
  storage_profile: z.literal('CANONICAL_V1'),
  confirmation: z.literal('I_VERIFIED_THIS_BRAND_USES_CANONICAL_FOLDERS'),
}).strict()
const shiftInput = z.object({
  action: z.literal('classify_shift'),
  shift_id: id,
  expected_version: z.number().int().min(1),
  execution_source: source,
  confirmation: z.literal('I_REVIEWED_THIS_SHIFT_SOURCE'),
}).strict()

type Source = z.infer<typeof source>
type ShiftUserRpc = (id: string, expectedVersion: number, source: Source) => Promise<{ error: { message: string; code?: string } | null; data: unknown }>
type FolderLookup = (id: string) => Promise<FileProviderMetadata>

function result(status: number, code: string) {
  return Response.json({ ok: false, error: { code } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

function fail(code: string): never {
  throw new Error(code)
}

export function createOperationalStorageSetupHandler(deps: {
  resolveUser?: ServerUserResolver
  createClient?: () => SupabaseClient
  getRoot?: () => string | undefined
  metadata?: FolderLookup
  updateShift?: ShiftUserRpc
} = {}) {
  const client = deps.createClient ?? createSupabaseAdminClient
  const configuredRoot = deps.getRoot ?? (() => process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID)
  const getMetadata = deps.metadata ?? ((fileId: string) =>
    fileStorageService.getMetadata({ provider: 'google_drive', external_file_id: fileId }))

  const updateShift = deps.updateShift ?? (async (shiftId: string, expectedVersion: number, executionSource: Source) => {
    // Business-user-scoped RPC retains the actor, status, and optimistic CAS rules.
    // Never mutate shifts through the admin service-role database client.
    const session = await createSessionClient()
    const reply = await session.rpc('update_shift', {
      p_shift_id: shiftId, p_patch: { execution_source: executionSource },
      p_confirm_impact: false, p_expected_version: expectedVersion,
    })
    return { data: reply.data, error: reply.error }
  })

  async function handle(work: () => Promise<Response>): Promise<Response> {
    try { return await work() }
    catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) return result(error.status, error.code)
      if (error instanceof z.ZodError) return result(400, 'STORAGE_SETUP_INVALID_REQUEST')
      const known = error instanceof Error && error.message.startsWith('STORAGE_SETUP_')
      if (!known) console.error('STORAGE_SETUP_SERVER_FAILED')
      const code = known ? error.message : 'STORAGE_SETUP_SERVER_FAILED'
      const status = code.includes('CONFLICT') || code.includes('MISMATCH') ? 409
        : code.includes('NOT_FOUND') ? 404 : code.includes('NOT_READY') ? 409 : 400
      return result(status, code)
    }
  }

  return {
    GET(request: Request): Promise<Response> {
      return handle(async () => {
        await requireRole(request, 'admin', deps.resolveUser)
        const params = new URL(request.url).searchParams
        const offsetText = params.get('offset') ?? '0'
        if (!/^\d{1,6}$/u.test(offsetText)) return result(400, 'STORAGE_SETUP_INVALID_PAGE')
        const offset = Number(offsetText)
        const db = client()
        // Probe required columns/tables independently. Production without RC1.5
        // returns a useful blocked response rather than implying setup is ready.
        const [brands, platforms, shifts, unclassifiedCount, routes] = await Promise.all([
          db.from('brands').select('id,name,storage_profile').is('deleted_at', null).order('name'),
          db.from('platforms').select('id,name').is('deleted_at', null).order('name'),
          db.from('shifts').select('id,date,title,version,brand_id,platform_id,status,execution_source')
            .is('execution_source', null).is('deleted_at', null).order('date', { ascending: false })
            .range(offset, offset + 39),
          db.from('shifts').select('id', { count: 'exact', head: true })
            .is('execution_source', null).is('deleted_at', null),
          db.from('operational_storage_routes')
            .select('id,brand_id,platform_id,execution_source,storage_profile,provider,root_folder_id,active')
            .eq('active', true).order('brand_id'),
        ])
        const missing = [
          ...(brands.error ? ['brands.storage_profile'] : []),
          ...(shifts.error || unclassifiedCount.error ? ['shifts.execution_source'] : []),
          ...(routes.error ? ['operational_storage_routes'] : []),
          ...(platforms.error ? ['platforms'] : []),
        ]
        return Response.json({
          ok: true, schema_ready: missing.length === 0, missing,
          brands: brands.error ? [] : brands.data ?? [],
          platforms: platforms.error ? [] : platforms.data ?? [],
          unclassified_shifts_sample: shifts.error ? [] : shifts.data ?? [],
          unclassified_shifts_count: unclassifiedCount.error ? null : unclassifiedCount.count,
          offset,
          sample_limit: 40,
          routes: routes.error ? [] : routes.data ?? [],
          root_configured: Boolean(configuredRoot()?.trim()),
          // Snapshot only, never return raw provider credentials / tokens.
        }, { headers: { 'Cache-Control': 'no-store' } })
      })
    },
    POST(request: Request): Promise<Response> {
      return handle(async () => {
        const actor = await requireRole(request, 'admin', deps.resolveUser)
        if (!actor.businessUserId) fail('STORAGE_SETUP_ACTOR_NOT_READY')
        const raw = await readJsonBody(request, 8192)
        const db = client()
        const parsed = z.union([routeInput, brandInput, shiftInput]).parse(raw)

        if (parsed.action === 'classify_brand_profile') {
          const found = await db.from('brands').select('id,storage_profile')
            .eq('id', parsed.brand_id).is('deleted_at', null).maybeSingle()
          if (found.error || !found.data) fail('STORAGE_SETUP_BRAND_NOT_FOUND')
          if (found.data.storage_profile === 'CANONICAL_V1') {
            return Response.json({ ok: true, unchanged: true }, { headers: { 'Cache-Control': 'no-store' } })
          }
          if (found.data.storage_profile !== null) fail('STORAGE_SETUP_PROFILE_CONFLICT')
          // Explicit confirmation only. Historic brands remain unclassified
          // until an operator has inspected the actual Drive folder tree.
          const active = await db.from('operational_storage_routes').select('id')
            .eq('brand_id', parsed.brand_id).eq('active', true).limit(1)
          if (active.error) fail('STORAGE_SETUP_NOT_READY')
          if ((active.data ?? []).length > 0) fail('STORAGE_SETUP_ROUTE_CONFLICT')
          const updated = await db.from('brands').update({
            storage_profile: 'CANONICAL_V1',
            storage_profile_reviewed_by: actor.businessUserId,
            storage_profile_reviewed_at: new Date().toISOString(),
          })
            .eq('id', parsed.brand_id).is('storage_profile', null)
            .is('deleted_at', null).select('id,storage_profile').maybeSingle()
          if (updated.error || !updated.data) fail('STORAGE_SETUP_PROFILE_CONFLICT')
          return Response.json({ ok: true, brand: updated.data }, { headers: { 'Cache-Control': 'no-store' } })
        }

        if (parsed.action === 'classify_shift') {
          const found = await db.from('shifts')
            .select('id,version,execution_source,deleted_at').eq('id', parsed.shift_id)
            .is('deleted_at', null).maybeSingle()
          if (found.error || !found.data) fail('STORAGE_SETUP_SHIFT_NOT_FOUND')
          if (found.data.execution_source !== null) fail('STORAGE_SETUP_SOURCE_CONFLICT')
          if (found.data.version !== parsed.expected_version) fail('STORAGE_SETUP_VERSION_MISMATCH')
          const updated = await updateShift(parsed.shift_id, parsed.expected_version, parsed.execution_source)
          if (updated.error || !updated.data) fail('STORAGE_SETUP_SHIFT_RPC_FAILED')
          return Response.json({ ok: true, shift: updated.data }, { headers: { 'Cache-Control': 'no-store' } })
        }

        const rootId = configuredRoot()?.trim()
        if (!rootId || rootId !== parsed.root_folder_id) fail('STORAGE_SETUP_ROOT_MISMATCH')
        const [brand, platform] = await Promise.all([
          db.from('brands').select('id,storage_profile').eq('id', parsed.brand_id)
            .is('deleted_at', null).maybeSingle(),
          db.from('platforms').select('id').eq('id', parsed.platform_id)
            .is('deleted_at', null).maybeSingle(),
        ])
        if (brand.error || platform.error || !brand.data || !platform.data) fail('STORAGE_SETUP_CONTEXT_NOT_FOUND')
        if (brand.data.storage_profile !== 'CANONICAL_V1') fail('STORAGE_SETUP_PROFILE_NOT_READY')
        const folder = await getMetadata(rootId)
        if (folder.kind !== 'folder' || folder.id !== rootId) fail('STORAGE_SETUP_ROOT_MISMATCH')
        const existing = await db.from('operational_storage_routes').select('id')
          .eq('provider', 'google_drive').eq('brand_id', parsed.brand_id)
          .eq('platform_id', parsed.platform_id).eq('execution_source', parsed.execution_source)
          .is('subbrand_key', null).eq('active', true).maybeSingle()
        if (existing.error) fail('STORAGE_SETUP_NOT_READY')
        if (existing.data) fail('STORAGE_SETUP_ROUTE_CONFLICT')
        // No folder created and no shift mutated. Only explicitly approved
        // exact brand/platform/source mapping is inserted.
        const inserted = await db.from('operational_storage_routes').insert({
          provider: 'google_drive', execution_source: parsed.execution_source,
          brand_id: parsed.brand_id, platform_id: parsed.platform_id,
          subbrand_key: null, storage_profile: 'CANONICAL_V1',
          root_folder_id: rootId, base_folder_id: rootId,
          folder_labels: {}, period_naming_style: 'THANG_M_DOT_YEAR',
          active: true, approved_by: actor.businessUserId,
          approved_at: new Date().toISOString(),
        }).select('id,brand_id,platform_id,execution_source,active').single()
        if (inserted.error || !inserted.data) fail('STORAGE_SETUP_ROUTE_CONFLICT')
        return Response.json({ ok: true, route: inserted.data }, { headers: { 'Cache-Control': 'no-store' } })
      })
    },
  }
}
