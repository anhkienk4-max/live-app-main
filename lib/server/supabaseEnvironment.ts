import 'server-only'
import { validateSupabaseEnvironment, type SupabaseEnvironment } from '@/lib/supabase/environmentIdentity'

export function readSupabaseEnvironment(): SupabaseEnvironment {
  return {
    NODE_ENV: process.env.NODE_ENV,
    CI: process.env.CI,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
    NEXT_PUBLIC_USE_MOCK_DATA: process.env.NEXT_PUBLIC_USE_MOCK_DATA,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  }
}

export function requireSupabaseServerPublicConfig() {
  const env = readSupabaseEnvironment()
  const result = validateSupabaseEnvironment(env)
  return { url: result.publicTarget!.url, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim() }
}
