-- RC19 #84: SECURITY INVOKER RPC must not call privileged-only require_report_actor.
-- Existing private.current_business_user_id() and current_business_user_is_active()
-- are callable by authenticated; report SELECT and revision RLS apply as caller.
-- Do not grant EXECUTE on private.require_report_actor to authenticated.
begin;
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
security invoker
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null or not private.current_business_user_is_active() then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
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
