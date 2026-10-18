-- STAGING ONLY / FINANCIAL SENSITIVITY: service-role payroll snapshot only.
-- Same canonical definition and ACL as Production RC16K.
-- Does not create rates, employees, payroll lines, approvals or financial data.
set local lock_timeout='3s';
set local statement_timeout='30s';
do $guard$
begin
 if to_regclass('public.workforce_payroll_periods') is null
   or to_regclass('public.workforce_payroll_lines') is null
   or to_regclass('public.workforce_payroll_audit') is null
   or to_regprocedure('public.get_payroll_period_snapshot(text)') is not null
   or (select count(*) from public.workforce_payroll_periods) <> 0
   or (select count(*) from public.workforce_payroll_lines) <> 0
   or (select count(*) from public.workforce_payroll_audit) <> 0
   or has_table_privilege('service_role','public.workforce_payroll_audit','UPDATE')
 then raise exception 'P0_PAYROLL_SNAPSHOT_STAGING_TARGET_GUARD'; end if;
end;
$guard$;

create function public.get_payroll_period_snapshot(p_period_id text)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if current_user<>'service_role' then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_period_id is null or length(p_period_id) not between 1 and 120 then raise exception using errcode='22023',message='PERIOD_INVALID'; end if;
  with period as materialized (
    select * from public.workforce_payroll_periods where id=p_period_id
  ), lines as materialized (
    select * from public.workforce_payroll_lines where period_id=p_period_id
  ), audit as materialized (
    select * from public.workforce_payroll_audit where period_id=p_period_id
  )
  select case when exists(select 1 from period) then jsonb_build_object(
    'period',(select to_jsonb(period) from period),
    'lineCount',(select count(*) from lines),'auditCount',(select count(*) from audit),
    'lines',(select coalesce(jsonb_agg(to_jsonb(selected) order by created_at,id),'[]'::jsonb) from (select * from lines order by created_at,id limit 3000) selected),
    'audit',(select coalesce(jsonb_agg(to_jsonb(selected) order by created_at,id),'[]'::jsonb) from (select * from audit order by created_at,id limit 3000) selected)
  ) end into result;
  if (result->>'lineCount')::bigint>=3000 or (result->>'auditCount')::bigint>=3000 then
    raise exception using errcode='54000',message='WORKFORCE_PAYROLL_READ_INCOMPLETE';
  end if;
  return result;
end;
$$;
revoke all on function public.get_payroll_period_snapshot(text) from public,anon,authenticated;
grant execute on function public.get_payroll_period_snapshot(text) to service_role;
