import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { assertIsolatedContainer, assertIsolatedCI } from './rc16-rehearsal-safety.mjs'

const container = process.argv[2] === '--container' ? process.argv[3] : null
if (container) {
  assert.equal(process.argv.length, 4)
  assert.match(container, /^(rc16b-payroll-test|rc16f-pg(?:16|17)-[a-z0-9-]{1,40})$/)
  const inspectOut = execFileSync('docker', ['inspect', container], { encoding: 'utf8' })
  const info = JSON.parse(inspectOut)[0]
  const major = info.Config.Image.includes('postgres:17') ? '17' : '16'
  assertIsolatedContainer(info, major)
} else {
  assert.equal(process.argv.length, 2)
  assertIsolatedCI(process.env)
}

const read = path => readFileSync(path, 'utf8')
function extract(source, pattern) {
  const match = source.match(pattern)
  assert.ok(match, `Fixture source object missing: ${pattern}`)
  return match[0]
}
function fn(path, name) {
  return extract(read(path), new RegExp(`create (?:or replace )?function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`, 'i'))
}

const auditSource = read('supabase/migrations/20260830113000_core_v1_persistent_audit.sql')
const payrollSource = read('supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql')
const rc17aAuditMigration = read('supabase/migrations/20261017000000_rc17a_actual_staffing_audit.sql')

const workforceActualGuardFn = extract(payrollSource, /create or replace function public\.workforce_rc16_immutable_approved_segment\(\)[\s\S]*?end \$\$;/i)
const workforceActualSegmentsTable = extract(payrollSource, /create table if not exists public\.workforce_actual_segments \([\s\S]*?\n\);/i)

const captureAuditFn = extract(rc17aAuditMigration, /create or replace function private\.capture_workforce_actual_audit\(\)[\s\S]*?end;\n\$\$;/i)

const fixture = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists private;
create schema if not exists auth;

create table if not exists public.business_users (
  id text primary key,
  full_name text,
  system_permission text check (system_permission in ('admin', 'leader', 'member'))
);

create table if not exists public.shifts (
  id text primary key,
  status text not null,
  date date not null,
  start_time text not null,
  end_time text not null,
  host_id text references public.business_users(id),
  support_id text references public.business_users(id),
  deleted_at timestamptz
);

create table if not exists public.shift_registrations (
  id text primary key,
  shift_id text references public.shifts(id),
  user_id text references public.business_users(id),
  operational_role text not null,
  status text not null
);

create or replace function private.current_business_user_id()
returns text language sql stable as $$
  select nullif(current_setting('rc17a.test_actor', true), '')
$$;

create or replace function private.current_system_permission()
returns text language sql stable security definer set search_path = '' as $$
  select system_permission from public.business_users where id = private.current_business_user_id()
$$;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select null::uuid
$$;

grant usage on schema private, auth to authenticated, service_role;

${extract(auditSource, /create table public\.audit_logs \([\s\S]*?\n\);/i)}

${fn('supabase/migrations/20260903130000_f11_sanitizer_case_normalization.sql', 'private.audit_sanitize_row')}

${workforceActualSegmentsTable}

${workforceActualGuardFn}

drop trigger if exists workforce_actual_guard on public.workforce_actual_segments;
create trigger workforce_actual_guard
  before insert or update or delete on public.workforce_actual_segments
  for each row execute function public.workforce_rc16_immutable_approved_segment();

${captureAuditFn}

drop trigger if exists audit_workforce_actual_segments_change on public.workforce_actual_segments;
create trigger audit_workforce_actual_segments_change
  after insert or update or delete on public.workforce_actual_segments
  for each row execute function private.capture_workforce_actual_audit();

create index if not exists workforce_actual_staff_active_overlap
  on public.workforce_actual_segments (staff_id, actual_start_at, actual_end_at)
  where event_kind = 'worked' and review_status = 'approved';

alter table public.audit_logs enable row level security;
alter table public.workforce_actual_segments enable row level security;

grant all on public.audit_logs, public.workforce_actual_segments to service_role;
grant select on public.audit_logs to authenticated;
grant select, insert, update on public.workforce_actual_segments to authenticated;

drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read
  on public.audit_logs for select to authenticated
  using (
    (select private.current_system_permission()) = 'admin'
    or (
      (select private.current_system_permission()) = 'leader'
      and module in ('calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports')
    )
  );
`

const assertionsSql = read('tests/fixtures/rc17a_actual_staffing_assertions.sql')

const commands = `
select 'RC17A_SERVER_VERSION=' || current_setting('server_version');
begin;
${fixture}
${assertionsSql}
rollback;
select 'RC17A_FIXTURE_ROLLED_BACK=' || (
  (select count(*) = 0 from information_schema.tables where table_schema = 'public' and table_name in ('workforce_actual_segments', 'audit_logs'))
)::text;
`

const child = spawn(container ? 'docker' : 'psql', [
  ...(container ? ['exec', '-i', container, 'psql'] : []),
  '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At',
], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })

let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
child.stdin.end(commands)

const code = await new Promise((resolve, reject) => {
  child.on('error', reject)
  child.on('close', resolve)
  child.stdin.on('error', reject)
})

assert.equal(code, 0, output)

const passed = output.match(/RC17A_PASS:/g)?.length ?? 0
assert.ok(passed >= 15, `Expected at least 15 RC17A SQL assertions to pass, got ${passed}:\n${output}`)

const version = output.match(/RC17A_SERVER_VERSION=([^\r\n]+)/)?.[1]
assert.ok(version, 'Server version must be present')
assert.match(output, /RC17A_FIXTURE_ROLLED_BACK=true/, 'Transaction must roll back cleanly')

const passNotices = output.split(/\r?\n/).filter(line => line.includes('RC17A_PASS:'))
passNotices.forEach(n => console.log('  ' + n.trim()))

console.log(`PostgreSQL ${version} RC1.7A Actual Staffing integration suite: ${passed} PASS; 0 FAIL.`)
console.log('All assertions passed; transaction rolled back cleanly with zero database mutation.')
