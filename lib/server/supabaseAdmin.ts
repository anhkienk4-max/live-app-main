import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Creates the privileged Auth client only in a server route. The secret is
 * intentionally read from a non-public environment variable and never
 * returned to callers.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secret) {
    throw new Error('AUTH_ADMIN_NOT_CONFIGURED')
  }
  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}
