-- SECURITY REVIEW CANDIDATE ONLY. Not a Production migration.
-- PRODUCTION WAS NOT MODIFIED by the P0.9 audit.
-- A direct authenticated PostgREST RPC to remove_* can bypass the earlier
-- authorize_* HTTP preflight, and SQL <> with NULL does not reject ownership.
-- Independent Security/DBA reviewer and explicit Production release
-- authorization are REQUIRED before this can be applied.
-- Intended Production base: live production function fingerprints below.
-- Running this file on any other schema/version aborts before DDL.
set local lock_timeout='3s';
set local statement_timeout='45s';
do $p09_prod_preflight$
begin
 if md5(pg_get_functiondef('public.remove_report_image(text)'::regprocedure)) <> '682c1b6e46c34c7f84da888f7fd18eb7'
  or md5(pg_get_functiondef('public.remove_live_report_image(text)'::regprocedure)) <> '0567a626eba1314940d628cdc72046e5'
 then raise exception 'P09_PRODUCTION_HOTFIX_SOURCE_FINGERPRINT_CHANGED_STOP'; end if;
end;
$p09_prod_preflight$;

CREATE OR REPLACE FUNCTION public.remove_live_report_image(p_image_id text)
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
  remaining integer;
  removed_sort_order integer;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_image from public.live_report_images where id = p_image_id;
  if target_image.id is null then
    return false;
  end if;
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

  removed_sort_order := target_image.sort_order;

  delete from public.live_report_images where id = p_image_id;

  -- Promote first remaining image to cover if the deleted one was the cover.
  if target_image.is_cover then
    select count(*) into remaining
    from public.live_report_images
    where report_id = target_image.report_id;
    if remaining > 0 then
      update public.live_report_images
      set is_cover = true
      where id = (
        select id from public.live_report_images
        where report_id = target_image.report_id
        order by sort_order, created_at
        limit 1
      );
      update public.live_report_images
      set sort_order = sort_order - 1
      where report_id = target_image.report_id
        and sort_order > removed_sort_order;
    end if;
  end if;

  perform private.record_report_revision(
    target_report.id, actor_id, target_report.status, 'remove_image',
    'Removed live session image',
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(target_report.id)
  );

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_report_image(p_image_id text)
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
  if target_image.id is null then
    return false;
  end if;
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

  delete from public.report_images where id = p_image_id;

  perform private.record_report_revision(
    target_report.id, actor_id, target_report.status, 'remove_image',
    'Removed report evidence image',
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(target_report.id)
  );

  return true;
end;
$function$;
