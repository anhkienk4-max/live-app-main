import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser, isAuthorizationError, authorizationErrorResponse, type ServerUserResolver } from '@/lib/server/authGuards'
import { listFiltersSchema, operationsOwnerKey } from '@/lib/server/operationsCollectionHandler'

export function createAnalyticsSnapshotHandler(dependencies: { resolveUser?: ServerUserResolver; createClient?: () => Promise<SupabaseClient> } = {}) {
  return { GET: async (request: Request) => {
    try {
      const user = await requireUser(request, dependencies.resolveUser)
      const raw = new URL(request.url).searchParams.get('filters') ?? '{}'
      if (raw.length > 16384) return Response.json({ error: { code: 'LIST_FILTER_INVALID' } }, { status: 400 })
      let input: unknown
      try { input = JSON.parse(raw) } catch { return Response.json({ error: { code: 'LIST_FILTER_INVALID' } }, { status: 400 }) }
      const parsed = listFiltersSchema.safeParse(input)
      if (!parsed.success || !parsed.data.from || !parsed.data.to || Object.keys(parsed.data).some(key => !['from','to','brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds'].includes(key)))
        return Response.json({ error: { code: 'LIST_FILTER_INVALID' } }, { status: 400 })
      const client = dependencies.createClient ? await dependencies.createClient() : await (await import('@/lib/supabase/server')).createClient()
      const result = await client.rpc('get_analytics_snapshot', { p_filters: parsed.data })
      if (result.error) throw result.error
      return Response.json({ snapshot: result.data, ownerKey: operationsOwnerKey(user) }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
      return Response.json({ error: { code: code === '42501' ? 'PERMISSION_DENIED' : 'ANALYTICS_SNAPSHOT_FAILED' } }, { status: code === '42501' ? 403 : 500, headers: { 'Cache-Control': 'no-store' } })
    }
  } }
}
