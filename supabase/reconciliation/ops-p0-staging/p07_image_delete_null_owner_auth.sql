-- P0.7 STAGING-ONLY AUTHORIZATION FIX: null owner bypass in image delete preflight.
-- Source: exact live Production definitions, read only from pg_get_functiondef.
-- Tested baseline: Member could pass with uploaded_by=NULL and submitted_by=NULL.
-- Never run this reconciliation SQL on Production.
set local lock_timeout='3s';
set local statement_timeout='25s';
do $guard$
begin
 if (select count(*) from public.reports) <> 9
  or (select count(*) from public.report_images) <> 3
  or (select count(*) from public.live_report_images) <> 1
  or to_regclass('public.workforce_payroll_lines') is null
  or md5(pg_get_functiondef('public.authorize_report_image_delete(text)'::regprocedure)) <> '2ed1c9a7458ad4b1a137a2abd99c01ac'
  or md5(pg_get_functiondef('public.authorize_live_report_image_delete(text)'::regprocedure)) <> '57e0aabbced42284bbe0ddcf49afb1b3'
 then raise exception 'P07_STAGING_IMAGE_AUTH_GUARD_FAILED'; end if;
end;
$guard$;
CREATE OR REPLACE FUNCTION public.authorize_live_report_image_delete(p_image_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id text;
  target_image public.live_report_images;
  target_report public.reports;
  actor_permission text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_image from public.live_report_images where id = p_image_id;
  if target_image.id is null then return false; end if;
  select * into target_report
  from public.reports
  where id = target_image.report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  actor_permission := (select system_permission from public.business_users where id = actor_id);
  if actor_permission = 'member' and (target_image.uploaded_by is null or target_image.uploaded_by <> actor_id) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if actor_permission = 'member' and (target_report.submitted_by is null or target_report.submitted_by <> actor_id) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if target_report.metrics_confirmed or target_report.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.authorize_report_image_delete(p_image_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id text;
  target_image public.report_images;
  target_report public.reports;
  actor_permission text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_image from public.report_images where id = p_image_id;
  if target_image.id is null then return false; end if;
  select * into target_report
  from public.reports
  where id = target_image.report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  actor_permission := (select system_permission from public.business_users where id = actor_id);
  if actor_permission = 'member' and (target_image.uploaded_by is null or target_image.uploaded_by <> actor_id) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if actor_permission = 'member' and (target_report.submitted_by is null or target_report.submitted_by <> actor_id) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if target_report.metrics_confirmed or target_report.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  return true;
end;
$function$;
