import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyProductionManifest, productionStepSql } from '../scripts/workforce/rc16h-production-manifest.mjs'

export { verifyProductionManifest }

const catalog=JSON.parse(readFileSync('tests/fixtures/rc16h_production_catalog.json','utf8'))
const quote=value=>"'"+value.replaceAll("'","''")+"'"
const ident=value=>'"'+value.replaceAll('"','""')+'"'

function aclSql(acl,object,type,major) {
  assert.ok(acl,'Snapshot must contain explicit grants')
  let sql=`revoke all on ${type} ${object} from public,anon,authenticated,service_role;`
  const privileges={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',X:'EXECUTE'}
  for(const entry of acl.slice(1,-1).split(',')){
    const match=/^(postgres|service_role|authenticated|anon)=([arwdDxtmX]+)\/postgres$/.exec(entry)
    assert.ok(match,'Unexpected ACL')
    const perms=[...match[2]].filter(p=>!(p==='m'&&major==='16')).map(p=>privileges[p])
    if(perms.length)sql+=`grant ${perms.join(',')} on ${type} ${object} to ${match[1]};`
  }
  return sql
}

function bootstrap(major) {
  let body=`create schema private; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema private to authenticated;
    grant usage on schema auth to authenticated,service_role;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`
  for(const t of catalog.tables)body+=`create table public.${ident(t.name)}(`+
    t.columns.map(c=>`${ident(c.name)} ${c.type}${c.not_null?' not null':''}${c.default?' default '+c.default:''}`).join(',')+');'
  for(const foreignKeys of [false,true])for(const t of catalog.tables)
    for(const c of t.constraints??[])if((c.type==='f')===foreignKeys)body+=
      `alter table public.${ident(t.name)} add constraint ${ident(c.name)} ${c.definition};`
  for(const t of catalog.tables)for(const index of t.indexes??[]){
    const indexName=index.match(/^CREATE (?:UNIQUE )?INDEX (\S+) ON/)[1].replaceAll('"','')
    if(!t.constraints.some(c=>c.name===indexName))body+=index+';'
  }
  // SQL-language helpers are checked at CREATE time; retain real dependency order.
  const pending=[...catalog.functions],created=new Set()
  while(pending.length){
    const i=pending.findIndex(f=>[...f.definition.matchAll(/private\.([a-z0-9_]+)\(/g)]
      .every(m=>m[1]===f.name||created.has(m[1])))
    assert.notEqual(i,-1,'Uncaptured or cyclic private helper dependency')
    const [f]=pending.splice(i,1)
    body+=f.definition+';';created.add(f.name)
    body+=aclSql(f.acl,f.schema==='public'?'public.'+f.signature:f.signature,'function',major)
  }
  for(const t of catalog.tables){
    if(t.rls)body+=`alter table public.${ident(t.name)} enable row level security;`
    if(t.force_rls)body+=`alter table public.${ident(t.name)} force row level security;`
    body+=aclSql(t.acl,'public.'+ident(t.name),'table',major)
    for(const p of t.policies??[])body+=`create policy ${ident(p.name)} on public.${ident(t.name)}
      for ${{r:'select',a:'insert',w:'update',d:'delete','*':'all'}[p.command]}
      to ${p.roles.map(ident).join(',')}${p.using?' using ('+p.using+')':''}${p.check?' with check ('+p.check+')':''};`
    for(const trigger of t.triggers??[]){
      assert.equal(trigger.enabled,'O','Unexpected disabled trigger')
      body+=trigger.definition+';'
    }
  }
  body+=`insert into supabase_migrations.schema_migrations(version,name)
    values ('20261011091925','rc15_storage_route_prerequisites'),('20261011092015','rc15_shift_rpc_compatibility'),
      ('20261011092051','rc15_operational_files');`
  return body
}

export async function runProductionRehearsal({sql,start}) {
  const manifest=verifyProductionManifest(JSON.parse(readFileSync('supabase/release/rc16h/manifest.json','utf8')))
  const database='rc16h_production',failure='rc16h_failure',major=process.env.RC16_PG_MAJOR??'16'
  let passed=0
  const pass=name=>{passed++;console.log('RC16H_PASS: '+name)}
  async function fail(body,pattern,db=database){
    const r=await start(body,db).result
    assert.notEqual(r.code,0,r.output);assert.match(r.output,pattern)
  }
  const preflight=readFileSync(manifest.preflight,'utf8')
  const transaction=(step,injected='')=>productionStepSql(manifest,manifest.steps.indexOf(step))
    .replace('    insert into supabase_migrations.schema_migrations(version,name,statements)',
      injected+'\n    insert into supabase_migrations.schema_migrations(version,name,statements)')
  await sql(`create database ${database};`)
  await sql(bootstrap(major),database)
  await sql(preflight,database)
  for(const f of catalog.functions)assert.equal((await sql(`select md5(pg_get_functiondef(${quote(
    f.schema==='public'?'public.'+f.signature:f.signature)}::regprocedure));`,database)).trim(),f.md5)
  pass('Live Production catalog: 14 tables, real authorization/audit/notification helpers and three exact RC15 RPCs')
  await sql(`create database ${failure} template ${database};`)
  await fail(`begin; create or replace function public.create_shift(p_data jsonb) returns public.shifts
    language plpgsql security definer set search_path='' as $$begin raise exception 'SYNTHETIC_DRIFT';end$$;
    ${preflight}commit;`,/RC16H_PRODUCTION_RPC_DRIFT/,failure)
  await sql(preflight,failure)
  pass('Unexpected Production RPC drift aborts transaction and preserves original definition')
  await fail(transaction(manifest.steps[0],"do $$begin raise exception 'RC16H_INJECTED_FAILURE';end$$;"),/RC16H_INJECTED_FAILURE/,failure)
  assert.equal((await sql("select count(*) from pg_class where relname like 'workforce_%';",failure)).trim(),'0')
  assert.equal((await sql("select count(*) from supabase_migrations.schema_migrations where version like '20261012%';",failure)).trim(),'0')
  pass('Foundation failure rolls back all DDL and ledger; clean retry remains possible')
  await sql(transaction(manifest.steps[0]),failure)
  await fail(transaction(manifest.steps[1],"do $$begin raise exception 'RC16H_INJECTED_FAILURE';end$$;"),/RC16H_INJECTED_FAILURE/,failure)
  assert.equal((await sql("select count(*) from information_schema.columns where table_name='workforce_payroll_lines' and column_name='version';",failure)).trim(),'0')
  assert.equal((await sql("select count(*) from supabase_migrations.schema_migrations where version='20261012000001';",failure)).trim(),'0')
  await sql(transaction(manifest.steps[1]),failure)
  pass('RC16B failure rolls back additive columns/functions and ledger; explicit retry succeeds')

  const users=['admin-1','finance-1','staff-1','staff-b','staff-c','staff-d','staff-e','leader-b','admin-b','admin-inactive']
  for(const [index,id] of users.entries()){
    const auth=`40000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`
    await sql(`insert into auth.users values (${quote(auth)});
      insert into public.business_users(id,auth_user_id,email,full_name,system_permission,operational_roles,account_status,status)
      values(${quote(id)},${quote(auth)},${quote(id+'@example.invalid')},'Synthetic Payroll User',
      ${quote(id.startsWith('staff')?'member':id.startsWith('leader')?'leader':'admin')},'{host,support,technical}',
      'active',${quote(id==='admin-inactive'?'inactive':'active')});`,database)
  }
  const actor="select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',false);"
  await sql(`${actor}
    insert into public.brands(id,name) values('h-brand','Synthetic Production-Compatible Brand');
    insert into public.platforms(id,name) values('h-platform','Synthetic Platform');
    insert into public.system_settings default values;
    insert into public.shifts(id,date,start_time,end_time,brand_id,platform_id,status)
      values('shift-1','2026-09-30','21:30','23:00','h-brand','h-platform','completed');
    insert into public.reports(id,shift_id,status,submitted_by) values('h-report','shift-1','draft','admin-1');
    insert into public.report_revisions(id,report_id,event,status,created_by,version)
      values('h-revision','h-report','create','draft','admin-1',1);
    insert into public.operational_storage_routes(id,provider,execution_source,brand_id,storage_profile,
      root_folder_id,base_folder_id,period_naming_style)
      values('h-route','google_drive','internal','h-brand','CANONICAL_V1','synthetic-root','synthetic-base','month');
    insert into public.operational_files(id,scope_key,category,brand_id,platform_id,period_date,execution_source,
      provider,external_file_id,external_parent_id,folder_path,file_name,mime_type,size_bytes,artifact_key,checksum_sha256)
      values('h-file','synthetic-scope','schedule_source','h-brand','h-platform','2026-09-30','internal',
      'google_drive','synthetic-file','synthetic-base','synthetic/path','fixture.csv','text/csv',12,'synthetic-artifact',repeat('a',64));`,database)
  const oldTables=catalog.tables.map(t=>t.name)
  const rows=()=>sql(oldTables.map(t=>`select ${quote(t)},coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)
    from public.${ident(t)} t;`).join('\n'),database)
  const footprint=()=>sql(`select nspname,nspacl from pg_namespace where nspname in ('public','private') order by nspname;
    select c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity from pg_class c
    where c.relnamespace='public'::regnamespace and c.relname in (${oldTables.map(quote)}) order by c.relname;
    select c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
      from pg_class c join pg_attribute a on a.attrelid=c.oid
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where c.relnamespace='public'::regnamespace and c.relname in (${oldTables.map(quote)})
        and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum;
    select conrelid::regclass,conname,pg_get_constraintdef(oid) from pg_constraint
      where conrelid in (${oldTables.map(t=>quote('public.'+t)+'::regclass')}) order by conrelid::regclass::text,conname;
    select indexrelid::regclass,pg_get_indexdef(indexrelid) from pg_index
      where indrelid in (${oldTables.map(t=>quote('public.'+t)+'::regclass')}) order by indexrelid::regclass::text;
    select tgname,pg_get_triggerdef(oid),tgenabled from pg_trigger where not tgisinternal
      and tgrelid in (${oldTables.map(t=>quote('public.'+t)+'::regclass')}) order by tgname;
    select polrelid::regclass,polname,polcmd,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)
      from pg_policy order by polrelid::regclass::text,polname;
    select oid::regprocedure,md5(pg_get_functiondef(oid)),proacl,prosecdef,proconfig from pg_proc
      where pronamespace in ('private'::regnamespace,'public'::regnamespace)
        and proname not like 'workforce_%' order by oid::regprocedure::text;`,database)
  const beforeRows=await rows(),beforeFootprint=await footprint()
  await fail(`begin;create table public.workforce_partial(id text);${transaction(manifest.steps[0])}`,
    /RC16H_PARTIAL_OR_MISSING_WORKFORCE_SCHEMA/)
  await sql(transaction(manifest.steps[0]),database)
  assert.equal(await rows(),beforeRows)
  assert.equal(await footprint(),beforeFootprint)
  const integrity=readFileSync('tests/fixtures/rc16_payroll_integrity.sql','utf8').replaceAll('\r\n','\n').replace(
    "insert into public.shifts(id,date,status)\n  values ('shift-future','2026-11-20','scheduled');",
    "insert into public.shifts(id,date,status,start_time,end_time,brand_id,platform_id) values ('shift-future','2026-11-20','scheduled','09:00','11:00','h-brand','h-platform');")
  await sql(actor+integrity,database)
  const beforeCorrectionRows=await rows(),beforeCorrectionFootprint=await footprint()
  await sql(transaction(manifest.steps[1]),database)
  assert.equal(await rows(),beforeCorrectionRows)
  assert.equal(await footprint(),beforeCorrectionFootprint)
  pass('Ordered RC16/RC16B preserves all synthetic Shifts, Reports/history, routes, files and global audit rows')
  pass('All prior constraints/indexes/triggers/RLS/policies/grants/private functions and RPCs unchanged')
  for(const step of manifest.steps)await fail(transaction(step),/RC16H_ALREADY_APPLIED/)
  pass('Ledger replay rejected without silent DDL rewrite')
  let correction=readFileSync('tests/fixtures/rc16b_payroll_correction.sql','utf8').replaceAll('\r\n','\n')
  const userInserts=correction.match(/insert into public\.business_users\([^;]+;/g)
  assert.equal(userInserts.length,2)
  correction=correction.replace(/insert into public\.business_users\([^;]+;/g,'')
    .replace("insert into public.shifts(id,date) values ('shift-split','2026-09-30');",
      "insert into public.shifts(id,date,start_time,end_time,brand_id,platform_id,status) values ('shift-split','2026-09-30','09:00','11:00','h-brand','h-platform','completed');")
  const checks=await sql(actor+correction,database)
  assert.equal((checks.match(/RC16B_PASS:/g)??[]).length,49)
  pass('Existing integrity plus all 49 RC16B financial, audit, uniqueness and immutable-state assertions on real column constraints')

  await sql(`${actor}set role service_role;
    select public.create_shift('{"date":"2026-10-02","start_time":"23:00","end_time":"01:00",
      "brand_id":"h-brand","platform_id":"h-platform","title":"H RPC preservation","host_id":"staff-1","execution_source":"internal"}');`,database)
  assert.equal((await sql("select crosses_midnight and duration_minutes=120 and host_id='staff-1' from public.shifts where title='H RPC preservation';",database)).trim(),'t')
  assert.equal((await sql("select count(*) from public.notifications where notification_type='shift_assigned';",database)).trim(),'1')
  pass('Production create_shift: overnight derivation, real manual staffing projection, notification and audit triggers')
  const shiftId=(await sql("select id from public.shifts where title='H RPC preservation';",database)).trim()
  const version=(await sql(`select version from public.shifts where id=${quote(shiftId)};`,database)).trim()
  await fail(`${actor}set role service_role; select public.update_shift(${quote(shiftId)},'{"title":"stale"}',true,${Number(version)-1});`,/STALE/)
  await fail(`select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000003',false);
    set role authenticated;select public.update_shift(${quote(shiftId)},'{"title":"unauthorized"}',true,${version});`,/OPERATION_NOT_ALLOWED/)
  await fail(`set role authenticated;select * from public.workforce_payroll_lines;`,/permission denied/)
  await fail(`set role authenticated;select public.workforce_rc16_transition_payroll('p','draft','reviewed','admin-1','Invalid browser transition');`,/permission denied/)
  pass('Existing optimistic concurrency, actor authorization and browser salary/RPC denial preserved')
  await sql(preflight,database)
  console.log(`PASS: ${passed} RC16H Production-compatible assertions on PostgreSQL ${major}; synthetic only, no cloud apply/UAT`)
}
