-- STAGING ONLY: read-only ledger integrity. Canonical P0 audit privilege hardening.
-- Apply after RC16 and RC16B, no approval/payment or business data changes.
do $guard$
begin
 if to_regclass('public.workforce_payroll_audit') is null
  or (select count(*) from public.workforce_payroll_audit)<>0
  or to_regclass('public.operational_files') is null
  or not exists(select 1 from information_schema.columns
     where table_schema='public' and table_name='workforce_payroll_lines' and column_name='voided_at')
 then raise exception 'P0_STAGING_AUDIT_HARDENING_SCHEMA_DRIFT'; end if;
end;
$guard$;

-- Forward-only ACL repair; no historical rows, functions or ledger entries change.
-- Supabase default grants survive an additive GRANT SELECT/INSERT.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke update, delete, truncate
on table public.workforce_payroll_audit
from service_role;

revoke truncate
on table public.report_revisions, public.audit_logs, public.audit_log_reviews
from service_role;

-- Review upserts and revision/audit capture run as postgres SECURITY DEFINER.
-- No runtime path needs direct service_role UPDATE/DELETE on these tables.
revoke update, delete
on table public.report_revisions, public.audit_logs, public.audit_log_reviews
from service_role;

do $postconditions$
begin
  if exists (
    select 1 from unnest(array[
      'workforce_payroll_audit', 'report_revisions', 'audit_logs', 'audit_log_reviews'
    ]) as target(table_name)
    where has_table_privilege('service_role', 'public.' || target.table_name, 'UPDATE,DELETE,TRUNCATE')
  ) then
    raise exception 'P0_AUDIT_MUTATION_PRIVILEGES_REMAIN';
  end if;
  if not has_table_privilege('service_role', 'public.workforce_payroll_audit', 'SELECT')
    or not has_table_privilege('service_role', 'public.workforce_payroll_audit', 'INSERT')
    or not has_sequence_privilege('service_role', 'public.workforce_payroll_audit_id_seq', 'USAGE') then
    raise exception 'P0_PAYROLL_AUDIT_APPEND_ACCESS_MISSING';
  end if;
end;
$postconditions$;
