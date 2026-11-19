-- RC19 Production UAT pre-change RLS/RPC schema snapshot, captured 2026-10-24.
-- Contains only schema source, NO rows, tokens, secrets or personal data.
-- DO NOT automatically run this as a migration: restores INSECURE legacy
-- REPORTS permissions. For emergency rollback by authorized DBA only, behind
-- private-network / deployment SSO access and after security impact review.
-- NOT a full database backup.  Snapshot records: reports=2, revisions=17.

BEGIN;
DROP POLICY IF EXISTS reports_active_select ON public.reports;
CREATE POLICY reports_active_select ON public.reports
  FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND (deleted_at IS NULL) AND (archived_at IS NULL)));

DROP POLICY IF EXISTS reports_archived_select ON public.reports;
CREATE POLICY reports_archived_select ON public.reports
  FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ((deleted_at IS NOT NULL) OR (archived_at IS NOT NULL)) AND (( SELECT private.current_system_permission() AS current_system_permission) = 'admin'::text)));

DROP POLICY IF EXISTS live_report_images_read ON public.live_report_images;
CREATE POLICY live_report_images_read ON public.live_report_images
  FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ((report_id IS NULL) OR (EXISTS ( SELECT 1
   FROM reports report
  WHERE ((report.id = live_report_images.report_id) AND (((report.deleted_at IS NULL) AND (report.archived_at IS NULL)) OR (( SELECT private.current_system_permission() AS current_system_permission) = 'admin'::text))))))));

CREATE OR REPLACE FUNCTION public.get_report_revisions(p_report_id text)
 RETURNS TABLE(version integer, created_at timestamp with time zone, created_by text, status text, reason text, event text, metrics jsonb, ocr_review jsonb, final_recap jsonb, image_references text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.require_report_actor(false);
  select * into target_report
  from public.reports
  where id = p_report_id;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if (target_report.deleted_at is not null or target_report.archived_at is not null)
    and private.current_system_permission() <> 'admin' then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  return query
  select revision.version, revision.created_at, revision.created_by, revision.status,
    revision.reason, revision.event, revision.metrics, revision.ocr_review,
    revision.final_recap, revision.image_references
  from public.report_revisions as revision
  where revision.report_id = p_report_id
  order by revision.version;
end;
$function$

COMMIT;
