import { createRequire } from 'node:module'
import { readSupabaseEnvironment } from '../lib/server/supabaseEnvironment'
import { SupabaseEnvironmentError, validateSupabaseEnvironment } from '../lib/supabase/environmentIdentity'

const require = createRequire(import.meta.url)
const { loadEnvConfig } = createRequire(require.resolve('next/package.json'))('@next/env')

try {
  const purpose = process.argv[2]
  if (purpose !== 'development' && purpose !== 'build' && purpose !== 'runtime') {
    throw new SupabaseEnvironmentError('ENV_GUARD_CONTEXT_REQUIRED')
  }
  process.env.NODE_ENV ??= purpose === 'development' ? 'development' : 'production'
  loadEnvConfig(process.cwd(), purpose === 'development', { info() {}, error() {} })
  const result = validateSupabaseEnvironment(readSupabaseEnvironment(), purpose)
  console.log(`[ENV GUARD] ${result.mode}: ${result.offline ?? 'target identity verified'}`)
} catch (error) {
  console.error(`[ENV GUARD] ${error instanceof SupabaseEnvironmentError ? error.code : 'ENV_GUARD_FAILED'}`)
  process.exitCode = 1
}
