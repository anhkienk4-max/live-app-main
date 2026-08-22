-- S4F.1: edit schedule/display staffing labels without changing canonical staffing.
-- The three text arrays are intentionally independent from user assignments and registrations.

create or replace function public.update_shift_staffing_labels(
  p_shift_id text,
  p_host_names text[],
  p_assistant_names text[],
  p_technical_names text[]
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  updated_shift public.shifts;
begin
  actor_id := private.require_shift_actor(true);

  if p_shift_id is null or btrim(p_shift_id) = '' then
    raise exception using errcode = '22023', message = 'SHIFT_ID_REQUIRED';
  end if;
  if p_host_names is null or p_assistant_names is null or p_technical_names is null then
    raise exception using errcode = '22023', message = 'SHIFT_STAFFING_NAMES_INVALID';
  end if;

  perform 1
  from public.shifts as target
  where target.id = p_shift_id
    and target.deleted_at is null
    and target.archived_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;

  update public.shifts as target
  set
    host_names = p_host_names,
    assistant_names = p_assistant_names,
    technical_names = p_technical_names,
    updated_by = actor_id
  where target.id = p_shift_id
  returning target.* into updated_shift;

  return updated_shift;
end;
$$;

comment on function public.update_shift_staffing_labels(text, text[], text[], text[]) is
  'Leader/Admin-only update of display labels. Does not modify assignments, registrations, capacity, lifecycle, or import history.';

revoke all on function public.update_shift_staffing_labels(text, text[], text[], text[]) from public, anon, authenticated;
grant execute on function public.update_shift_staffing_labels(text, text[], text[], text[]) to authenticated;
