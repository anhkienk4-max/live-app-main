-- P0.9b Staging-only: independently reproducible Member soft-delete bypass.
-- Prior function's target_report.submitted_by <> actor_id allows NULL owner.
-- Use exact Staging fingerprint, preserve all other behaviors and ACLs.
set local lock_timeout='3s';
set local statement_timeout='30s';
do $guard$
begin
 if (select count(*) from public.reports) <> 9
  or to_regclass('public.workforce_payroll_lines') is null
  or md5(pg_get_functiondef('public.soft_delete_report(text,text)'::regprocedure)) <> '0cec57511241380583191eb10858a48b'
 then raise exception 'P09B_SOFT_DELETE_STAGING_BASELINE_CHANGED'; end if;
end;
$guard$;

CREATE OR REPLACE FUNCTION public.soft_delete_report(p_report_id text, p_reason text)
 RETURNS reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id text;
  target_report public.reports;
  actor_permission text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if target_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  actor_permission := (select system_permission from public.business_users where id = actor_id);
  if actor_permission = 'member' and (target_report.submitted_by is null or target_report.submitted_by <> actor_id) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  -- Keep evidence metadata and Storage paths attached to the soft-deleted
  -- report so Admin restore remains reversible and no blobs are orphaned.

  update public.reports
  set deleted_at = statement_timestamp(),
      deleted_by = actor_id,
      deletion_reason = coalesce(nullif(btrim(p_reason), ''), 'Removed by operator'),
      status = 'archived',
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, 'archived', 'archive',
    coalesce(nullif(btrim(p_reason), ''), 'Removed by operator'),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    array[]::text[]
  );

  return target_report;
end;
$function$;
