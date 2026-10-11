import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const quote=value=>"'"+value.replaceAll("'","''")+"'"
export function verifyProductionManifest(m) {
  assert.equal(m.target,'production')
  assert.equal(m.project_ref,'egdjnpmoasarrttvhgds')
  assert.deepEqual(m.required_ledger_versions,['20261011091925','20261011092015','20261011092051'])
  assert.deepEqual(m.steps.map(s=>s.path),[
    'supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql',
    'supabase/migrations/20261012000001_rc16b_draft_payroll_correction.sql',
  ])
  assert.deepEqual(m.steps.map(s=>s.version),['20261012000000','20261012000001'])
  for(const s of m.steps){
    assert.equal(createHash('sha256').update(readFileSync(s.path)).digest('hex'),s.sha256)
    assert.equal(s.name,s.path.split('/').at(-1).slice(15,-4))
  }
  assert.equal(m.preflight,'supabase/release/rc16h/preflight.sql')
  assert.deepEqual(m.excluded,[
    'supabase/reconciliation/rc16g/20261013000000_rc16g_legacy_storage_routes.sql',
    'supabase/reconciliation/rc16g/20261013000001_rc16g_staging_shift_rpc.sql',
  ])
  return m
}

// Renders reviewable SQL only. No connection handling or database execution.
export function productionStepSql(manifest,index) {
  verifyProductionManifest(manifest)
  assert.ok(index===0||index===1)
  const step=manifest.steps[index],body=readFileSync(step.path,'utf8')
  const tables=['workforce_actual_segments','workforce_rate_cards','workforce_payroll_periods',
    'workforce_payroll_lines','workforce_payroll_audit']
  return `begin; set local lock_timeout='5s'; set local statement_timeout='60s';
    ${readFileSync(manifest.preflight,'utf8')}
    do $$begin
      if exists(select 1 from supabase_migrations.schema_migrations where version=${quote(step.version)})
        then raise exception 'RC16H_ALREADY_APPLIED'; end if;
      ${index===0?`if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname like 'workforce_%')
          or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname like 'workforce_%')
          then raise exception 'RC16H_PARTIAL_OR_MISSING_WORKFORCE_SCHEMA'; end if;`:
        `if not exists(select 1 from supabase_migrations.schema_migrations where version='20261012000000')
          then raise exception 'RC16H_FOUNDATION_LEDGER_MISSING'; end if;
        if (select count(*) from pg_class where oid in (${tables.map(t=>`to_regclass('public.${t}')`)}) and relkind='r')<>5
          then raise exception 'RC16H_PARTIAL_OR_MISSING_WORKFORCE_SCHEMA'; end if;
        if exists(select 1 from information_schema.columns where table_schema='public'
          and table_name='workforce_payroll_lines' and column_name in ('version','voided_at'))
          then raise exception 'RC16H_PARTIAL_CORRECTION_SCHEMA'; end if;`}
    end $$;
    ${body}
    do $$begin
      if (select count(*) from pg_class where oid in (${tables.map(t=>`to_regclass('public.${t}')`)})
        and relkind='r' and relrowsecurity)<>5
        or exists(select 1 from unnest(array['anon','authenticated']) as r(role_name),
          unnest(array[${tables.map(quote)}]) as t(table_name)
          where has_table_privilege(r.role_name,'public.'||t.table_name,'SELECT,INSERT,UPDATE,DELETE'))
        or has_table_privilege('service_role','public.workforce_payroll_audit','UPDATE,DELETE') then
          raise exception 'RC16H_POST_APPLY_SECURITY_FAILED'; end if;
      ${index===1?`if not exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='workforce_payroll_lines' and column_name='version')
        or to_regprocedure('public.workforce_rc16b_correct_payroll_line(text,text,integer,uuid,text,text,text,integer,integer,bigint,text,bigint)') is null
        then raise exception 'RC16H_POST_APPLY_CORRECTION_MISSING'; end if;`:''}
    end $$;
    insert into supabase_migrations.schema_migrations(version,name,statements)
      values(${quote(step.version)},${quote(step.name)},array[${quote(body)}]);
    commit;`
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assert.equal(process.argv.length,3,'Usage: node scripts/workforce/rc16h-production-manifest.mjs 1|2 (render only)')
  assert.ok(['1','2'].includes(process.argv[2]))
  const manifest=JSON.parse(readFileSync('supabase/release/rc16h/manifest.json','utf8'))
  process.stdout.write(productionStepSql(manifest,Number(process.argv[2])-1))
}
