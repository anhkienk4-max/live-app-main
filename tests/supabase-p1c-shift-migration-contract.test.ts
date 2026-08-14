import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const migrationDirectory = path.join(root, 'supabase', 'migrations')

async function p1cMigration() {
  const files = await readdir(migrationDirectory)
  const file = files.find(candidate => candidate.endsWith('_p1c_shift_persistence.sql'))
  assert.ok(file, 'P1C shift persistence migration is missing')
  return {
    file,
    sql: await readFile(path.join(migrationDirectory, file), 'utf8'),
  }
}

test('P1C creates only the two shift persistence tables with text business IDs', async () => {
  const { sql } = await p1cMigration()
  const tables = [...sql.matchAll(/create table public\.([a-z_]+)/gi)].map(match => match[1])

  assert.deepEqual(tables, ['shifts', 'shift_registrations'])
  assert.match(sql, /create table public\.shifts[\s\S]*?id text primary key/i)
  assert.match(sql, /create table public\.shift_registrations[\s\S]*?id text primary key/i)
  assert.match(sql, /shift_id text not null references public\.shifts\(id\)/i)
  assert.match(sql, /user_id text not null references public\.business_users\(id\)/i)
  assert.doesNotMatch(sql, /values\s*\(\s*'p1c-/i)
})

test('P1C fixes wall-clock semantics to Asia Ho Chi Minh and derives overnight bounds', async () => {
  const { sql } = await p1cMigration()

  assert.match(sql, /timezone text not null default 'Asia\/Ho_Chi_Minh'/i)
  assert.match(sql, /check \(timezone = 'Asia\/Ho_Chi_Minh'\)/i)
  assert.match(sql, /new\.end_date := new\.date \+ case when new\.end_time < new\.start_time then 1 else 0 end/i)
  assert.match(sql, /new\.start_at := \(new\.date \+ new\.start_time\) at time zone 'Asia\/Ho_Chi_Minh'/i)
  assert.match(sql, /new\.end_at := \(new\.end_date \+ new\.end_time\) at time zone 'Asia\/Ho_Chi_Minh'/i)
  assert.match(sql, /duration_minutes between 1 and 1439/i)
})

test('P1C keeps registrations canonical and projections trigger-synchronized', async () => {
  const { sql } = await p1cMigration()

  assert.match(sql, /function private\.sync_shift_staffing_projection\(p_shift_id text\)/i)
  for (const [role, field] of [
    ['host', 'host_id'],
    ['support', 'support_id'],
    ['technical', 'technical_id'],
  ] as const) {
    assert.match(
      sql,
      new RegExp(`${field} = \\([\\s\\S]*?operational_role = '${role}'[\\s\\S]*?status in \\('approved', 'manually_assigned'\\)`, 'i'),
    )
  }
  assert.match(sql, /create trigger shift_registrations_sync_projection[\s\S]*?after insert or update or delete/i)
  assert.doesNotMatch(sql, /status in \([^)]*available/i)
})

test('P1C enforces capacity, active uniqueness, pending overlap and serializes writers', async () => {
  const { sql } = await p1cMigration()

  for (const role of ['host', 'support', 'technical']) {
    assert.match(sql, new RegExp(`shifts_required_${role}_count_check check \\(required_${role}_count between 0 and 100\\)`, 'i'))
  }
  const capacityNormalizer = sql.match(
    /create or replace function private\.normalize_shift_capacity[\s\S]*?revoke all on function private\.normalize_shift_capacity/i,
  )?.[0]
  assert.ok(capacityNormalizer, 'P1C capacity normalizer is missing')
  assert.match(capacityNormalizer, /p_value is null or btrim\(p_value\) = ''[\s\S]*?return p_default/i)
  assert.match(capacityNormalizer, /parsed < 0 or parsed > 100 or trunc\(parsed\) <> parsed/i)
  assert.doesNotMatch(capacityNormalizer, /parsed\s*=\s*0[\s\S]*?return p_default/i)
  assert.match(sql, /create unique index shift_registrations_active_role_uidx[\s\S]*?where status in \('pending', 'approved', 'manually_assigned'\)/i)
  assert.match(sql, /function private\.assert_shift_capacity/i)
  assert.match(sql, /message = 'SHIFT_FULL'/i)
  assert.match(sql, /registration\.status in \('pending', 'approved', 'manually_assigned'\)[\s\S]*?other_shift\.start_at < p_shift\.end_at[\s\S]*?other_shift\.end_at > p_shift\.start_at/i)
  assert.match(sql, /for update/gi)
  assert.ok((sql.match(/pg_advisory_xact_lock/gi) ?? []).length >= 5)
})

test('P1C RLS preserves scoped Member visibility and denies direct writes', async () => {
  const { sql } = await p1cMigration()

  assert.match(sql, /alter table public\.shifts enable row level security/i)
  assert.match(sql, /alter table public\.shift_registrations enable row level security/i)
  assert.match(sql, /function private\.can_read_shift\(p_shift_id text\)/i)
  assert.match(sql, /shift\.status = 'scheduled'[\s\S]*?shift\.registration_locked = false[\s\S]*?shift\.end_at > statement_timestamp\(\)/i)
  assert.match(sql, /registration\.user_id = \(select private\.current_business_user_id\(\)\)/i)
  assert.match(sql, /registration\.status in \('pending', 'approved', 'manually_assigned'\)/i)
  assert.match(sql, /grant select on table public\.shifts to authenticated/i)
  assert.match(sql, /grant select on table public\.shift_registrations to authenticated/i)
  assert.doesNotMatch(sql, /grant (?:insert|update|delete|select, insert|all).*table public\.(?:shifts|shift_registrations).*authenticated/i)
  const policies = [...sql.matchAll(/create policy\s+[a-z_]+[\s\S]*?;/gi)].map(match => match[0])
  assert.equal(policies.length, 2)
  assert.ok(policies.every(policy => /\bfor select\b/i.test(policy)))
})

test('P1C exposes only authenticated hardened RPCs and derives actors from auth mapping', async () => {
  const { sql } = await p1cMigration()
  const rpcNames = [
    'create_shift',
    'update_shift',
    'set_shift_registration_lock',
    'register_for_shift',
    'cancel_own_shift_registration',
    'approve_shift_registration',
    'reject_shift_registration',
    'manual_assign_shift_staff',
    'remove_shift_staffing',
  ]

  for (const name of rpcNames) {
    const definition = new RegExp(`function public\\.${name}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i')
    assert.match(sql, definition, `${name} must be a hardened SECURITY DEFINER RPC`)
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated`, 'i'))
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+to authenticated`, 'i'))
  }

  assert.match(sql, /actor_id := private\.require_shift_actor\((?:true|false)\)/i)
  assert.match(sql, /private\.current_business_user_id\(\)/i)
  assert.doesNotMatch(
    sql,
    /function public\.[^(]+\([^)]*\bp_(?:actor|reviewer|current_user)_id\b/i,
  )
  assert.doesNotMatch(sql, /auth\.jwt\(\)|raw_user_meta_data|user_metadata/i)
})

test('P1C SQL persona suites and test-only fixture are outside production migrations', async () => {
  const fixture = await readFile(path.join(root, 'supabase', 'tests', 'fixtures', 'p1c_shift_data.sql'), 'utf8')
  const readSuite = await readFile(path.join(root, 'supabase', 'tests', 'p1c_shift_rls.sql'), 'utf8')
  const rpcSuite = await readFile(path.join(root, 'supabase', 'tests', 'p1c_shift_rpc.sql'), 'utf8')
  const capacitySuite = await readFile(path.join(root, 'supabase', 'tests', 'p1c_shift_capacity_rc.sql'), 'utf8')

  assert.match(fixture, /app\.p1b_fixture_mode=isolated-test/i)
  assert.match(readSuite, /set local role anon/i)
  assert.match(readSuite, /unmapped/i)
  assert.match(readSuite, /inactive/i)
  assert.match(rpcSuite, /SHIFT_FULL/i)
  assert.match(rpcSuite, /SHIFT_CONFLICT/i)
  assert.match(rpcSuite, /Asia\/Ho_Chi_Minh/i)
  assert.match(rpcSuite, /host_id/i)
  assert.match(capacitySuite, /required_host_count between 0 and 100/i)
  assert.match(capacitySuite, /normalize_shift_capacity\('0', 1::smallint\) <> 0/i)
  assert.match(capacitySuite, /SHIFT_FULL/i)
  assert.match(capacitySuite, /rollback;/i)
})
