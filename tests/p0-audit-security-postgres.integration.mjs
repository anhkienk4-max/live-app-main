import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { assertIsolatedContainer, assertIsolatedCI } from './rc16-rehearsal-safety.mjs'

const container = process.argv[2] === '--container' ? process.argv[3] : null
if (container) {
  assert.equal(process.argv.length, 4)
  assert.match(container, /^rc16f-pg17-[a-z0-9-]{1,40}$/)
  assertIsolatedContainer(JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0], '17')
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
const reportSource = read('supabase/migrations/20260823000000_p3_report_persistence.sql')
const payrollSource = read('supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql')
const migrations = readdirSync('supabase/migrations').filter(n => n.endsWith('_p0_audit_privilege_hardening.sql'))
assert.equal(migrations.length, 1)
const payrollFn = extract(payrollSource, /create or replace function public\.workforce_rc16_immutable_payroll_audit\(\)[\s\S]*?end \$\$;/i)
const payrollTrigger = extract(payrollSource, /create trigger workforce_payroll_audit_immutable[\s\S]*?workforce_rc16_immutable_payroll_audit\(\);/i)
const fixture = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema private; create schema auth;
create table public.business_users(id text primary key,full_name text,system_permission text);
insert into public.business_users values ('test-admin','Test Admin','admin'),('test-leader','Test Leader','leader'),('test-member','Test Member','member');
create function private.current_business_user_id() returns text language sql stable as $$ select nullif(current_setting('p0.test_actor',true),'') $$;
create function private.current_system_permission() returns text language sql stable security definer set search_path='' as $$ select system_permission from public.business_users where id=private.current_business_user_id() $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
grant usage on schema private,auth to authenticated,service_role;
create table public.reports(id text primary key,version_number integer default 0);
insert into public.reports(id) values('test-report');
create table public.workforce_payroll_periods(id text primary key);
insert into public.workforce_payroll_periods values('test-period');
${extract(reportSource, /create table public\.report_revisions \([\s\S]*?\n\);/i)}
${extract(auditSource, /create table public\.audit_logs \([\s\S]*?\n\);/i)}
${extract(auditSource, /create table public\.audit_log_reviews \([\s\S]*?\n\);/i)}
${extract(payrollSource, /create table if not exists public\.workforce_payroll_audit \([\s\S]*?\n\);/i)}
${fn('supabase/migrations/20260903120000_core_v1_recursive_audit_sanitizer.sql','private.audit_sanitize_row')}
${fn('supabase/migrations/20260830113000_core_v1_persistent_audit.sql','private.audit_action_for_change')}
${fn('supabase/migrations/20260913120000_shift_status_mode_and_auto_completion.sql','private.capture_audit_row_change')}
${fn('supabase/migrations/20260823000000_p3_report_persistence.sql','private.record_report_revision')}
${fn('supabase/migrations/20260830113000_core_v1_persistent_audit.sql','public.update_audit_review')}
${payrollFn} ${payrollTrigger}
create trigger audit_report_revisions_change after insert or update or delete on public.report_revisions for each row execute function private.capture_audit_row_change();
alter table public.report_revisions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_log_reviews enable row level security;
alter table public.workforce_payroll_audit enable row level security;
grant all on public.report_revisions,public.audit_logs,public.audit_log_reviews,public.workforce_payroll_audit to service_role;
grant usage,select on sequence public.workforce_payroll_audit_id_seq to service_role;
grant select on public.audit_logs,public.audit_log_reviews to authenticated;
${read('supabase/migrations/20260830114000_core_v1_persistent_audit_read_permission.sql')}
create policy audit_log_reviews_read on public.audit_log_reviews for select to authenticated using ((select private.current_system_permission())='admin');
revoke all on function public.update_audit_review(text,text,text,text) from public,anon,authenticated;
grant execute on function public.update_audit_review(text,text,text,text) to authenticated;
revoke all on function private.record_report_revision(text,text,text,text,text,jsonb,jsonb,jsonb,text[]) from public,anon,authenticated;
create function public.p0_assert(p_condition boolean,p_label text) returns void language plpgsql as $$ begin
  if p_condition is distinct from true then raise exception 'P0_ASSERT_FAILED: %',p_label; end if;
  raise notice 'P0_PASS: %',p_label; end $$;
create function public.p0_assert_denied(p_command text,p_state text,p_label text) returns void language plpgsql as $$ begin
  begin execute p_command; exception when others then
    if sqlstate=p_state then raise notice 'P0_PASS: %',p_label; return; end if;
    raise;
  end;
  raise exception 'P0_EXPECTED_DENIAL: %',p_label;
end $$;
`
const commands = `select 'P0_SERVER_VERSION='||current_setting('server_version');
begin;
do $$ begin
  if current_setting('server_version_num')::integer not between 170000 and 179999
    or (select count(*) from information_schema.tables where table_schema='public')<>0 then
    raise exception 'Requires empty isolated PostgreSQL 17';
  end if;
end $$;
${fixture}
${read('tests/fixtures/p0_audit_security_assertions.sql').split('-- APPLY_HOTFIX').join(read('supabase/migrations/'+migrations[0]))}
rollback;
select 'P0_FIXTURE_ROLLED_BACK='||((select count(*) from information_schema.tables where table_schema='public')=0
  and not exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role')))::text;`
const child = spawn(container ? 'docker' : 'psql', [
  ...(container ? ['exec','-i',container,'psql'] : []), '-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At',
], { stdio: ['pipe','pipe','pipe'], timeout: 60000 })
let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
child.stdin.end(commands)
const code = await new Promise((resolve,reject) => { child.on('error',reject); child.on('close',resolve); child.stdin.on('error',reject) })
assert.equal(code,0,output)
const passed = output.match(/P0_PASS:/g)?.length ?? 0
assert.equal(passed,66,output)
const version = output.match(/P0_SERVER_VERSION=([^\r\n]+)/)?.[1]
assert.match(version ?? '', /^17\./)
assert.match(output,/P0_FIXTURE_ROLLED_BACK=true/)
console.log(`PostgreSQL ${version} isolated audit hotfix regression: ${passed} PASS; 0 FAIL. All fixture changes rolled back.`)
