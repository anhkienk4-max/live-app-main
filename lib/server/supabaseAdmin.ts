import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseEnvironment } from '@/lib/server/supabaseEnvironment'
import { validateSupabaseEnvironment } from '@/lib/supabase/environmentIdentity'

/**
 * Creates the privileged Auth client only in a server route. The secret is
 * intentionally read from a non-public environment variable and never
 * returned to callers.
 */
export function createSupabaseAdminClient(clientFactory: typeof createClient = createClient): SupabaseClient {
  const env = readSupabaseEnvironment()
  const { serverTarget } = validateSupabaseEnvironment(env)
  const secret = env.SUPABASE_SECRET_KEY?.trim()
  if (!secret) {
    throw new Error('AUTH_ADMIN_NOT_CONFIGURED')
  }
  // Use the same snapshot that was validated; never reread process.env here.
  return clientFactory(serverTarget!.url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}
