import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser, isAuthorizationError, authorizationErrorResponse, type ServerUserResolver } from '@/lib/server/authGuards'
import { shiftFromRow } from '@/lib/services/supabaseShiftService'
import { registrationFromRow } from '@/lib/services/supabaseShiftRegistrationService'

export function createRegistrationReviewContextHandler(dependencies: { resolveUser?: ServerUserResolver; createClient?: () => Promise<SupabaseClient> } = {}) {
  return { GET: async (request: Request) => {
    try {
      const user = await requireUser(request, dependencies.resolveUser)
      if (user.systemPermission === 'member') return Response.json({ error: { code: 'PERMISSION_DENIED' } }, { status: 403 })
      const id = new URL(request.url).searchParams.get('id')
      if (!id || id.length > 128) return Response.json({ error: { code: 'REGISTRATION_ID_INVALID' } }, { status: 400 })
      const client = dependencies.createClient ? await dependencies.createClient() : await (await import('@/lib/supabase/server')).createClient()
      const result = await client.rpc('get_registration_review_context', { p_registration_id: id })
      if (result.error) throw result.error
      return Response.json({
        registrations: result.data.registrations.map(registrationFromRow),
        shifts: result.data.shifts.map((row: Parameters<typeof shiftFromRow>[0]) => shiftFromRow(row, 'database')),
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
      return Response.json({ error: { code: code === '42501' ? 'PERMISSION_DENIED' : 'REGISTRATION_CONTEXT_FAILED' } }, { status: code === '42501' ? 403 : 500, headers: { 'Cache-Control': 'no-store' } })
    }
  } }
}
