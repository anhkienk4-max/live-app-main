import 'server-only'

import { z } from 'zod'
import { authorizationErrorResponse, isAuthorizationError, requireRole, requireUser, type ServerUserResolver } from '@/lib/server/authGuards'
import { createClient } from '@/lib/supabase/server'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

const id = z.string().trim().min(1).max(180)
const text = (max: number) => z.string().trim().min(1).max(max)
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('product.create'), product_code: text(120), name: text(200), category: z.string().trim().max(120).nullable().optional(), description: z.string().trim().max(4000).nullable().optional(), owner_id: id.optional(), brand_ids: z.array(id).min(1).max(20) }).strict(),
  z.object({ action: z.literal('product.update'), id, expected_version: z.number().int().positive(), product_code: text(120), name: text(200), category: z.string().trim().max(120).nullable().optional(), description: z.string().trim().max(4000).nullable().optional(), lifecycle_status: z.enum(['draft','active','inactive','archived']).optional(), brand_ids: z.array(id).min(1).max(20) }).strict(),
  z.object({ action: z.literal('sku.create'), product_id: id, sku_code: text(120), variant_name: text(200), size_or_package: z.string().trim().max(120).nullable().optional(), packaging_type: z.string().trim().max(120).nullable().optional(), platform_mappings: z.array(z.object({ platform_id: id, external_sku_id: text(160) }).strict()).max(30).default([]) }).strict(),
  z.object({ action: z.literal('sku.platform.set'), sku_id: id, platform_id: id, external_sku_id: text(160) }).strict(),
  z.object({ action: z.literal('sku.update'), id, expected_version: z.number().int().positive(), sku_code: text(120), variant_name: text(200), size_or_package: z.string().trim().max(120).nullable().optional(), packaging_type: z.string().trim().max(120).nullable().optional(), lifecycle_status: z.enum(['active','inactive','archived']) }).strict(),
  z.object({ action: z.literal('campaign.attach_sku'), campaign_id: id, sku_id: id }).strict(),
  z.object({ action: z.literal('scheme.review'), id, decision: z.enum(['approved','rejected']) }).strict(),
  z.object({ action: z.literal('scheme.create'), campaign_id: id, sku_id: id.nullable().optional(), scheme_name: text(200), terms: text(5000), eligibility: z.string().trim().max(2000).nullable().optional(), exclusions: z.string().trim().max(2000).nullable().optional(), valid_from: z.string().datetime(), valid_to: z.string().datetime(), source_resource_id: id.nullable().optional(), source_url: z.string().url().max(1000).nullable().optional() }).strict(),
  z.object({ action: z.literal('knowledge.create'), product_id: id, sku_id: id.nullable().optional(), knowledge_type: z.enum(['description','ingredient','feature','claim','restriction','disclaimer','usage_note','faq','training']), content: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown()), z.string().max(8000)]), source_resource_id: id.nullable().optional(), source_url: z.string().url().max(1000).nullable().optional(), source_reference: z.string().trim().max(500).nullable().optional(), effective_from: z.string().date().nullable().optional(), effective_to: z.string().date().nullable().optional() }).strict(),
  z.object({ action: z.literal('knowledge.review'), knowledge_version_id: id, decision: z.enum(['approved','rejected','changes_requested']), reason: z.string().trim().max(1000).nullable().optional() }).strict(),
  z.object({ action: z.literal('resource.attach'), resource_id: id, target_type: z.enum(['product','sku','campaign']), target_id: id, relation_type: z.enum(['image','kv','guideline','script','training','faq','scheme','marketing_data','document','other']) }).strict(),
  z.object({ action: z.literal('scope.set'), user_id: id, brand_id: id, active: z.boolean(), expires_at: z.string().datetime().nullable().optional() }).strict(),
])

function responseError(error: unknown) {
  if (isAuthorizationError(error)) return authorizationErrorResponse(error)
  if (error instanceof RequestBodyError) return Response.json({ ok: false, error: error.code }, { status: error.status })
  const code = (error as { code?: string })?.code
  if (code === '42501') return Response.json({ ok: false, error: 'BRAND_SCOPE_OR_PERMISSION_DENIED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  if (code === '40001') return Response.json({ ok: false, error: 'BRAND_VERSION_CONFLICT' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
  if (code === '23505') return Response.json({ ok: false, error: 'BRAND_DUPLICATE' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
  if (['PGRST205','PGRST202','42P01','42883'].includes(code ?? '')) return Response.json({ ok: false, error: 'BRAND01_SCHEMA_NOT_INSTALLED' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  return Response.json({ ok: false, error: 'BRAND_CATALOG_REQUEST_FAILED' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

export function createBrandCatalogHandler(resolveUser?: ServerUserResolver) {
  return {
    async GET(request: Request) {
      try {
        const actor = await requireUser(request, resolveUser)
        const supabase = await createClient()
        const url = new URL(request.url)
        const requestedBrand = url.searchParams.get('brand_id')
        const query = (url.searchParams.get('q') ?? '').trim().replace(/[%_,()]/g, '').slice(0, 100)
        let brandIds: string[]
        if (actor.systemPermission === 'admin') {
          const { data, error } = await supabase.from('brands').select('id,name,status,category,description,brand_guideline,tone_of_voice,key_products,mandatory_claims,restricted_claims,dos,donts,asset_links').is('archived_at', null).is('deleted_at', null).order('name').limit(200)
          if (error) throw error
          brandIds = (data ?? []).map(row => row.id)
        } else {
          if (!actor.businessUserId) return Response.json({ ok: false, error: 'BUSINESS_USER_REQUIRED' }, { status: 403 })
          const { data, error } = await supabase.from('brand01_user_brand_access').select('brand_id').eq('user_id', actor.businessUserId).is('revoked_at', null)
          if (error) throw error
          brandIds = [...new Set((data ?? []).map(row => row.brand_id))]
        }
        if (requestedBrand && !brandIds.includes(requestedBrand)) return Response.json({ ok: false, error: 'BRAND_SCOPE_DENIED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
        const visibleBrandIds = requestedBrand ? [requestedBrand] : brandIds
        if (!visibleBrandIds.length) return Response.json({ ok: true, brands: [], campaigns: [], products: [], productBrands: [], skus: [], campaignSkus: [], schemes: [], knowledge: [], resourceLinks: [], resources: [], scopes: [], skuPlatforms: [], platforms: [], knowledgeApprovals: [], users: [], auditEvents: [] }, { headers: { 'Cache-Control': 'no-store' } })
        const [brandsResult, campaignsResult] = await Promise.all([
          supabase.from('brands').select('id,name,status,category,logo_url,description,brand_guideline,tone_of_voice,key_products,mandatory_claims,restricted_claims,dos,donts,asset_links').in('id', visibleBrandIds).is('archived_at', null).is('deleted_at', null).order('name'),
          supabase.from('campaigns').select('id,name,brand_id,start_date,end_date,status,platform_ids,type,notes,campaign_url,website_url').in('brand_id', visibleBrandIds).is('archived_at', null).is('deleted_at', null).order('start_date', { ascending: false }).limit(200),
        ])
        if (brandsResult.error) throw brandsResult.error
        if (campaignsResult.error) throw campaignsResult.error
        let products
        if (query) {
          const [nameMatches, codeMatches, skuMatches] = await Promise.all([
            supabase.from('brand01_products').select('*').ilike('name', '%' + query + '%').limit(100),
            supabase.from('brand01_products').select('*').ilike('product_code', '%' + query + '%').limit(100),
            supabase.from('brand01_product_skus').select('product_id').ilike('sku_code', '%' + query + '%').limit(200),
          ])
          for (const result of [nameMatches, codeMatches, skuMatches]) if (result.error) throw result.error
          const matchedIds = [...new Set([...(nameMatches.data ?? []).map(row => row.id), ...(codeMatches.data ?? []).map(row => row.id), ...(skuMatches.data ?? []).map(row => row.product_id)])]
          if (matchedIds.length) {
            const { data, error } = await supabase.from('brand01_products').select('*').in('id', matchedIds).order('name').limit(100)
            if (error) throw error
            products = data
          } else products = []
        } else {
          const { data, error } = await supabase.from('brand01_products').select('*').order('name').limit(100)
          if (error) throw error
          products = data
        }
        const productIds = (products ?? []).map(row => row.id)
        const campaignIds = (campaignsResult.data ?? []).map(row => row.id)
        const queries = [
          productIds.length ? supabase.from('brand01_product_brands').select('*').in('product_id', productIds).in('brand_id', visibleBrandIds) : supabase.from('brand01_product_brands').select('*').limit(0),
          productIds.length ? supabase.from('brand01_product_skus').select('*').in('product_id', productIds).order('sku_code') : supabase.from('brand01_product_skus').select('*').limit(0),
          productIds.length ? supabase.from('brand01_product_knowledge_versions').select('*').in('product_id', productIds).order('created_at', { ascending: false }).limit(200) : supabase.from('brand01_product_knowledge_versions').select('*').limit(0),
          productIds.length ? supabase.from('brand01_product_resource_links').select('*').in('product_id', productIds).limit(300) : supabase.from('brand01_product_resource_links').select('*').limit(0),
          campaignIds.length ? supabase.from('brand01_campaign_product_skus').select('*').in('campaign_id', campaignIds).limit(300) : supabase.from('brand01_campaign_product_skus').select('*').limit(0),
          campaignIds.length ? supabase.from('brand01_campaign_schemes').select('*').in('campaign_id', campaignIds).limit(200) : supabase.from('brand01_campaign_schemes').select('*').limit(0),
        ] as const
        const [brandLinks, skusResult, knowledgeResult, productLinksResult, campaignSkusResult, schemesResult] = await Promise.all(queries)
        for (const result of [brandLinks, skusResult, knowledgeResult, productLinksResult, campaignSkusResult, schemesResult]) if (result.error) throw result.error
        const skuIds = (skusResult.data ?? []).map(row => row.id)
        const [skuLinksResult, campaignLinksResult, skuPlatformsResult, platformsResult] = await Promise.all([
          skuIds.length ? supabase.from('brand01_product_resource_links').select('*').in('sku_id', skuIds).limit(300) : supabase.from('brand01_product_resource_links').select('*').limit(0),
          campaignIds.length ? supabase.from('brand01_product_resource_links').select('*').in('campaign_id', campaignIds).limit(300) : supabase.from('brand01_product_resource_links').select('*').limit(0),
          skuIds.length ? supabase.from('brand01_product_platform_skus').select('*').in('sku_id', skuIds) : supabase.from('brand01_product_platform_skus').select('*').limit(0),
          supabase.from('platforms').select('id,name,status').order('name').limit(100),
        ])
        for (const result of [skuLinksResult, campaignLinksResult, skuPlatformsResult, platformsResult]) if (result.error) throw result.error
        const resourceLinks = [...(productLinksResult.data ?? []), ...(skuLinksResult.data ?? []), ...(campaignLinksResult.data ?? [])]
        const resourceIds = [...new Set([...resourceLinks.map(row => row.resource_id), ...(knowledgeResult.data ?? []).flatMap(row => row.source_resource_id ? [row.source_resource_id] : []), ...(schemesResult.data ?? []).flatMap(row => row.source_resource_id ? [row.source_resource_id] : [])])]
        const resourcesResult = resourceIds.length ? await supabase.from('storage_resources').select('id,title,provider,canonical_url,resource_type,visibility,verification_status,is_active').in('id', resourceIds) : { data: [], error: null }
        if (resourcesResult.error) throw resourcesResult.error
        const knowledgeIds = (knowledgeResult.data ?? []).map(row => row.id)
        const approvalResult = knowledgeIds.length ? await supabase.rpc('brand01_knowledge_approval_status', { p_version_ids: knowledgeIds }) : { data: [], error: null }
        if (approvalResult.error) throw approvalResult.error
        const usersResult = actor.systemPermission === 'admin'
          ? await supabase.from('business_users').select('id,full_name,system_permission,status,account_status').eq('status', 'active').eq('account_status', 'active').is('deleted_at', null).is('archived_at', null).order('full_name').limit(300)
          : { data: [], error: null }
        if (usersResult.error) throw usersResult.error
        const scopesResult = actor.systemPermission === 'admin' ? await supabase.from('brand01_user_brand_access').select('grant_id,user_id,brand_id,access_level,granted_by,granted_at,expires_at,revoked_at').in('brand_id', visibleBrandIds) : { data: [], error: null }
        if (scopesResult.error) throw scopesResult.error
        const auditResult = actor.systemPermission === 'admin' ? await supabase.from('brand01_catalog_audit_events').select('id,table_name,record_id,action,actor_id,created_at').order('created_at', { ascending: false }).limit(200) : { data: [], error: null }
        if (auditResult.error) throw auditResult.error
        return Response.json({ ok: true, brands: brandsResult.data ?? [], campaigns: campaignsResult.data ?? [], products: products ?? [], productBrands: brandLinks.data ?? [], skus: skusResult.data ?? [], campaignSkus: campaignSkusResult.data ?? [], schemes: schemesResult.data ?? [], knowledge: knowledgeResult.data ?? [], resourceLinks: productLinksResult.data ?? [], resources: resourcesResult.data ?? [], scopes: scopesResult.data ?? [], skuPlatforms: skuPlatformsResult.data ?? [], platforms: platformsResult.data ?? [], knowledgeApprovals: approvalResult.data ?? [], users: usersResult.data ?? [], auditEvents: auditResult.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) { return responseError(error) }
    },
    async POST(request: Request) {
      try {
        const actor = await requireRole(request, 'admin', resolveUser)
        if (!actor.businessUserId) return Response.json({ ok: false, error: 'BUSINESS_USER_REQUIRED' }, { status: 403 })
        const parsed = actionSchema.safeParse(await readJsonBody(request, 24 * 1024))
        if (!parsed.success) return Response.json({ ok: false, error: 'BRAND_INPUT_INVALID' }, { status: 400 })
        const input = parsed.data
        const supabase = await createClient()
        if (input.action === 'product.create') {
          const { data, error } = await supabase.rpc('brand01_admin_create_product', { p_product_code: input.product_code, p_name: input.name, p_category: input.category ?? null, p_internal_description: input.description ?? null, p_owner_id: input.owner_id ?? actor.businessUserId, p_brand_ids: input.brand_ids })
          if (error) throw error
          return Response.json({ ok: true, product: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'product.update') {
          const { data, error } = await supabase.rpc('brand01_admin_update_product', { p_product_id: input.id, p_expected_version: input.expected_version, p_product_code: input.product_code, p_name: input.name, p_category: input.category ?? null, p_internal_description: input.description ?? null, p_lifecycle_status: input.lifecycle_status ?? 'draft', p_brand_ids: input.brand_ids })
          if (error) throw error
          return Response.json({ ok: true, product: data }, { headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'sku.create') {
          const { data, error } = await supabase.rpc('brand01_admin_create_sku', { p_product_id: input.product_id, p_sku_code: input.sku_code, p_variant_name: input.variant_name, p_size_or_package: input.size_or_package ?? null, p_packaging_type: input.packaging_type ?? null, p_platform_mappings: input.platform_mappings })
          if (error) throw error
          return Response.json({ ok: true, sku: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'sku.update') {
          const { data, error } = await supabase.from('brand01_product_skus').update({ sku_code: input.sku_code, variant_name: input.variant_name, size_or_package: input.size_or_package ?? null, packaging_type: input.packaging_type ?? null, lifecycle_status: input.lifecycle_status, version: input.expected_version + 1, updated_by: actor.businessUserId, updated_at: new Date().toISOString() }).eq('id', input.id).eq('version', input.expected_version).select().maybeSingle()
          if (error) throw error
          if (!data) return Response.json({ ok: false, error: 'BRAND_VERSION_CONFLICT' }, { status: 409 })
          return Response.json({ ok: true, sku: data }, { headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'sku.platform.set') {
          const { data, error } = await supabase.rpc('brand01_admin_set_sku_platform', { p_sku_id: input.sku_id, p_platform_id: input.platform_id, p_external_sku_id: input.external_sku_id })
          if (error) throw error
          return Response.json({ ok: true, platformSku: data }, { headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'campaign.attach_sku') {
          const { data, error } = await supabase.from('brand01_campaign_product_skus').insert({ campaign_id: input.campaign_id, sku_id: input.sku_id, owner_id: actor.businessUserId, created_by: actor.businessUserId }).select().single()
          if (error) throw error
          return Response.json({ ok: true, campaignSku: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'scheme.review') {
          const { data, error } = await supabase.rpc('brand01_admin_review_campaign_scheme', { p_scheme_id: input.id, p_decision: input.decision })
          if (error) throw error
          return Response.json({ ok: true, scheme: data }, { headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'scheme.create') {
          const { data, error } = await supabase.from('brand01_campaign_schemes').insert({ campaign_id: input.campaign_id, sku_id: input.sku_id ?? null, scheme_name: input.scheme_name, terms: input.terms, eligibility: input.eligibility ?? null, exclusions: input.exclusions ?? null, valid_from: input.valid_from, valid_to: input.valid_to, owner_id: actor.businessUserId, status: 'draft', source_resource_id: input.source_resource_id ?? null, source_url: input.source_url ?? null, created_by: actor.businessUserId, updated_by: actor.businessUserId }).select().single()
          if (error) throw error
          return Response.json({ ok: true, scheme: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'knowledge.create') {
          const { data, error } = await supabase.rpc('brand01_admin_create_knowledge_version', { p_product_id: input.product_id, p_sku_id: input.sku_id ?? null, p_knowledge_type: input.knowledge_type, p_content: input.content, p_source_resource_id: input.source_resource_id ?? null, p_source_url: input.source_url ?? null, p_source_reference: input.source_reference ?? null, p_effective_from: input.effective_from ?? null, p_effective_to: input.effective_to ?? null })
          if (error) throw error
          return Response.json({ ok: true, knowledge: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'knowledge.review') {
          const { data, error } = await supabase.from('brand01_knowledge_reviews').insert({ knowledge_version_id: input.knowledge_version_id, reviewer_id: actor.businessUserId, decision: input.decision, reason: input.reason ?? null }).select().single()
          if (error) throw error
          return Response.json({ ok: true, review: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        if (input.action === 'resource.attach') {
          const row = { resource_id: input.resource_id, relation_type: input.relation_type, owner_id: actor.businessUserId, created_by: actor.businessUserId, product_id: input.target_type === 'product' ? input.target_id : null, sku_id: input.target_type === 'sku' ? input.target_id : null, campaign_id: input.target_type === 'campaign' ? input.target_id : null }
          const { data, error } = await supabase.from('brand01_product_resource_links').insert(row).select().single()
          if (error) throw error
          return Response.json({ ok: true, resourceLink: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        }
        const { data, error } = await supabase.rpc('brand01_admin_set_brand_access', { p_user_id: input.user_id, p_brand_id: input.brand_id, p_active: input.active, p_expires_at: input.expires_at ?? null })
        if (error) throw error
        return Response.json({ ok: true, access: data }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) { return responseError(error) }
    },
  }
}
