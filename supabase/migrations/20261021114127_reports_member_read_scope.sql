-- Reports are narrower than shift discovery: open registration and pending applications do not grant report access.
begin;

do $$
begin
  if to_regprocedure('private.can_read_shift(text)') is null then
    raise exception 'REPORT_READ_SCOPE_HELPER_MISSING';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.reports'::regclass) then
    raise exception 'REPORT_RLS_MUST_REMAIN_ENABLED';
  end if;
  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('reports', 'report_revisions', 'report_images', 'live_report_images')
      and p.cmd in ('SELECT', 'ALL')
      and p.permissive = 'PERMISSIVE'
      and (p.roles @> array['public'::name] or p.roles @> array['authenticated'::name])
      and not (
        p.cmd = 'SELECT'
        and (
        (p.tablename = 'reports' and p.policyname in ('reports_active_select', 'reports_archived_select'))
        or (p.tablename = 'report_revisions' and p.policyname = 'report_revisions_read')
        or (p.tablename = 'report_images' and p.policyname = 'report_images_read')
        or (p.tablename = 'live_report_images' and p.policyname = 'live_report_images_read')
        )
      )
  ) then
    raise exception 'UNEXPECTED_PERMISSIVE_REPORT_READ_POLICY';
  end if;
end;
$$;

create temporary table rc16k_report_revision_acl_before on commit drop as
select proowner, proacl, prosecdef, proconfig
from pg_proc
where oid = 'public.get_report_revisions(text)'::regprocedure;

create or replace function private.can_read_report(p_shift_id text, p_submitted_by text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((
    select (select private.current_business_user_is_active())
      and (select private.current_system_permission()) = 'member'
      and (
        shift.host_id = (select private.current_business_user_id())
        or shift.support_id = (select private.current_business_user_id())
        or shift.technical_id = (select private.current_business_user_id())
        or p_submitted_by = (select private.current_business_user_id())
        or exists (
          select 1
          from public.shift_registrations as registration
          where registration.shift_id = shift.id
            and registration.user_id = (select private.current_business_user_id())
            and registration.status in ('approved', 'manually_assigned')
        )
    )
    from public.shifts as shift
    where shift.id = p_shift_id
      and shift.deleted_at is null
      and shift.archived_at is null
  ), false);
$function$;

revoke all on function private.can_read_report(text, text) from public, anon, service_role;
grant execute on function private.can_read_report(text, text) to authenticated;

drop policy if exists reports_active_select on public.reports;
create policy reports_active_select
  on public.reports for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and deleted_at is null
    and archived_at is null
    and (
      (select private.current_system_permission()) in ('admin', 'leader')
      or (select private.can_read_report(shift_id, submitted_by))
    )
  );

drop policy if exists live_report_images_read on public.live_report_images;
create policy live_report_images_read
  on public.live_report_images for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and (
      (
        report_id is null
        and (select private.current_system_permission()) in ('admin', 'leader')
      )
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
  target_report public.reports;
  actor_permission text;
begin
  perform private.require_report_actor(false);
  actor_permission := private.current_system_permission();

  select * into target_report
  from public.reports
  where id = p_report_id;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;

  if (target_report.deleted_at is not null or target_report.archived_at is not null) then
    if actor_permission is distinct from 'admin' then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  elsif actor_permission is distinct from 'admin'
    and actor_permission is distinct from 'leader'
    and not private.can_read_report(target_report.shift_id, target_report.submitted_by) then
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

do $revision_acl_check$
begin
  if not exists (
    select 1
    from rc16k_report_revision_acl_before before_state
    join pg_proc current_state on current_state.oid = 'public.get_report_revisions(text)'::regprocedure
    where current_state.proowner = before_state.proowner
      and current_state.proacl is not distinct from before_state.proacl
      and current_state.prosecdef = before_state.prosecdef
      and current_state.proconfig is not distinct from before_state.proconfig
  ) then
    raise exception 'REPORT_REVISION_RPC_SECURITY_METADATA_CHANGED';
  end if;
end;
$revision_acl_check$;

commit;
