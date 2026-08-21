import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const migrationDirectory = path.join(process.cwd(), 'supabase', 'migrations')
const foundationPath = path.join(migrationDirectory, '20260811110219_p1b_foundation.sql')
const masterDataPath = path.join(migrationDirectory, '20260811110239_p1b_master_data.sql')
const bootstrapPath = path.join(migrationDirectory, '20260811112834_p1b_production_bootstrap.sql')
const hardeningPath = path.join(migrationDirectory, '20260814064606_p1b_security_hardening.sql')
const fixtureDirectory = path.join(process.cwd(), 'supabase', 'tests', 'fixtures')
const authFixturePath = path.join(fixtureDirectory, 'p1b_auth_users.sql')
const demoFixturePath = path.join(fixtureDirectory, 'p1b_demo_master_data.sql')

async function migrationText() {
  const [foundation, masterData, bootstrap, hardening, authFixture, demoFixture] = await Promise.all([
    readFile(foundationPath, 'utf8'),
    readFile(masterDataPath, 'utf8'),
    readFile(bootstrapPath, 'utf8'),
    readFile(hardeningPath, 'utf8'),
    readFile(authFixturePath, 'utf8'),
    readFile(demoFixturePath, 'utf8'),
  ])

  return {
    foundation,
    masterData,
    bootstrap,
    hardening,
    authFixture,
    demoFixture,
    core: `${foundation}\n${masterData}\n${bootstrap}`,
    production: `${foundation}\n${masterData}\n${bootstrap}\n${hardening}`,
    all: `${foundation}\n${masterData}\n${bootstrap}\n${hardening}\n${authFixture}\n${demoFixture}`,
  }
}

test('migration order separates replayable schema from strict production bootstrap', async () => {
  const files = (await readdir(migrationDirectory)).sort()
  const p1bFiles = files.filter(file => file.includes('_p1b_'))

  assert.deepEqual(p1bFiles, [
    '20260811110219_p1b_foundation.sql',
    '20260811110239_p1b_master_data.sql',
    '20260811112834_p1b_production_bootstrap.sql',
    '20260814064606_p1b_security_hardening.sql',
  ])
  assert.ok(files.indexOf(path.basename(foundationPath)) < files.indexOf(path.basename(masterDataPath)))
  assert.ok(files.indexOf(path.basename(masterDataPath)) < files.indexOf(path.basename(bootstrapPath)))
  assert.ok(files.indexOf(path.basename(bootstrapPath)) < files.indexOf(path.basename(hardeningPath)))
  assert.ok(files.every(file => !file.includes('fixture') && !file.includes('demo')))
})

test('P1B security hardening removes direct API-role execution without changing the event trigger', async () => {
  const { hardening } = await migrationText()

  assert.match(hardening, /to_regprocedure\('public\.rls_auto_enable\(\)'\) is null/i)
  assert.match(
    hardening,
    /revoke execute on function public\.rls_auto_enable\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  )
  assert.match(hardening, /has_function_privilege\('anon', 'public\.rls_auto_enable\(\)', 'execute'\)/i)
  assert.match(hardening, /has_function_privilege\('authenticated', 'public\.rls_auto_enable\(\)', 'execute'\)/i)
  assert.match(hardening, /has_function_privilege\('service_role', 'public\.rls_auto_enable\(\)', 'execute'\)/i)
  assert.doesNotMatch(hardening, /drop\s+(?:event\s+trigger|function)|disable\s+trigger|create\s+or\s+replace\s+function/i)
})

test('P1B creates only the four approved public business tables', async () => {
  const { masterData } = await migrationText()
  const tables = [...masterData.matchAll(/create table public\.([a-z_]+)/gi)]
    .map(match => match[1])

  assert.deepEqual(tables, ['business_users', 'brands', 'platforms', 'campaigns'])
  assert.doesNotMatch(masterData, /create table public\.(?:shifts|shift_registrations|reports|dashboard_updates)\b/i)
})

test('business users preserve text IDs and use a unique nullable Auth UUID foreign key', async () => {
  const { masterData } = await migrationText()

  assert.match(masterData, /id text primary key/i)
  assert.match(masterData, /auth_user_id uuid null references auth\.users\(id\) on delete set null/i)
  assert.match(masterData, /create unique index business_users_auth_user_id_uidx[\s\S]*where auth_user_id is not null/i)
  assert.match(masterData, /create unique index business_users_email_lower_uidx[\s\S]*lower\(email\)/i)
})

test('permission and operational-role domains are constrained', async () => {
  const { masterData } = await migrationText()

  assert.match(masterData, /system_permission in \('member', 'leader', 'admin'\)/i)
  assert.match(masterData, /operational_roles <@ array\['host', 'support', 'technical'\]::text\[\]/i)
  assert.match(masterData, /account_status in \('pending_email_verification', 'pending_approval', 'rejected', 'active'\)/i)
})

test('campaign relationships, dates and query indexes are explicit', async () => {
  const { masterData } = await migrationText()

  assert.match(masterData, /brand_id text not null references public\.brands\(id\) on delete restrict/i)
  assert.match(masterData, /owner_id text null references public\.business_users\(id\) on delete set null/i)
  assert.match(masterData, /check \(end_date >= start_date\)/i)
  assert.match(masterData, /create index campaigns_brand_id_idx/i)
  assert.match(masterData, /create index campaigns_status_dates_idx/i)
  assert.match(masterData, /using gin \(platform_ids\)/i)
})

test('all P1B tables use server timestamps, lifecycle columns and update triggers', async () => {
  const { foundation, masterData } = await migrationText()

  assert.match(foundation, /new\.updated_at := statement_timestamp\(\)/i)
  assert.match(foundation, /security invoker[\s\S]*set search_path = ''/i)

  for (const table of ['business_users', 'brands', 'platforms', 'campaigns']) {
    const tableStart = masterData.indexOf(`create table public.${table}`)
    assert.notEqual(tableStart, -1)
    const nextTable = masterData.indexOf('create table public.', tableStart + 1)
    const definition = masterData.slice(tableStart, nextTable === -1 ? undefined : nextTable)
    assert.match(definition, /created_at timestamptz not null default statement_timestamp\(\)/i)
    assert.match(definition, /updated_at timestamptz not null default statement_timestamp\(\)/i)
    assert.match(definition, /deleted_at timestamptz null/i)
    assert.match(definition, /archived_at timestamptz null/i)
    assert.match(masterData, new RegExp(`create trigger ${table}_set_updated_at`, 'i'))
  }
})

test('RLS is enabled and every exposed policy targets authenticated users only', async () => {
  const { masterData } = await migrationText()

  for (const table of ['business_users', 'brands', 'platforms', 'campaigns']) {
    assert.match(masterData, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(masterData, new RegExp(`revoke all on table public\\.${table} from anon`, 'i'))
  }

  const policyTargets = [...masterData.matchAll(/create policy[\s\S]*?\bto\s+(anon|authenticated)\b/gi)]
    .map(match => match[1].toLowerCase())
  assert.ok(policyTargets.length >= 8)
  assert.deepEqual(new Set(policyTargets), new Set(['authenticated']))
})

test('authorization helpers derive identity from auth.uid with hardened definer settings', async () => {
  const { masterData } = await migrationText()

  for (const helper of [
    'current_business_user_id',
    'current_business_user_is_active',
    'current_system_permission',
    'is_admin',
    'is_leader_or_admin',
  ]) {
    assert.match(masterData, new RegExp(`function private\\.${helper}\\(\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i'))
  }

  assert.match(masterData, /auth\.uid\(\)/i)
  assert.doesNotMatch(masterData, /raw_user_meta_data|user_metadata|request\.headers|current_setting\s*\(\s*'request\./i)
  assert.match(masterData, /revoke all on function private\.is_admin\(\) from public, anon, authenticated/i)
})

test('inactive, unapproved, archived or deleted identities fail closed', async () => {
  const { masterData } = await migrationText()
  const activeHelper = masterData.match(
    /function private\.current_business_user_is_active\(\)[\s\S]*?\$\$;/i,
  )?.[0] ?? ''

  assert.match(activeHelper, /auth_user_id = \(select auth\.uid\(\)\)/i)
  assert.match(activeHelper, /status = 'active'/i)
  assert.match(activeHelper, /account_status = 'active'/i)
  assert.match(activeHelper, /archived_at is null/i)
  assert.match(activeHelper, /deleted_at is null/i)
  assert.match(masterData, /business_users_active_directory_select[\s\S]*?status = 'active'[\s\S]*?account_status = 'active'/i)
})

test('P1B grants shared reads but keeps writes admin-only', async () => {
  const { masterData } = await migrationText()

  assert.match(masterData, /create policy business_users_active_directory_select/i)
  assert.match(masterData, /create policy brands_shared_select/i)
  assert.match(masterData, /create policy platforms_shared_select/i)
  assert.match(masterData, /create policy campaigns_shared_select/i)
  assert.match(masterData, /create policy business_users_admin_all[\s\S]*?select private\.is_admin\(\)/i)
  assert.match(masterData, /create policy campaigns_admin_all[\s\S]*?select private\.is_admin\(\)/i)
  assert.doesNotMatch(masterData, /create policy [\s\S]*?select private\.is_leader_or_admin\(\)/i)
})

test('production bootstrap resolves all six Auth users and verifies server-controlled app metadata', async () => {
  const { bootstrap } = await migrationText()

  const expectedMappings = [
    ['1', 'admin@livestream.com', 'admin'],
    ['2', 'leader@livestream.com', 'leader'],
    ['3', 'host1@livestream.com', 'member'],
    ['4', 'host2@livestream.com', 'member'],
    ['5', 'support1@livestream.com', 'member'],
    ['6', 'technical1@livestream.com', 'member'],
  ] as const

  for (const [id, email, permission] of expectedMappings) {
    assert.match(bootstrap, new RegExp(`'${id}'[^\\n]*'${email}'[^\\n]*'[^']+'[^\\n]*'[^']+'[^\\n]*'${permission}'`, 'i'))
  }

  assert.match(bootstrap, /from auth\.users/i)
  assert.match(bootstrap, /cardinality\(auth_ids\)[\s\S]*<> 1/i)
  assert.match(bootstrap, /raw_app_meta_data/i)
  assert.match(bootstrap, /app_metadata mapping mismatch/i)
  assert.doesNotMatch(bootstrap, /update\s+auth\.users|insert\s+into\s+auth\.users/i)
})

test('production bootstrap is rerun-safe, preserves newer rows and excludes demo data', async () => {
  const { bootstrap } = await migrationText()

  assert.ok((bootstrap.match(/on conflict \(id\) do update/gi) ?? []).length >= 2)
  assert.ok((bootstrap.match(/updated_at < excluded\.updated_at/gi) ?? []).length >= 2)
  assert.doesNotMatch(bootstrap, /\btruncate\b|drop\s+table|delete\s+from/i)
  assert.match(bootstrap, /insert into public\.business_users/i)
  assert.match(bootstrap, /insert into public\.platforms/i)
  assert.doesNotMatch(bootstrap, /insert into public\.(?:brands|campaigns|shifts|shift_registrations|reports|dashboard_updates)/i)
})

test('production bootstrap includes the stable platform compatibility IDs', async () => {
  const { bootstrap } = await migrationText()

  for (const id of ['p1', 'p2', 'p3', 'p4']) assert.match(bootstrap, new RegExp(`'${id}'`))
})

test('test-only fixtures are guarded and remain outside production migration order', async () => {
  const { authFixture, demoFixture } = await migrationText()
  const migrationFiles = await readdir(migrationDirectory)

  assert.ok(migrationFiles.every(file => file !== path.basename(authFixturePath)))
  assert.ok(migrationFiles.every(file => file !== path.basename(demoFixturePath)))
  assert.match(authFixture, /app\.p1b_fixture_mode=isolated-test/i)
  assert.match(demoFixture, /app\.p1b_fixture_mode=isolated-test/i)
  assert.match(authFixture, /10000000-0000-4000-8000-000000000001/i)
  assert.match(authFixture, /10000000-0000-4000-8000-000000000006/i)
  assert.doesNotMatch(authFixture, /encrypted_password|\bpassword\b|access_token|refresh_token/i)
})

test('demo brands and campaigns stay in the test fixture with a frozen c3 snapshot', async () => {
  const { demoFixture } = await migrationText()

  for (const id of ['b1', 'b2', 'b3', 'b4']) assert.match(demoFixture, new RegExp(`'${id}'`))
  for (const id of ['c1', 'c2', 'c3']) assert.match(demoFixture, new RegExp(`'${id}'`))

  assert.match(demoFixture, /'c3'[\s\S]*?'2026-08-11'::date[\s\S]*?'2026-08-18'::date/i)
})

test('migration package contains no credential fields or client-controlled authorization source', async () => {
  const { core, production } = await migrationText()

  assert.doesNotMatch(core, /\bservice_role\b/i)
  assert.doesNotMatch(production, /\bpassword\b|access_token|refresh_token|NEXT_PUBLIC|raw_user_meta_data|user_metadata/i)
  assert.doesNotMatch(production, /auth\.jwt\(\)|request body|request header/i)
  assert.match(production, /private\.current_system_permission/i)
})
