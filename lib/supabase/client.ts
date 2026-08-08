import { createBrowserClient } from '@supabase/ssr'
import { requireSupabasePublicConfig } from '@/lib/auth/authMode'

export function createClient() {
  const { url, anonKey } = requireSupabasePublicConfig()
  return createBrowserClient(
    url,
    anonKey,
  )
}
