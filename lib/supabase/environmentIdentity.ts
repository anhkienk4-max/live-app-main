export const PRODUCTION_SUPABASE_REF = 'egdjnpmoasarrttvhgds'
export const STAGING_SUPABASE_REF = 'amagnzebmmuqiptmrjmc'

export interface SupabaseEnvironment {
  NODE_ENV?: string
  CI?: string
  VERCEL?: string
  VERCEL_ENV?: string
  VERCEL_TARGET_ENV?: string
  NEXT_PUBLIC_USE_MOCK_DATA?: string
  NEXT_PUBLIC_SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

export type EnvironmentPurpose = 'development' | 'build' | 'runtime'
type DeploymentMode = 'local' | 'preview' | 'production'

export class SupabaseEnvironmentError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'SupabaseEnvironmentError'
  }
}

function fail(code: string): never { throw new SupabaseEnvironmentError(code) }

// No custom domain has verified project ownership in this repository.
const verifiedCustomDomains: Readonly<Record<string, string>> = Object.freeze({})

export function resolveSupabaseTarget(raw: string) {
  const value = raw.trim()
  let url: URL
  try { url = new URL(value) } catch { return fail('ENV_SUPABASE_URL_INVALID') }
  // Reject parser normalization of credentials, paths, queries and disguised hosts.
  const authority = /^https?:\/\/([a-z0-9.-]+|\[::1\])(?::[0-9]+)?\/*$/i.exec(value)
  if (!authority || authority[1].toLowerCase() !== url.hostname
    || url.username || url.password || url.search || url.hash) {
    return fail('ENV_SUPABASE_URL_INVALID')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (local) return { url: url.origin, projectRef: url.origin, local: true }
  if (url.protocol !== 'https:' || url.port) return fail('ENV_SUPABASE_URL_INVALID')
  const projectRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname)?.[1]
    ?? verifiedCustomDomains[url.hostname]
  if (projectRef !== PRODUCTION_SUPABASE_REF && projectRef !== STAGING_SUPABASE_REF) {
    return fail('ENV_SUPABASE_PROJECT_UNRECOGNIZED')
  }
  return { url: url.origin, projectRef, local: false }
}

export function resolveDeploymentMode(env: SupabaseEnvironment): DeploymentMode {
  const mode = env.VERCEL_ENV
  if (!env.VERCEL && !mode && !env.VERCEL_TARGET_ENV) return 'local'
  if (env.VERCEL !== '1' || !['development', 'preview', 'production'].includes(mode ?? '')
    || (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== mode)
    || (env.NODE_ENV === 'development' && mode !== 'development')) {
    return fail('ENV_DEPLOYMENT_IDENTITY_INVALID')
  }
  return mode === 'development' ? 'local' : mode as 'preview' | 'production'
}

export function validateSupabaseEnvironment(
  env: SupabaseEnvironment,
  purpose: EnvironmentPurpose = 'runtime',
) {
  const mode = resolveDeploymentMode(env)
  const mock = env.NEXT_PUBLIC_USE_MOCK_DATA
  if (mock && mock !== 'true' && mock !== 'false') fail('ENV_MOCK_MODE_INVALID')
  if (mock === 'true' && (mode !== 'local' || purpose === 'build' || env.NODE_ENV !== 'development')) {
    fail('ENV_MOCK_MODE_FORBIDDEN')
  }
  const publicUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  // A nonempty server override is authoritative; whitespace is invalid, not fallback.
  const serverUrl = env.SUPABASE_URL || publicUrl
  const publicTarget = publicUrl ? resolveSupabaseTarget(publicUrl) : null
  const serverTarget = serverUrl ? resolveSupabaseTarget(serverUrl) : null
  if (mode !== 'production' && [publicTarget, serverTarget].some(t => t?.projectRef === PRODUCTION_SUPABASE_REF)) {
    fail('ENV_PRODUCTION_TARGET_FORBIDDEN')
  }
  if (publicTarget && serverTarget && publicTarget.projectRef !== serverTarget.projectRef) {
    fail('ENV_SUPABASE_TARGET_MISMATCH')
  }
  if (mode === 'production' && [publicTarget, serverTarget].some(t => t && t.projectRef !== PRODUCTION_SUPABASE_REF)) {
    fail('ENV_PRODUCTION_TARGET_REQUIRED')
  }
  if (mode === 'preview' && [publicTarget, serverTarget].some(t => t?.local)) {
    fail('ENV_PREVIEW_TARGET_REQUIRED')
  }
  const credentialFree = !publicUrl && !env.SUPABASE_URL
    && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() && !env.SUPABASE_SECRET_KEY?.trim()
  if (mode === 'local' && credentialFree) {
    if (purpose === 'build' && env.CI === 'true' && !env.VERCEL) {
      return { mode, publicTarget: null, serverTarget: null, offline: 'credential_free_build' as const }
    }
    if (purpose === 'development' && env.NODE_ENV === 'development' && mock === 'true') {
      return { mode, publicTarget: null, serverTarget: null, offline: 'mock' as const }
    }
  }
  if (!publicTarget || !serverTarget || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || (mode !== 'local' && !env.SUPABASE_SECRET_KEY?.trim())) {
    fail('ENV_SUPABASE_CONFIG_REQUIRED')
  }
  if (purpose === 'runtime' && mock === 'true') fail('ENV_DATABASE_ACCESS_DISABLED')
  return { mode, publicTarget, serverTarget, offline: null }
}
