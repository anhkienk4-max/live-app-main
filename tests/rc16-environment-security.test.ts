import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '../lib/server/supabaseAdmin.ts'
import { requireSupabaseServerPublicConfig } from '../lib/server/supabaseEnvironment.ts'
import { requireSupabasePublicConfig } from '../lib/auth/authMode.ts'
import {
  PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF, SupabaseEnvironmentError,
  resolveSupabaseTarget, validateSupabaseEnvironment,
  type EnvironmentPurpose, type SupabaseEnvironment,
} from '../lib/supabase/environmentIdentity.ts'

const staging = `https://${STAGING_SUPABASE_REF}.supabase.co`
const production = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`
const local = 'http://127.0.0.1:54321'
const configured: SupabaseEnvironment = {
  NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: staging, SUPABASE_URL: staging,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public-key', SUPABASE_SECRET_KEY: 'synthetic-server-key',
}
const preview = { ...configured, VERCEL: '1', VERCEL_ENV: 'preview' }
const deployedProduction = {
  ...configured, VERCEL: '1', VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: production, SUPABASE_URL: production,
}

test('backend, integration and post-main delivery disable Git auto-deploy while retaining Production defaults', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(config, {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    git: { deploymentEnabled: {
      'feat/rc16-payroll-workforce-backend': false,
      'integration/rc14-rc15-rc16-prod': false,
      'feat/rc16k-ui-consistency-pagination': false,
      'fix/rc19-staffing-73': false,
      'fix/rc19-reg128-lane1': false,
      'release/rc19-core-2026-11-01-integrated': false,
      'integration/rc19-wave2-core': false,
      'fix/rc19-p2-04-attendance-photo-review': false,
    } },
  })
})

function rejects(env: SupabaseEnvironment, code: string, purpose: EnvironmentPurpose = 'runtime') {
  assert.throws(() => validateSupabaseEnvironment(env, purpose), (error: unknown) =>
    error instanceof SupabaseEnvironmentError && error.code === code && error.message === code)
}

for (const [name, env, purpose] of [
  ['Staging public/server in Preview', preview, 'runtime'],
  ['Staging public/server local development', { ...configured, NODE_ENV: 'development' }, 'development'],
  ['Staging local production build', configured, 'build'],
  ['authorized Vercel Production build', deployedProduction, 'build'],
  ['authorized Vercel Production runtime', deployedProduction, 'runtime'],
  ['public fallback when server URL absent', { ...preview, SUPABASE_URL: undefined }, 'runtime'],
  ['public fallback when server URL empty', { ...preview, SUPABASE_URL: '' }, 'runtime'],
  ['isolated localhost development', { ...configured, NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: local, SUPABASE_URL: local }, 'development'],
] as const) {
  test(`environment security allows ${name}`, () => {
    const result = validateSupabaseEnvironment(env, purpose)
    assert.equal(result.publicTarget?.projectRef, result.serverTarget?.projectRef)
    assert.equal(result.offline, null)
  })
}

for (const [name, env, code, purpose = 'runtime'] of [
  ['Staging public + Production server', { ...preview, SUPABASE_URL: production }, 'ENV_PRODUCTION_TARGET_FORBIDDEN'],
  ['Production public + Staging server', { ...preview, NEXT_PUBLIC_SUPABASE_URL: production }, 'ENV_PRODUCTION_TARGET_FORBIDDEN'],
  ['Production public/server in Preview', { ...deployedProduction, VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview' }, 'ENV_PRODUCTION_TARGET_FORBIDDEN'],
  ['Production local development', { ...deployedProduction, VERCEL: undefined, VERCEL_ENV: undefined, VERCEL_TARGET_ENV: undefined, NODE_ENV: 'development' }, 'ENV_PRODUCTION_TARGET_FORBIDDEN', 'development'],
  ['Production local build', { ...configured, NEXT_PUBLIC_SUPABASE_URL: production, SUPABASE_URL: production }, 'ENV_PRODUCTION_TARGET_FORBIDDEN', 'build'],
  ['Production local CI build', { ...configured, CI: 'true', NEXT_PUBLIC_SUPABASE_URL: production, SUPABASE_URL: production }, 'ENV_PRODUCTION_TARGET_FORBIDDEN', 'build'],
  ['Production mismatched targets', { ...deployedProduction, SUPABASE_URL: staging }, 'ENV_SUPABASE_TARGET_MISMATCH'],
  ['Production requires Production project', { ...configured, VERCEL: '1', VERCEL_ENV: 'production' }, 'ENV_PRODUCTION_TARGET_REQUIRED'],
  ['malformed server override', { ...preview, SUPABASE_URL: 'not a URL' }, 'ENV_SUPABASE_URL_INVALID'],
  ['whitespace override does not fallback', { ...preview, SUPABASE_URL: ' ' }, 'ENV_SUPABASE_URL_INVALID'],
  ['unknown custom domain', { ...preview, SUPABASE_URL: 'https://db.custom.example' }, 'ENV_SUPABASE_PROJECT_UNRECOGNIZED'],
  ['unknown cloud project', { ...preview, SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' }, 'ENV_SUPABASE_PROJECT_UNRECOGNIZED'],
  ['missing public URL', { ...preview, NEXT_PUBLIC_SUPABASE_URL: undefined }, 'ENV_SUPABASE_CONFIG_REQUIRED'],
  ['missing public key', { ...preview, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }, 'ENV_SUPABASE_CONFIG_REQUIRED'],
  ['missing privileged key in Preview', { ...preview, SUPABASE_SECRET_KEY: undefined }, 'ENV_SUPABASE_CONFIG_REQUIRED'],
  ['empty Preview', { VERCEL: '1', VERCEL_ENV: 'preview' }, 'ENV_SUPABASE_CONFIG_REQUIRED'],
  ['mock Preview', { ...preview, NEXT_PUBLIC_USE_MOCK_DATA: 'true' }, 'ENV_MOCK_MODE_FORBIDDEN'],
  ['invalid mock flag', { ...preview, NEXT_PUBLIC_USE_MOCK_DATA: 'TRUE' }, 'ENV_MOCK_MODE_INVALID'],
  ['bare production label', { ...deployedProduction, VERCEL: undefined }, 'ENV_DEPLOYMENT_IDENTITY_INVALID'],
  ['contradictory deployment metadata', { ...deployedProduction, VERCEL_TARGET_ENV: 'preview' }, 'ENV_DEPLOYMENT_IDENTITY_INVALID'],
  ['missing deployment metadata', { ...configured, VERCEL: '1' }, 'ENV_DEPLOYMENT_IDENTITY_INVALID'],
  ['unknown deployment metadata', { ...configured, VERCEL: '1', VERCEL_ENV: 'staging' }, 'ENV_DEPLOYMENT_IDENTITY_INVALID'],
  ['development process claiming Production', { ...deployedProduction, NODE_ENV: 'development' }, 'ENV_DEPLOYMENT_IDENTITY_INVALID'],
  ['loopback in Preview', { ...preview, NEXT_PUBLIC_SUPABASE_URL: local, SUPABASE_URL: local }, 'ENV_PREVIEW_TARGET_REQUIRED'],
  ['different loopback databases', { ...configured, NEXT_PUBLIC_SUPABASE_URL: local, SUPABASE_URL: 'http://127.0.0.1:54322' }, 'ENV_SUPABASE_TARGET_MISMATCH'],
] as const) {
  test(`environment security blocks ${name}`, () => rejects(env, code, purpose))
}

test('strict URL parsing normalizes root slashes and checks exact scheme/authority', () => {
  assert.equal(resolveSupabaseTarget(` ${staging}/// `).url, staging)
  assert.equal(resolveSupabaseTarget(staging.toUpperCase()).projectRef, STAGING_SUPABASE_REF)
  assert.equal(resolveSupabaseTarget('http://localhost:54321/').local, true)
  assert.equal(resolveSupabaseTarget('http://[::1]:54321/').local, true)
  for (const url of [
    `http://${STAGING_SUPABASE_REF}.supabase.co`, `${staging}:444`,
    `${staging}/${PRODUCTION_SUPABASE_REF}`, `${staging}?ref=${PRODUCTION_SUPABASE_REF}`,
    `${staging}#${PRODUCTION_SUPABASE_REF}`, `${staging}/./`, `${staging}?`,
    `https://${PRODUCTION_SUPABASE_REF}.supabase.co@db.custom.example`,
    `https://user:synthetic-password@${STAGING_SUPABASE_REF}.supabase.co`,
    `${production}.attacker.example`, `https://${PRODUCTION_SUPABASE_REF}.custom.example`,
    `https://%65gdjnpmoasarrttvhgds.supabase.co`, `https:\\${STAGING_SUPABASE_REF}.supabase.co`,
    'http://127.1:54321', 'http://localhost.attacker.example',
  ]) {
    assert.throws(() => resolveSupabaseTarget(url), SupabaseEnvironmentError)
  }
})

test('credential-free build exception is explicit, local, empty and never runtime access', () => {
  const empty = { NODE_ENV: 'production', CI: 'true' }
  assert.equal(validateSupabaseEnvironment(empty, 'build').offline, 'credential_free_build')
  rejects(empty, 'ENV_SUPABASE_CONFIG_REQUIRED')
  rejects({ NODE_ENV: 'production' }, 'ENV_SUPABASE_CONFIG_REQUIRED', 'build')
  rejects({ ...empty, SUPABASE_SECRET_KEY: 'synthetic-server-key' }, 'ENV_SUPABASE_CONFIG_REQUIRED', 'build')
  rejects({ ...empty, ...preview, NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_URL: undefined }, 'ENV_SUPABASE_CONFIG_REQUIRED', 'build')
})

test('offline mock development remains explicit and disables database access', () => {
  const env = { NODE_ENV: 'development', NEXT_PUBLIC_USE_MOCK_DATA: 'true' }
  assert.equal(validateSupabaseEnvironment(env, 'development').offline, 'mock')
  rejects(env, 'ENV_SUPABASE_CONFIG_REQUIRED')
  rejects({ ...configured, ...env }, 'ENV_DATABASE_ACCESS_DISABLED')
  rejects({ ...env, NEXT_PUBLIC_SUPABASE_URL: production }, 'ENV_PRODUCTION_TARGET_FORBIDDEN', 'development')
})

const envKeys = [
  'NODE_ENV', 'CI', 'VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'NEXT_PUBLIC_USE_MOCK_DATA',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY',
]
function withEnvironment(env: SupabaseEnvironment, run: () => void) {
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  try {
    for (const key of envKeys) {
      const value = env[key as keyof SupabaseEnvironment]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    run()
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

test('direct privileged entry cannot bypass validation or use credential-free CI permission', () => {
  let calls = 0
  const factory = (() => { calls++; return {} }) as typeof createClient
  for (const env of [
    { ...preview, SUPABASE_URL: production },
    { ...configured, NEXT_PUBLIC_SUPABASE_URL: production, SUPABASE_URL: production },
    { NODE_ENV: 'production', CI: 'true' },
    { ...configured, SUPABASE_SECRET_KEY: undefined },
  ]) {
    withEnvironment(env, () => assert.throws(() => createSupabaseAdminClient(factory)))
  }
  assert.equal(calls, 0)
})

test('privileged creation uses one validated snapshot and revalidates subsequent calls', () => {
  withEnvironment(preview, () => {
    const factory = ((url: string, key: string, options: unknown) => {
      process.env.SUPABASE_URL = production
      process.env.SUPABASE_SECRET_KEY = 'changed-synthetic-key'
      assert.equal(url, staging)
      assert.equal(key, 'synthetic-server-key')
      assert.deepEqual(options, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
      return {}
    }) as typeof createClient
    createSupabaseAdminClient(factory)
    assert.throws(() => createSupabaseAdminClient(factory), /ENV_PRODUCTION_TARGET_FORBIDDEN/)
  })
})

test('server public runtime and browser development keep their isolation boundaries', () => {
  withEnvironment(preview, () => assert.deepEqual(requireSupabaseServerPublicConfig(), { url: staging, anonKey: 'synthetic-public-key' }))
  withEnvironment({ ...preview, SUPABASE_URL: production }, () => assert.throws(requireSupabaseServerPublicConfig, /ENV_PRODUCTION_TARGET_FORBIDDEN/))
  withEnvironment({ ...deployedProduction, VERCEL: undefined, VERCEL_ENV: undefined, VERCEL_TARGET_ENV: undefined, NODE_ENV: 'development' }, () => assert.throws(requireSupabasePublicConfig, /ENV_PRODUCTION_TARGET_FORBIDDEN/))
  withEnvironment(deployedProduction, () => {
    assert.equal(requireSupabaseServerPublicConfig().url, production)
    assert.equal(requireSupabasePublicConfig().url, production)
    const client = createSupabaseAdminClient()
    assert.ok(client.auth)
  })
})

test('real privileged SDK routes synthetic reads only to the validated effective override', async () => {
  let client: ReturnType<typeof createClient>
  withEnvironment({ ...preview, NEXT_PUBLIC_SUPABASE_URL: `${staging}///`, SUPABASE_URL: `${staging}/` }, () => {
    client = createSupabaseAdminClient(((url, key, options) => createClient(url, key, {
      ...options,
      global: { fetch: async input => {
        assert.equal(new URL(String(input)).origin, staging)
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } })
      } },
    })) as typeof createClient)
  })
  const response = await client!.from('synthetic_security_fixture').select('id')
  assert.equal(response.error, null)
  assert.deepEqual(response.data, [])
})

test('process guard loads Next env files before validation and emits only error codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc16e-env-'))
  const loader = new URL('./typescript-alias-loader.mjs', import.meta.url).href
  const script = fileURLToPath(new URL('../scripts/check-runtime-environment.ts', import.meta.url))
  const base = { ...process.env }
  for (const key of envKeys) delete base[key]
  delete base.__NEXT_PROCESSED_ENV
  const run = (env: SupabaseEnvironment, purpose: string) => spawnSync(process.execPath,
    ['--import', loader, script, purpose], { cwd: dir, env: { ...base, ...env }, encoding: 'utf8' })
  try {
    const safeBuild = run({ CI: 'true' }, 'build')
    assert.equal(safeBuild.status, 0, safeBuild.stderr || safeBuild.error?.message)
    assert.equal(run({ NEXT_PUBLIC_USE_MOCK_DATA: 'true' }, 'development').status, 0)
    assert.equal(run(deployedProduction, 'build').status, 0)
    assert.equal(run(preview, 'runtime').status, 0)
    assert.equal(run({ ...preview, SUPABASE_URL: production }, 'build').status, 1)
    writeFileSync(join(dir, '.env.production.local'), `NEXT_PUBLIC_SUPABASE_URL=${staging}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-public-key\nSUPABASE_URL=${production}\nSUPABASE_SECRET_KEY=synthetic-secret-do-not-log\n`)
    const denied = run({}, 'build')
    assert.equal(denied.status, 1)
    assert.equal(denied.stderr.trim(), '[ENV GUARD] ENV_PRODUCTION_TARGET_FORBIDDEN')
    assert.doesNotMatch(denied.stdout + denied.stderr, /synthetic-secret|https:\/\//)
    assert.equal(run({}, 'runtime').status, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
