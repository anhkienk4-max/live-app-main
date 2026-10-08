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
$$;
revoke all on function public.get_report_revisions(text) from public, anon, authenticated;
grant execute on function public.get_report_revisions(text) to authenticated;
