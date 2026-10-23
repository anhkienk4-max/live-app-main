-- RC19 Reports #77: minimal shift display context for an authorized report.
-- Do not expand shifts SELECT RLS to repair historical reports UI.
-- This private helper returns only non-PII display attributes, never complete
-- shift rows, staffing, notes, studio, provider routes, or dashboard evidence.
-- Caller must already be entitled to exactly p_report_id under #84.
-- Frontend/list integration is a separately reviewed change.
begin;

create or replace function private.report_shift_display_context(p_report_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  context jsonb;
begin
  if p_report_id is null
    or not private.current_business_user_is_active()
    or not private.can_read_report(p_report_id) then
    return null;
  end if;

  select jsonb_build_object(
    'date', shift.date,
    'start_time', shift.start_time,
    'end_time', shift.end_time,
    'brand_id', shift.brand_id,
    'platform_id', shift.platform_id,
    'campaign_id', shift.campaign_id
  ) into context
  from public.reports as report
  join public.shifts as shift on shift.id = report.shift_id
  where report.id = p_report_id;

  return context;
end;
$$;

-- This function is in the non-exposed private schema. It can be invoked by
-- database-side report read endpoints under RLS, not a public PostgREST route.
revoke all on function private.report_shift_display_context(text)
  from public, anon, authenticated, service_role;
grant execute on function private.report_shift_display_context(text)
  to authenticated;
commit;
