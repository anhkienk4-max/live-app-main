import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const container = process.env.STAFFING_PG_CONTAINER
assert.equal(container, 'ada-staffing-pg17', 'Disposable PostgreSQL 17 container required')
const root = process.cwd()
const migrationPath = 'supabase/migrations/20261029120000_rc19_staffing_role_scoped_gap_filter.sql'
const migration = readFileSync(`${root}/${migrationPath}`, 'utf8')
const transactionalMigration = migration.replace(/^\s*begin\s*;/i, '').replace(/\s*commit\s*;\s*$/i, '')
const callerMigration = readFileSync(`${root}/supabase/migrations/20261012171503_rc16k_bounded_shift_lists.sql`, 'utf8')
const helper = sourceFunction(migration, 'private.filtered_shift_ids')
const legacyHelper = sourceFunction(callerMigration, 'private.filtered_shift_ids')
const listPageRpc = sourceFunction(callerMigration, 'public.get_shift_list_page')

function sourceFunction(source, qualifiedName) {
  const start = source.toLowerCase().indexOf(`create function ${qualifiedName.toLowerCase()}(`)
  const replaceStart = source.toLowerCase().indexOf(`create or replace function ${qualifiedName.toLowerCase()}(`)
  const offset = start < 0 ? replaceStart : replaceStart < 0 ? start : Math.min(start, replaceStart)
  assert.ok(offset >= 0, `Missing ${qualifiedName}`)
  const end = source.indexOf('$$;', offset)
  assert.ok(end >= 0, `Missing body terminator for ${qualifiedName}`)
  return source.slice(offset, end + 3)
}

function psql(sql, expectedFailure = false) {
  const result = spawnSync('docker', [
    'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-t', '-A',
  ], { input: sql, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error) throw result.error
  if (expectedFailure) assert.notEqual(result.status, 0, `Expected SQL rejection: ${sql}`)
  else assert.equal(result.status, 0, `psql failed: ${result.stderr}`)
  return result.stdout.trim()
}

function query(sql) {
  return psql(sql).split('\n').filter(Boolean).at(-1) ?? ''
}

function as(actor, sql) {
  return `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`
}

assert.equal(Number(query("select current_setting('server_version_num')::integer / 10000")), 17)
assert.match(callerMigration, /select\s+\*\s+from\s+private\.filtered_shift_ids\(p_scope,p_filters\)/i)
assert.match(callerMigration, /private\.filtered_shift_ids\('all',p_filters-'scope'-'roles'-'statuses'-'requesterIds'-'search'\)/i)
assert.match(callerMigration, /private\.filtered_shift_ids\('all',\s*jsonb_set/i)

const fixture = `
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema if not exists private;
create table public.business_users(id text primary key, system_permission text not null);
insert into public.business_users values ('admin','admin'),('leader','leader'),('member','member');
create or replace function private.current_business_user_id() returns text
language sql stable security definer set search_path=''
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'') $$;
create table public.brands(id text primary key, name text not null);
create table public.platforms(id text primary key, name text not null);
insert into public.brands values ('brand-a','Brand A'),('brand-b','Brand B');
insert into public.platforms values ('platform-a','Platform A'),('platform-b','Platform B');
create table public.shifts(
 id text primary key, date date, start_time time, end_time time, timezone text, start_at timestamptz,
 end_at timestamptz, end_date date, crosses_midnight boolean, duration_minutes integer,
 status text, deleted_at timestamptz, archived_at timestamptz, brand_id text,
 deleted_by text, archived_by text, deletion_reason text,
 platform_id text, campaign_id text, studio text, title text, product_notes text, execution_source text,
 host_id text, support_id text, technical_id text,
 required_host_count integer, required_support_count integer, required_technical_count integer,
 host_names text[], assistant_names text[], technical_names text[], registration_locked boolean,
 registration_cutoff_at timestamptz, allow_multi_role boolean, import_batch_id text, status_mode text,
 live_link text, updated_by text, created_at timestamptz default statement_timestamp(),
 updated_at timestamptz default statement_timestamp(), version integer default 1,
 visible_to text[] not null default '{}'
);
create table public.shift_registrations(
 id text, shift_id text, user_id text, status text, operational_role text, imported_name text, source text,
 requested_at timestamptz default statement_timestamp()
);
create table public.staffing_test_summary(shift_id text, role text, required integer, approved integer);
create or replace function public.get_shift_staffing_summary(p_shift_ids text[])
returns table(shift_id text, role text, required integer, approved integer, pending integer, remaining integer, approved_staff jsonb)
language sql stable security invoker set search_path=''
as $$ select x.shift_id,x.role,x.required,x.approved,0,greatest(x.required-x.approved,0),'[]'::jsonb
from public.staffing_test_summary x where x.shift_id=any(p_shift_ids) $$;
grant usage on schema private to authenticated;
grant select on public.business_users,public.brands,public.platforms,public.shifts,public.shift_registrations,public.staffing_test_summary to authenticated;
grant execute on function private.current_business_user_id() to authenticated;
grant execute on function public.get_shift_staffing_summary(text[]) to authenticated;
alter table public.shifts enable row level security;
alter table public.shift_registrations enable row level security;
create policy shifts_test_scope on public.shifts for select to authenticated using (
 exists(select 1 from public.business_users u where u.id=private.current_business_user_id() and u.system_permission in ('admin','leader'))
 or visible_to @> array[private.current_business_user_id()]
);
create policy registrations_test_scope on public.shift_registrations for select to authenticated using (
 user_id=private.current_business_user_id()
 or exists(select 1 from public.business_users u where u.id=private.current_business_user_id() and u.system_permission in ('admin','leader'))
);
insert into public.shifts(id,date,start_time,end_time,end_at,status,brand_id,platform_id,title,required_host_count,required_support_count,required_technical_count,visible_to)
values
 ('host-gap','2026-10-01','09:00','10:00','2026-10-01 10:00+00','scheduled','brand-a','platform-a','Host gap',1,1,0,array['member']),
 ('support-gap','2026-10-02','09:00','10:00','2026-10-02 10:00+00','scheduled','brand-a','platform-b','Support gap',1,2,0,'{}'),
 ('technical-gap','2026-10-03','09:00','10:00','2026-10-03 10:00+00','scheduled','brand-b','platform-a','Technical gap',1,1,1,'{}'),
 ('fully-staffed','2026-10-04','09:00','10:00','2026-10-04 10:00+00','scheduled','brand-b','platform-b','Full',1,1,0,'{}'),
 ('out-of-range','2026-11-01','09:00','10:00','2026-11-01 10:00+00','scheduled','brand-a','platform-a','Outside',1,1,0,'{}');
insert into public.shifts(id,date,start_time,end_time,end_at,status,required_host_count,required_support_count,required_technical_count)
select 'page-'||n, date '2026-10-05'+n, '09:00','10:00',('2026-10-05'::date+n+time '10:00') at time zone 'UTC','scheduled',0,0,0
from generate_series(1,11) n;
insert into public.staffing_test_summary values
 ('host-gap','host',1,0),('host-gap','support',1,1),
 ('support-gap','host',1,1),('support-gap','support',2,0),
 ('technical-gap','host',1,1),('technical-gap','support',1,1),('technical-gap','technical',1,0),
 ('fully-staffed','host',1,1),('fully-staffed','support',1,1);
insert into public.shift_registrations(id,shift_id,user_id,status,operational_role,source) values
 ('own-registration','host-gap','member','pending','host','self_registration'),
 ('private-registration','host-gap','private-member','pending','host','self_registration');
`

psql(fixture)
psql(legacyHelper + "\nrevoke all on function private.filtered_shift_ids(text,jsonb) from public,anon,service_role; grant execute on function private.filtered_shift_ids(text,jsonb) to authenticated;")
psql(listPageRpc + "\nrevoke all on function public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean) from public,anon,service_role; grant execute on function public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean) to authenticated;")
const signature = query("select pg_get_function_identity_arguments('private.filtered_shift_ids(text,jsonb)'::regprocedure)")
assert.equal(signature, 'p_scope text, p_filters jsonb')
const oldAcl = query("select has_function_privilege('authenticated','private.filtered_shift_ids(text,jsonb)','EXECUTE')::text||'|'||has_function_privilege('anon','private.filtered_shift_ids(text,jsonb)','EXECUTE')::text")
const priorDefinition = query("select encode(convert_to(pg_get_functiondef('private.filtered_shift_ids(text,jsonb)'::regprocedure),'UTF8'),'base64')")
psql(`begin;${transactionalMigration}\nselect 1/0; commit;`, true)
assert.equal(query("select encode(convert_to(pg_get_functiondef('private.filtered_shift_ids(text,jsonb)'::regprocedure),'UTF8'),'base64')"), priorDefinition)
psql(migration)
psql(migration) // The additive replacement must be safe to reapply.
const newAcl = query("select has_function_privilege('authenticated','private.filtered_shift_ids(text,jsonb)','EXECUTE')::text||'|'||has_function_privilege('anon','private.filtered_shift_ids(text,jsonb)','EXECUTE')::text")
assert.equal(newAcl, oldAcl)
assert.equal(newAcl, 'true|false')

const hostMissing = query(as('admin', "select coalesce(string_agg(id,',' order by id),'') from private.filtered_shift_ids('all','{\"operationalRoles\":[\"host\"],\"staffingStates\":[\"missing_staff\"]}')"))
const supportMissing = query(as('admin', "select coalesce(string_agg(id,',' order by id),'') from private.filtered_shift_ids('all','{\"operationalRoles\":[\"support\"],\"staffingStates\":[\"missing_staff\"]}')"))
const technicalMissing = query(as('admin', "select coalesce(string_agg(id,',' order by id),'') from private.filtered_shift_ids('all','{\"operationalRoles\":[\"technical\"],\"staffingStates\":[\"missing_staff\"]}')"))
assert.equal(hostMissing, 'host-gap')
assert.equal(supportMissing, 'support-gap')
assert.equal(technicalMissing, 'technical-gap')

const combined = query(as('admin', "select coalesce(string_agg(id,',' order by id),'') from private.filtered_shift_ids('all','{\"operationalRoles\":[\"host\",\"support\"],\"staffingStates\":[\"missing_staff\"]}')"))
assert.equal(combined, 'host-gap,support-gap')
const scoped = query(as('admin', "select coalesce(string_agg(id,',' order by id),'') from private.filtered_shift_ids('all','{\"from\":\"2026-10-01\",\"to\":\"2026-10-04\",\"brandIds\":[\"brand-a\"],\"platformIds\":[\"platform-a\"]}')"))
assert.equal(scoped, 'host-gap')
const page = query(as('admin', "with filtered as (select id from private.filtered_shift_ids('all','{\"from\":\"2026-10-01\",\"to\":\"2026-10-04\"}')), stats as (select count(*) total from filtered), rows as (select id from filtered order by id limit 2 offset 0) select (select total from stats)||'|'||string_agg(id,',' order by id) from rows"))
assert.equal(page, '4|fully-staffed,host-gap')
const rpcPage = JSON.parse(query(as('admin', "select public.get_shift_list_page('all',1,10,'{\"operationalRoles\":[\"host\"],\"staffingStates\":[\"missing_staff\"]}',1,false)::text")))
assert.equal(rpcPage.total, 1)
assert.equal(rpcPage.rows.length, 1)
assert.equal(rpcPage.rows[0].id, 'host-gap')
const rpcFiltered = JSON.parse(query(as('admin', "select public.get_shift_list_page('all',1,10,'{\"from\":\"2026-10-01\",\"to\":\"2026-10-04\",\"brandIds\":[\"brand-a\"],\"platformIds\":[\"platform-a\"]}',1,false)::text")))
assert.equal(rpcFiltered.total, 1)
assert.equal(rpcFiltered.rows[0].id, 'host-gap')
const rpcFirstPage = JSON.parse(query(as('admin', "select public.get_shift_list_page('all',1,10,'{}',1,false)::text")))
const rpcSecondPage = JSON.parse(query(as('admin', "select public.get_shift_list_page('all',2,10,'{}',1,false)::text")))
assert.equal(rpcFirstPage.total, 16)
assert.equal(rpcFirstPage.rows.length, 10)
assert.equal(rpcSecondPage.total, 16)
assert.equal(rpcSecondPage.rows.length, 6)
assert.equal(rpcSecondPage.page, 2)
const memberRows = query(as('member', "select coalesce(string_agg(id,',' order by id),'') from private.filtered_shift_ids('all','{}')"))
assert.equal(memberRows, 'host-gap')
const memberRpc = JSON.parse(query(as('member', "select public.get_shift_list_page('all',1,10,'{}',1,false)::text")))
assert.equal(memberRpc.total, 1)
assert.deepEqual(memberRpc.registrations.map(row => row.id), ['own-registration'])
const leaderRows = query(as('leader', "select count(*) from private.filtered_shift_ids('all','{}')"))
assert.equal(leaderRows, '16')
psql("set role anon; select * from private.filtered_shift_ids('all','{}');", true)

// The documented rollback compensation is replaying the exact pre-change helper
// with its original execute boundary; it must remain callable and preserve ACLs.
psql(legacyHelper + "\nrevoke all on function private.filtered_shift_ids(text,jsonb) from public,anon,service_role; grant execute on function private.filtered_shift_ids(text,jsonb) to authenticated;")
assert.equal(query("select has_function_privilege('authenticated','private.filtered_shift_ids(text,jsonb)','EXECUTE')::text||'|'||has_function_privilege('anon','private.filtered_shift_ids(text,jsonb)','EXECUTE')::text"), 'true|false')
assert.equal(query(as('admin', "select count(*) from private.filtered_shift_ids('all','{}')")), '16')
psql(migration)
console.log('STAFFING_ROLE_FILTER_POSTGRES_17=PASS')
