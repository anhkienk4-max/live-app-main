import 'server-only'

import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

const resourceId = z.string().trim().regex(/^[A-Za-z0-9_-]{1,180}$/u)

export function createPublicStorageResourceHandler(createClient: typeof createSupabaseAdminClient = createSupabaseAdminClient) {
  return async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params
    const parsed = resourceId.safeParse(id)
    if (!parsed.success) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })

    try {
      const { data, error } = await createClient().from('storage_resources')
        .select('canonical_url')
        .eq('id', parsed.data)
        .eq('visibility', 'public')
        .eq('is_active', true)
        .neq('resource_type', 'attendance_evidence')
        .maybeSingle()
      if (error) throw error
      if (!data?.canonical_url) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
      return new Response(null, {
        status: 302,
        headers: { Location: data.canonical_url, 'Cache-Control': 'no-store' },
      })
    } catch {
      return Response.json({ ok: false, error: 'PUBLIC_RESOURCE_UNAVAILABLE' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }
}
