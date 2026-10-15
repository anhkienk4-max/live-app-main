-- Isolated UAT only. Restore the pre-RC16K report read definitions after the browser suite.
begin;

do $rollback_precondition$
begin
  if to_regprocedure('private.can_read_report(text,text)') is null then
    raise exception 'REPORT_READ_COMPENSATION_REQUIRES_CANDIDATE_MIGRATION';
  end if;
end;
$rollback_precondition$;

drop policy reports_active_select on public.reports;
create policy reports_active_select
  on public.reports for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and deleted_at is null
    and archived_at is null
  );

drop policy live_report_images_read on public.live_report_images;
create policy live_report_images_read
  on public.live_report_images for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and (
      report_id is null
      or exists (
        select 1
        from public.reports as report
        where report.id = live_report_images.report_id
          and (
            (report.deleted_at is null and report.archived_at is null)
            or (select private.current_system_permission()) = 'admin'
          )
      )
    )
  );

create or replace function public.get_report_revisions(p_report_id text)
returns table (
  version integer,
  created_at timestamptz,
  created_by text,
  status text,
  reason text,
  event text,
  metrics jsonb,
  ocr_review jsonb,
  final_recap jsonb,
  image_references text[]
)
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

drop function private.can_read_report(text, text);

do $rollback_assertions$
declare
  revision_acl text;
begin
  select proacl::text into revision_acl
  from pg_proc where oid = 'public.get_report_revisions(text)'::regprocedure;
  if to_regprocedure('private.can_read_report(text,text)') is not null
    or (select qual like '%can_read_report%' from pg_policies where schemaname='public' and tablename='reports' and policyname='reports_active_select')
    or (select pg_get_functiondef('public.get_report_revisions(text)'::regprocedure) like '%can_read_report%')
    or not (select qual like '%report_id IS NULL%' from pg_policies where schemaname='public' and tablename='live_report_images' and policyname='live_report_images_read')
    or (select pg_get_userbyid(proowner) <> 'postgres' or not prosecdef or proconfig is distinct from array['search_path=""']::text[] from pg_proc where oid='public.get_report_revisions(text)'::regprocedure)
    or revision_acl <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
    or not has_function_privilege('authenticated', 'public.get_report_revisions(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_report_revisions(text)', 'EXECUTE') then
    raise exception 'REPORT_READ_COMPENSATION_POSTCONDITION_FAILED';
  end if;
  raise notice 'REPORT_RLS_COMPENSATING_ROLLBACK=PASS';
end;
$rollback_assertions$;

commit;
