import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const catalog = JSON.parse(readFileSync('tests/fixtures/rc16g_staging_catalog.json', 'utf8'))
export function verifyManifest(manifest) {
  assert.equal(manifest.target, 'legacy-rc13a-only')
  assert.deepEqual(manifest.steps.map(s => s.version),
    ['20261011091925','20261013000000','20261013000001','20261011092051','20261012000000','20261012000001'])
  for (const step of manifest.steps) {
    assert.match(step.path, /^supabase\/(migrations|reconciliation\/rc16g)\/\d{14}_rc(?:15|16)[a-z_]*\.sql$/)
    assert.equal(createHash('sha256').update(readFileSync(step.path)).digest('hex'), step.sha256)
    assert.ok(!step.path.includes('20261011092015'), 'Production-only patch excluded')
  }
  return manifest
}
const quote = value => "'" + value.replaceAll("'", "''") + "'"
const identifiers = values => values.map(v => '"' + v + '"').join(',')
function bootstrap() {
  let result = `create schema private; create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);
    create table public.platforms(id text primary key);
    create table public.campaigns(id text primary key);`
  result += 'create table public.schedule_import_batches(id text primary key);'
  for (const table of ['business_users','brands','system_settings','shifts','shift_registrations']) {
    const columns = catalog.columns.filter(c => c.table === table &&
      !['storage_profile','execution_source'].includes(c.name))
    result += `create table public.${table}(` + columns.map(c =>
      `"${c.name}" ${c.type}${c.notnull ? ' not null' : ''}${c.default ? ' default '+c.default : ''}` +
      (c.name === 'id' ? ' primary key' : '')).join(',') + ');'
  }
  for (const c of catalog.checks) {
    if (c.name === 'shifts_execution_source_check') continue
    result += `alter table public.${c.table} add constraint "${c.name}" ${c.definition};`
  }
  for (const c of [...catalog.foreignKeys, ...catalog.constraints.filter(c=>c.table==='brands'
    && c.name!=='brands_storage_profile_check' && !c.definition.startsWith('PRIMARY KEY'))]) {
    result += `alter table public.${c.table} add constraint "${c.name}" ${c.definition};`
  }
  for (const f of catalog.functions) result += f.definition + ';'
  for (const t of catalog.shiftTriggers) result += t.function + ';' + t.definition + ';'
  result += `revoke all on all functions in schema private from public,anon,authenticated;
    revoke all on public.shifts,public.shift_registrations from public,anon,authenticated;
    alter table public.shifts enable row level security;
    alter table public.shift_registrations enable row level security;
    grant select on public.business_users,public.shifts to service_role;
    insert into public.business_users(id,auth_user_id,email,full_name,system_permission,operational_roles,account_status)
    values ('admin-1','30000000-0000-4000-8000-000000000001','admin@example.invalid','Synthetic Admin','admin','{host}','active'),
      ('finance-1','30000000-0000-4000-8000-000000000002','review@example.invalid','Synthetic Reviewer','admin','{host}','active'),
      ('staff-1','30000000-0000-4000-8000-000000000003','member@example.invalid','Synthetic Member','member','{host}','active'),
      ('leader-1','30000000-0000-4000-8000-000000000004','leader@example.invalid','Synthetic Leader','leader','{host}','active');
    insert into public.brands(id,name) values ('legacy-brand','Synthetic Legacy Brand');
    insert into public.platforms values ('legacy-platform');
    insert into public.system_settings default values;`
  return result
}
export async function runReconciliation({ sql, start }) {
  const manifest = verifyManifest(JSON.parse(readFileSync('supabase/reconciliation/rc16g/manifest.json','utf8')))
  let passed = 0
  function pass(name) { passed++; console.log('RC16G_PASS: ' + name) }
  async function fail(text, pattern, database) {
    const r = await start(text, database).result
    assert.notEqual(r.code,0,r.output); assert.match(r.output,pattern)
  }
  async function apply(step, database) {
    const bytes=readFileSync(step.path)
    assert.equal(createHash('sha256').update(bytes).digest('hex'),step.sha256)
    const body = bytes.toString('utf8').replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'')
    return sql(`begin;
      do $$ begin if exists(select 1 from supabase_migrations.schema_migrations where version=${quote(step.version)})
        then raise exception 'RC16G_ALREADY_APPLIED'; end if; end $$;
      ${body}
      insert into supabase_migrations.schema_migrations(version,name,statements)
        values (${quote(step.version)},${quote(step.path.split('/').at(-1))},array[${quote(body)}]);
      commit;`, database)
  }
  for (const database of ['rc16g_legacy','rc16g_fresh','rc16g_failure','rc16g_production']) {
    await sql(`create database ${database};`)
    await sql(bootstrap(),database)
    // Fresh foundational operational baseline, not a replay of the entire historical repository.
    await sql(readFileSync('supabase/migrations/20260924000000_rc13a_execution_source_storage_routes.sql','utf8'),database)
    for (const rpc of catalog.rpc) await sql(rpc.definition,database)
    for (const rpc of catalog.rpcAcl) {
      const roles = rpc.signature.includes('boolean)') ? 'service_role' : 'service_role,authenticated'
      await sql(`revoke all on function public.${rpc.signature} from public,anon,authenticated;
        grant execute on function public.${rpc.signature} to ${roles};`, database)
    }
    await sql(`insert into supabase_migrations.schema_migrations(version,name) values ('20260924000000','rc13a');
      insert into public.operational_storage_routes
        (id,provider,execution_source,brand_id,storage_profile,root_folder_id,base_folder_id,period_naming_style)
        values ('legacy-route','google_drive','internal','legacy-brand','CANONICAL_V1','synthetic-root','synthetic-base','month');
      insert into public.operational_storage_routes
        (id,provider,execution_source,brand_id,subbrand_key,storage_profile,root_folder_id,base_folder_id,period_naming_style)
        values ('legacy-subbrand','google_drive','internal','legacy-brand','synthetic-subbrand',
          'LEGACY_SUBBRAND_PERIOD_CATEGORY','synthetic-root2','synthetic-base2','month');`,database)
    await sql(`insert into public.shifts(id,date,start_time,end_time,brand_id,platform_id,status)
      values ('historical-shift','2026-09-01','09:00','11:00','legacy-brand','legacy-platform','completed');`,database)
  }
  const database = 'rc16g_legacy'
  const legacyColumns = identifiers(catalog.columns.filter(c => c.table==='operational_storage_routes').map(c => c.name))
  const beforeRows = await sql(`select row_to_json(t) from (select ${legacyColumns} from public.operational_storage_routes order by id) t;`,database)
  const beforeBrand = await sql("select row_to_json(t) from public.brands t order by id;",database)
  const beforeShift = await sql("select row_to_json(t) from public.shifts t order by id;",database)
  const beforeSecurity = await sql(`select relacl::text from pg_class where oid='public.operational_storage_routes'::regclass;
    select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.operational_storage_routes'::regclass and not tgisinternal;
    select pg_get_indexdef(indexrelid) from pg_index where indexrelid='public.operational_storage_routes_active_key_uidx'::regclass;`,database)
  const beforeRpc = await sql(`select oid::regprocedure,proacl,prosecdef,proconfig from pg_proc
    where oid in ('public.create_shift(jsonb)'::regprocedure,'public.update_shift(text,jsonb,boolean)'::regprocedure,
    'public.update_shift(text,jsonb,boolean,integer)'::regprocedure) order by oid::regprocedure::text;`,database)
  await fail(readFileSync('supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql','utf8'),
    /RC15_SHIFT_RPC_DEFINITION_DRIFT/,database)
  pass('legacy rejects Production-only RPC patch')
  for (const db of [database,'rc16g_fresh']) {
    for (const step of manifest.steps) await apply(step, db)
    assert.equal((await sql("select count(*) from supabase_migrations.schema_migrations;",db)).trim(),'7')
    assert.equal((await sql("select to_regclass('public.operational_files') is not null and to_regclass('public.workforce_payroll_lines') is not null;",db)).trim(),'t')
  }
  pass('legacy and fresh operational baseline reach RC15 files and RC16B in manifest order')
  assert.equal(await sql(`select row_to_json(t) from (select ${legacyColumns} from public.operational_storage_routes order by id) t;`,database),beforeRows)
  pass('all original route values including timestamps/provider/root/base remain byte-equivalent')
  const oldBrandFields = identifiers(catalog.columns.filter(c=>c.table==='brands').map(c=>c.name))
  assert.equal(await sql(`select row_to_json(t) from (select ${oldBrandFields} from public.brands order by id) t;`,database),beforeBrand)
  assert.equal(await sql("select row_to_json(t) from public.shifts t order by id;",database),beforeShift)
  pass('original brand and historical Shift rows preserved, including unclassified source and version')
  assert.equal(await sql(`select relacl::text from pg_class where oid='public.operational_storage_routes'::regclass;
    select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.operational_storage_routes'::regclass and not tgisinternal;
    select pg_get_indexdef(indexrelid) from pg_index where indexrelid='public.operational_storage_routes_active_key_uidx'::regclass;`,database),beforeSecurity)
  pass('RLS ACL exact NULLS NOT DISTINCT index and original update trigger survive')
  assert.equal((await sql(`select count(*) from information_schema.columns where table_name='operational_storage_routes'
    and column_name in ('period_label_overrides','period_date_ranges','folder_label_overrides','approved_by','approved_at');`,database)).trim(),'5')
  assert.equal((await sql(`select bool_and(approved_by is null and approved_at is null
    and period_label_overrides='{}' and period_date_ranges='[]' and folder_label_overrides='{}')
    from public.operational_storage_routes;`,database)).trim(),'t')
  assert.equal((await sql("select storage_profile is null and storage_profile_reviewed_by is null and storage_profile_reviewed_at is null from public.brands;",database)).trim(),'t')
  pass('five columns and JSON defaults; no historical classification or approval backfill')
  for (const table of ['brands','operational_storage_routes']) {
    await sql(`begin; update public.${table} set storage_profile='EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
      where id='${table==='brands'?'legacy-brand':'legacy-route'}'; rollback;`,database)
    await fail(`update public.${table} set storage_profile='UNKNOWN_PROFILE';`,/violates check constraint/,database)
  }
  for (const [column,value] of [['period_label_overrides','[]'],['period_date_ranges','{}'],['folder_label_overrides','null']]) {
    await fail(`update public.operational_storage_routes set ${column}='${value}'::jsonb where id='legacy-route';`,
      /violates check constraint/,database)
  }
  await fail("update public.operational_storage_routes set approved_by='admin-1' where id='legacy-route';",
    /rc16g_route_approval_timestamp/,database)
  pass('valid seventh profile; invalid profile JSON types and unattributed actor approval rejected')
  await fail(`insert into public.operational_storage_routes
    (provider,execution_source,brand_id,storage_profile,root_folder_id,base_folder_id,period_naming_style)
    values ('google_drive','internal','legacy-brand','CANONICAL_V1','other-root','other-base','month');`,
    /operational_storage_routes_active_key_uidx/,database)
  await fail("set role authenticated; select * from public.operational_storage_routes;",/permission denied/,database)
  pass('duplicate null-key active route and browser salary/storage access remain denied')
  assert.equal(await sql(`select oid::regprocedure,proacl,prosecdef,proconfig from pg_proc
    where oid in ('public.create_shift(jsonb)'::regprocedure,'public.update_shift(text,jsonb,boolean)'::regprocedure,
    'public.update_shift(text,jsonb,boolean,integer)'::regprocedure) order by oid::regprocedure::text;`,database),beforeRpc)
  for (const rpc of catalog.rpc.filter(r=>!r.signature.endsWith('boolean)'))) {
    assert.equal((await sql(`select md5(pg_get_functiondef('public.${rpc.signature}'::regprocedure));`,database)).trim(),rpc.digest)
  }
  pass('all RPC ACL SECURITY DEFINER/search_path and exact create/four-argument definitions preserved')
  const admin = "set role service_role; select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',false);"
  await sql(`alter table public.shifts alter column id set default 'shift-1';`,database)
  await sql(`${admin} select public.create_shift('{"date":"2026-09-30","start_time":"23:00","end_time":"01:00",
    "brand_id":"legacy-brand","platform_id":"legacy-platform","host_id":"staff-1","execution_source":"internal"}');
    reset role; alter table public.shifts alter column id set default gen_random_uuid()::text;`,database)
  assert.equal((await sql("select crosses_midnight and duration_minutes=120 and host_id is null from public.shifts where id='shift-1';",database)).trim(),'t')
  assert.equal((await sql("select count(*) from public.shift_registrations where user_id='staff-1' and status='manually_assigned';",database)).trim(),'1')
  pass('create maintains overnight derivation and real manual assignment helpers')
  await fail(`${admin} select public.create_shift('{"date":"2026-09-30","start_time":"23:00","end_time":"01:00",
    "brand_id":"legacy-brand","platform_id":"legacy-platform","host_id":"staff-1"}');`,/SHIFT_CONFLICT/,database)
  pass('real manual staffing helper rejects overlapping staff assignment')
  await sql(`${admin} select public.update_shift('shift-1','{"execution_source":"agency"}',false);
    select public.update_shift('shift-1','{"execution_source":null}',false);`,database)
  assert.equal((await sql("select execution_source is null from public.shifts where id='shift-1';",database)).trim(),'t')
  await fail(`${admin} select public.update_shift('shift-1','{"execution_source":"other"}',false);`,/SHIFT_EXECUTION_SOURCE_INVALID/,database)
  await fail(`${admin} select public.update_shift('shift-1','{"host_id":"staff-1"}',false);`,/STAFFING_FIELDS_USE_STAFFING_RPC/,database)
  pass('three-argument set clear validate; staffing field permissions unchanged')
  const version = (await sql("select version from public.shifts where id='shift-1';",database)).trim()
  await sql(`${admin} select public.update_shift('shift-1','{"execution_source":"internal"}',false,${version});`,database)
  await fail(`${admin} select public.update_shift('shift-1','{"title":"stale"}',false,${version});`,/STALE_WRITE/,database)
  await fail(`${admin} select public.update_shift('shift-1','{"title":"no version"}',false,null);`,/EXPECTED_VERSION_REQUIRED/,database)
  const currentVersion=(await sql("select version from public.shifts where id='shift-1';",database)).trim()
  await fail(`${admin} select public.update_shift('shift-1','{"execution_source":"bad"}',false,${currentVersion});`,/SHIFT_EXECUTION_SOURCE_INVALID/,database)
  await sql(`${admin} select public.update_shift('shift-1','{"execution_source":null}',false,${currentVersion});`,database)
  assert.equal((await sql("select execution_source is null from public.shifts where id='shift-1';",database)).trim(),'t')
  pass('four-argument optimistic concurrency cannot be bypassed')
  await fail("set role service_role; select public.update_shift('shift-1','{}',false);",/AUTHENTICATION_REQUIRED/,database)
  await fail("set role service_role; select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false); select public.update_shift('shift-1','{}',false);",/OPERATION_NOT_ALLOWED/,database)
  await fail("set role authenticated; select public.update_shift('shift-1','{}',false);",/permission denied/,database)
  await fail("set role authenticated; update public.shifts set title='raw bypass';",/permission denied/,database)
  await fail("set role authenticated; select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000004',false); select public.update_shift('shift-1','{\"allow_multi_role\":true}',false,"+
    (await sql("select version from public.shifts where id='shift-1';",database)).trim()+");",/OPERATION_NOT_ALLOWED/,database)
  pass('anonymous Member raw writes and Leader administrative fields rejected; 3arg remains service-only')
  await fail(`${admin} select public.update_shift('shift-1','{"status":"completed"}',false);`,/SHIFT_STATUS_TRANSITION_NOT_ALLOWED/,database)
  await sql("update public.shifts set status='completed',status_mode='manual' where id='shift-1';",database)
  await fail(`${admin} select public.update_shift('shift-1','{"end_time":"02:00"}',false);`,/COMPLETED_SHIFT_IMPACT_CONFIRMATION_REQUIRED/,database)
  await sql(`${admin} select public.update_shift('shift-1','{"end_time":"02:00"}',true);`,database)
  await fail(`${admin} select public.update_shift('shift-1','{"status":"scheduled"}',false);`,/SHIFT_STATUS_TRANSITION_NOT_ALLOWED/,database)
  pass('lifecycle and completed impact confirmation retained without widening 3arg reopen')
  await sql("update public.shifts set required_host_count=0 where id='shift-1';",database)
  await fail(`${admin} select public.update_shift('shift-1','{}',false);`,/SHIFT_CAPACITY_BELOW_STAFFING/,database)
  await sql("update public.shifts set required_host_count=1 where id='shift-1';",database)
  pass('real staffing consistency rejects below-assignment capacity')
  await assert.rejects(apply(manifest.steps[1],database),/RC16G_ALREADY_APPLIED/)
  await fail(readFileSync(manifest.steps[1].path,'utf8'),/RC16G_ROUTE_COLUMN_DRIFT/,database)
  await fail(readFileSync(manifest.steps[2].path,'utf8'),/RC16G_SHIFT_RPC_DEFINITION_DRIFT/,database)
  pass('ledger and raw replays fail rather than rewrite history')
  const badDb='rc16g_failure'
  await apply(manifest.steps[0],badDb)
  await sql("alter table public.operational_storage_routes add constraint unexpected_profile check(storage_profile <> 'CANONICAL_V9');",badDb)
  await assert.rejects(apply(manifest.steps[1],badDb),/RC16G_ROUTE_CONSTRAINT_DRIFT/)
  assert.equal((await sql("select count(*) from information_schema.columns where table_name='operational_storage_routes' and column_name='approved_at';",badDb)).trim(),'0')
  await sql("alter table public.operational_storage_routes drop constraint unexpected_profile;",badDb)
  await fail(readFileSync(manifest.steps[1].path,'utf8').replace('commit;','select 1/0; commit;'),
    /division by zero/,badDb)
  assert.equal((await sql("select count(*) from information_schema.columns where table_name='operational_storage_routes' and column_name='approved_at';",badDb)).trim(),'0')
  pass('injected failure after route ALTER rolls back all schema changes')
  await apply(manifest.steps[1],badDb)
  const drift = catalog.rpc.find(r=>r.signature.endsWith('integer)')).definition.replace("SHIFT_NOT_FOUND","SYNTHETIC_DRIFT")
  await sql(drift,badDb)
  await assert.rejects(apply(manifest.steps[2],badDb),/RC16G_SHIFT_RPC_DEFINITION_DRIFT/)
  assert.equal((await sql("select md5(pg_get_functiondef('public.update_shift(text,jsonb,boolean)'::regprocedure));",badDb)).trim(),'6737e74fb449e7745b3847b3f95ec0a0')
  assert.equal((await sql("select count(*) from supabase_migrations.schema_migrations where version='20261013000001';",badDb)).trim(),'0')
  await sql(catalog.rpc.find(r=>r.signature.endsWith('integer)')).definition,badDb)
  await sql("grant execute on function public.update_shift(text,jsonb,boolean) to public;",badDb)
  await assert.rejects(apply(manifest.steps[2],badDb),/RC16G_SHIFT_RPC_SECURITY_DRIFT/)
  await sql("revoke all on function public.update_shift(text,jsonb,boolean) from public;",badDb)
  await fail(readFileSync(manifest.steps[2].path,'utf8').replace('commit;','select 1/0; commit;'),
    /division by zero/,badDb)
  assert.equal((await sql("select md5(pg_get_functiondef('public.update_shift(text,jsonb,boolean)'::regprocedure));",badDb)).trim(),'6737e74fb449e7745b3847b3f95ec0a0')
  pass('RPC ACL drift and failure after function replacement roll back without permission widening')
  await apply(manifest.steps[2],badDb)
  pass('unexpected constraints/RPC drift roll back atomically and remain retryable after verified restoration')
  // Recorded Production RPC baseline demonstrates why it must use its own release manifest.
  await sql(readFileSync('tests/fixtures/rc15_production_shift_rpc_baseline.sql','utf8'),'rc16g_production')
  await sql(readFileSync('supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql','utf8'),'rc16g_production')
  await fail(readFileSync(manifest.steps[2].path,'utf8'),/RC16G_SHIFT_RPC_DEFINITION_DRIFT/,'rc16g_production')
  pass('Production RPC branch rejects legacy reconciliation; automatic migration discovery excludes both files')
  console.log(`PASS: ${passed} RC1.6G compatibility scenarios; all writes disposable only`)
}
