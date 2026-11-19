import { PRODUCTION_SUPABASE_REF, resolveSupabaseTarget, SupabaseEnvironmentError } from '@/lib/supabase/environmentIdentity'

export type AuthMode = 'mock' | 'supabase'

export interface AuthModeEnvironment {
  nodeEnv?: string
  useMockData?: string
}

export interface SupabasePublicEnvironment {
  url?: string
  anonKey?: string
}

export interface SupabasePublicConfig {
  url: string
  anonKey: string
}

export function resolveAuthMode(environment: AuthModeEnvironment): AuthMode {
  return environment.nodeEnv === 'development'
    && environment.useMockData === 'true'
    ? 'mock'
    : 'supabase'
}

export function getAuthMode(): AuthMode {
  return resolveAuthMode({
    nodeEnv: process.env.NODE_ENV,
    useMockData: process.env.NEXT_PUBLIC_USE_MOCK_DATA,
  })
}

export function resolveSupabasePublicConfig(
  environment: SupabasePublicEnvironment,
): SupabasePublicConfig | null {
  const url = environment.url?.trim()
  const anonKey = environment.anonKey?.trim()
  return url && anonKey ? { url, anonKey } : null
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  return resolveSupabasePublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
}

export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig()
  if (!config) {
    throw new Error('Supabase authentication is not configured.')
  }
  const target = resolveSupabaseTarget(config.url)
  if (process.env.NODE_ENV === 'development' && target.projectRef === PRODUCTION_SUPABASE_REF) {
    throw new SupabaseEnvironmentError('ENV_PRODUCTION_TARGET_FORBIDDEN')
  }
  return { ...config, url: target.url }
}

export function safeLocalRedirect(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/'
  try {
    const parsed = new URL(value, 'https://redirect.invalid')
    if (parsed.origin !== 'https://redirect.invalid') return '/'
    return parsed.pathname + parsed.search + parsed.hash
  } catch { return '/' }
}
