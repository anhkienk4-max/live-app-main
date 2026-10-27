import 'server-only'

import { z } from 'zod'
import { authorizationErrorResponse, isAuthorizationError, requireRole, requireUser, type ServerUserResolver } from '@/lib/server/authGuards'
import { createClient } from '@/lib/supabase/server'
import { fileStorageService } from '@/lib/services/fileStorageService'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { storageResourceRegistryDatabaseErrorResponse } from '@/lib/server/storageResourceRegistryErrorResponse'
import { classifyResourceVerificationError, validateCanonicalResourceReference } from '@/lib/files/storageResourceValidation'

const id = z.string().trim().min(1).max(180)
const provider = z.enum(['google_drive', 'onedrive'])
const visibility = z.enum(['admin_only', 'owner_only', 'granted_users'])
const resourceType = z.enum([
  'root_folder', 'google_sheet', 'report_data', 'product_document', 'sku_document',
  'kv', 'image', 'livecut', 'marketing_asset', 'campaign_scheme', 'script',
  'guideline', 'contract', 'acceptance', 'attendance_evidence', 'other',
])
const scope = z.object({
  brand_id: id.nullable().optional(), campaign_id: id.nullable().optional(),
  platform_id: id.nullable().optional(), shift_id: id.nullable().optional(),
  staff_id: id.nullable().optional(), client_group_key: z.string().trim().max(120).nullable().optional(),
  sku_key: z.string().trim().max(120).nullable().optional(),
  year: z.number().int().min(2000).max(2200).nullable().optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
}).strict()
const createInput = z.object({
  action: z.literal('create'), provider, canonical_id: id,
  canonical_url: z.string().url().max(1000), title: z.string().trim().min(1).max(200),
  resource_type: resourceType, visibility, owner_id: id.optional(), scope: scope.optional(),
}).strict()
const actionInput = z.union([
  z.object({ action: z.literal('create') }).merge(createInput.omit({ action: true })).strict(),
  z.object({ action: z.literal('update'), id, title: z.string().trim().min(1).max(200).optional(), visibility: visibility.optional(), is_active: z.boolean().optional(), canonical_id: id.optional(), canonical_url: z.string().url().max(1000).optional() })
    .strict().refine(value => (value.canonical_id === undefined) === (value.canonical_url === undefined)),
  z.object({ action: z.literal('attach_scope'), resource_id: id, scope }).strict(),
  z.object({ action: z.literal('grant'), resource_id: id, user_id: id, active: z.boolean() }).strict(),
  z.object({ action: z.literal('verify'), resource_id: id }).strict(),
])

function responseError(error: unknown) {
  if (isAuthorizationError(error)) return authorizationErrorResponse(error)
  if (error instanceof RequestBodyError) return Response.json({ ok: false, error: error.code }, { status: error.status })
  if (error instanceof Error && error.message.startsWith('RESOURCE_')) {
    return Response.json({ ok: false, error: error.message }, { status: 400 })
  }
  const databaseResponse = storageResourceRegistryDatabaseErrorResponse(error)
  if (databaseResponse) return databaseResponse
  return Response.json({ ok: false, error: 'STORAGE_RESOURCE_REQUEST_FAILED' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

export function createStorageResourceRegistryHandler(resolveUser?: ServerUserResolver) {
  return {
    async GET(request: Request) {
      try {
        await requireUser(request, resolveUser)
        const supabase = await createClient()
        const { data, error } = await supabase.from('storage_resources')
          .select('*, storage_resource_scopes(*)').order('updated_at', { ascending: false })
        if (error) throw error
        return Response.json({ ok: true, resources: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) { return responseError(error) }
    },
    async POST(request: Request) {
      try {
        const actor = await requireRole(request, 'admin', resolveUser)
        const actorId = actor.businessUserId
        if (!actorId) return Response.json({ ok: false, error: 'BUSINESS_USER_REQUIRED' }, { status: 403 })
        const parsed = actionInput.safeParse(await readJsonBody(request, 16 * 1024))
        if (!parsed.success) return Response.json({ ok: false, error: 'STORAGE_RESOURCE_INPUT_INVALID' }, { status: 400 })
        const input = parsed.data
        const supabase = await createClient()
        if (input.action === 'create') {
          const { canonicalUrl } = validateCanonicalResourceReference(input.provider, input.canonical_url, input.canonical_id)
          if (input.resource_type === 'attendance_evidence' && (
            input.visibility !== 'owner_only' || input.scope?.brand_id || input.scope?.campaign_id || input.scope?.client_group_key
          )) return Response.json({ ok: false, error: 'ATTENDANCE_RESOURCE_SCOPE_PRIVATE' }, { status: 400 })
          const { data: duplicate, error: duplicateLookupError } = await supabase.from('storage_resources').select('id')
            .eq('provider', input.provider).eq('canonical_id', input.canonical_id).maybeSingle()
          if (duplicateLookupError) throw duplicateLookupError
          if (duplicate) return Response.json({ ok: false, error: 'RESOURCE_DUPLICATE', resource_id: duplicate.id }, { status: 409 })
          const { data, error } = await supabase.rpc('storage_resource_registry_create', {
            p_resource: {
              provider: input.provider, canonical_id: input.canonical_id, canonical_url: canonicalUrl,
              title: input.title, resource_type: input.resource_type, owner_id: input.owner_id ?? actorId,
              visibility: input.visibility,
            },
            p_scope: input.scope ?? null,
          })
          if (error?.code === '23505') {
            let { data: existing } = await supabase.from('storage_resources').select('id')
              .eq('provider', input.provider).eq('canonical_id', input.canonical_id).maybeSingle()
            if (!existing) {
              const byUrl = await supabase.from('storage_resources').select('id')
                .eq('provider', input.provider).eq('canonical_url', canonicalUrl).maybeSingle()
              existing = byUrl.data
            }
            return Response.json({ ok: false, error: 'RESOURCE_DUPLICATE', resource_id: existing?.id }, { status: 409 })
          }
          if (error) throw error
          const result = data as { resource?: unknown } | null
          if (!result?.resource) throw new Error('STORAGE_RESOURCE_CREATE_RESULT_MISSING')
          return Response.json({ ok: true, resource: result?.resource }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'update') {
          const existing = input.canonical_id !== undefined
            ? await supabase.from('storage_resources').select('provider').eq('id', input.id).single()
            : null
          if (existing?.error) throw existing.error
          const patch = { ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
            ...(input.canonical_id !== undefined && existing?.data ? {
              canonical_id: input.canonical_id,
              canonical_url: validateCanonicalResourceReference(existing.data.provider, input.canonical_url!, input.canonical_id).canonicalUrl,
              verification_status: 'unverified', verification_checked_at: null, verification_error_code: null,
            } : {}),
            ...(input.is_active !== undefined ? { is_active: input.is_active } : {}), updated_by: actorId }
          const { data, error } = await supabase.from('storage_resources').update(patch).eq('id', input.id).select().single()
          if (error?.code === '23505') return Response.json({ ok: false, error: 'RESOURCE_DUPLICATE' }, { status: 409 })
          if (error) throw error
          return Response.json({ ok: true, resource: data }, { headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'attach_scope') {
          const { data, error } = await supabase.from('storage_resource_scopes').insert({ ...input.scope, resource_id: input.resource_id, created_by: actorId }).select().single()
          if (error?.code === '23505') return Response.json({ ok: false, error: 'RESOURCE_SCOPE_DUPLICATE' }, { status: 409 })
          if (error) throw error
          return Response.json({ ok: true, scope: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'grant') {
          const { error } = await supabase.rpc('storage_resource_registry_set_grant', {
            p_resource_id: input.resource_id, p_user_id: input.user_id, p_active: input.active,
          })
          if (error) throw error
          return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        }
        const { data: resource, error: lookupError } = await supabase.from('storage_resources').select('provider, canonical_id').eq('id', input.resource_id).single()
        if (lookupError) throw lookupError
        let status = 'verified_metadata'
        let errorCode: string | null = null
        try { await fileStorageService.getMetadata(resource.canonical_id, resource.provider) }
        catch (error) {
          status = classifyResourceVerificationError(error)
          errorCode = status === 'broken' ? 'PROVIDER_RESOURCE_MISSING' : 'PROVIDER_METADATA_UNAVAILABLE'
        }
        const { error } = await supabase.from('storage_resources').update({
          verification_status: status, verification_checked_at: new Date().toISOString(),
          verification_error_code: errorCode, updated_by: actorId,
        }).eq('id', input.resource_id)
        if (error) throw error
        return Response.json({ ok: true, verification_status: status, note: 'Provider metadata visibility does not prove viewer access.' }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) { return responseError(error) }
    },
  }
}
