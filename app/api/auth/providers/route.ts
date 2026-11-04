import { getSupabasePublicConfig } from '@/lib/auth/authMode'
import { googleProviderEnabled } from '@/lib/auth/googleOAuth'
import { requireSupabaseServerPublicConfig } from '@/lib/server/supabaseEnvironment'

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' }
  if (!getSupabasePublicConfig()) return Response.json({ google: false }, { headers })
  try {
    const { url, anonKey } = requireSupabaseServerPublicConfig()
    const response = await fetch(url + '/auth/v1/settings', {
      headers: { apikey: anonKey }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return Response.json({ google: false }, { status: 503, headers })
    return Response.json({ google: googleProviderEnabled(await response.json()) }, { headers })
  } catch { return Response.json({ google: false }, { status: 503, headers }) }
}
