import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSupabaseServerPublicConfig } from '@/lib/server/supabaseEnvironment'

export async function createClient(options: { clientIp?: string } = {}) {
  const { url, anonKey } = requireSupabaseServerPublicConfig()
  const cookieStore = await cookies()

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      global: options.clientIp
        ? { headers: { 'x-forwarded-for': options.clientIp } }
        : undefined,
    },
  )
}
