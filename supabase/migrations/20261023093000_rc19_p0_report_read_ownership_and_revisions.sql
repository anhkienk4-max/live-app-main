-- RC19 #84 P0 security: close direct table and revision SECURITY DEFINER scope gap.
-- Canonical rule: active Admin: all reports; active Leader: all non-deleted/non-archived;
-- active Member: non-deleted/non-archived submitted-by-self OR formally assigned shift.
-- A pending registration, an open/unassigned shift or mere business-user status
-- never grants a Member access to report contents.
-- This migration does not delete data or change report write/update functions.
-- Note: storage.objects/report_images/report_revisions SELECT policies already join
-- public.reports; the narrowed parent RLS filters their linked records automatically.
-- Unlinked live_report_images are intentionally NOT changed here and require
-- their own Storage/attachments workflow review prior to release.
begin;

create or replace function private.can_read_report(p_report_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  allowed boolean := false;
begin
  if actor_id is null
    or actor_role not in ('member','leader','admin')
    or not private.current_business_user_is_active() then
    return false;
  end if;

  select (
    case
      when actor_role = 'admin' then true
      when report.deleted_at is not null or report.archived_at is not null then false
      when actor_role = 'leader' then true
      when actor_role = 'member' then
        coalesce(report.submitted_by = actor_id, false)
        or exists (
          select 1 from public.shifts as shift
          where shift.id = report.shift_id
            and (
              actor_id in (shift.host_id, shift.support_id, shift.technical_id)
              or exists (
                select 1 from public.shift_registrations as assignment
                where assignment.shift_id = shift.id
                  and assignment.user_id = actor_id
                  and assignment.status in ('approved', 'manually_assigned')
              )
            )
        )
      else false
    end
  ) into allowed
  from public.reports as report
  where report.id = p_report_id;

  return coalesce(allowed, false);
end;
$$;

revoke all on function private.can_read_report(text) from public, anon, authenticated, service_role;
grant execute on function private.can_read_report(text) to authenticated;

drop policy if exists reports_active_select on public.reports;
create policy reports_active_select
on public.reports for select to authenticated
using (
  (select private.current_business_user_is_active())
  and deleted_at is null and archived_at is null
  and private.can_read_report(id)
);

drop policy if exists reports_archived_select on public.reports;
create policy reports_archived_select
on public.reports for select to authenticated
using (
  (select private.current_business_user_is_active())
  and (deleted_at is not null or archived_at is not null)
  and (select private.current_system_permission()) = 'admin'
  and private.can_read_report(id)
);

-- SECURITY DEFINER bypasses reports RLS, so enforce the same report-specific
-- scope before reading revision history, with indistinguishable not-found errors.
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
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.require_report_actor(false);
  if not private.can_read_report(p_report_id) then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  select * into target_report
  from public.reports
  where id = p_report_id;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  return query
  select revision.version, revision.created_at, revision.created_by, revision.status,
    revision.reason, revision.event, revision.metrics, revision.ocr_review,
    revision.final_recap, revision.image_references
  from public.report_revisions as revision
  where revision.report_id = p_report_id
  order by revision.version;
end;
$$;

revoke all on function public.get_report_revisions(text) from public, anon, authenticated, service_role;
grant execute on function public.get_report_revisions(text) to authenticated;
commit;
