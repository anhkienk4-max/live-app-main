-- S4F-Lite: preserve spreadsheet staffing names as display-only audit labels.
-- These arrays intentionally have no foreign keys and create no registrations.

alter table public.shifts
  add column if not exists host_names text[] not null default '{}'::text[],
  add column if not exists assistant_names text[] not null default '{}'::text[],
  add column if not exists technical_names text[] not null default '{}'::text[];

comment on column public.shifts.host_names is
  'Display-only Host names imported from a schedule; not personnel assignments.';
comment on column public.shifts.assistant_names is
  'Display-only Assistant/Trợ live names imported from a schedule; not personnel assignments.';
comment on column public.shifts.technical_names is
  'Display-only Technical names imported from a schedule; not personnel assignments.';

create or replace function public.create_shift(p_data jsonb)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  created_shift public.shifts;
  input_key text;
  initial_user_id text;
  role_name text;
begin
  actor_id := private.require_shift_actor(true);
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'SHIFT_PAYLOAD_INVALID';
  end if;
  for input_key in select jsonb_object_keys(p_data)
  loop
    if input_key <> all (array[
      'date', 'start_time', 'end_time', 'timezone', 'brand_id', 'platform_id',
      'campaign_id', 'title', 'studio', 'host_id', 'support_id', 'technical_id',
      'host_names', 'assistant_names', 'technical_names',
      'required_host_count', 'required_support_count', 'required_technical_count',
      'registration_cutoff_at', 'allow_multi_role', 'import_batch_id', 'status',
      'live_link', 'product_notes'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
  end loop;

  if (p_data ? 'host_names' and jsonb_typeof(p_data->'host_names') <> 'array')
    or (p_data ? 'assistant_names' and jsonb_typeof(p_data->'assistant_names') <> 'array')
    or (p_data ? 'technical_names' and jsonb_typeof(p_data->'technical_names') <> 'array')
  then
    raise exception using errcode = '22023', message = 'SHIFT_STAFFING_NAMES_INVALID';
  end if;

  insert into public.shifts (
    date, start_time, end_time, timezone, brand_id, platform_id, campaign_id,
    title, studio, host_names, assistant_names, technical_names,
    required_host_count, required_support_count, required_technical_count,
    registration_cutoff_at, allow_multi_role, import_batch_id, status,
    live_link, product_notes, updated_by
  ) values (
    (p_data->>'date')::date,
    (p_data->>'start_time')::time,
    (p_data->>'end_time')::time,
    coalesce(nullif(p_data->>'timezone', ''), 'Asia/Ho_Chi_Minh'),
    nullif(p_data->>'brand_id', ''),
    nullif(p_data->>'platform_id', ''),
    nullif(p_data->>'campaign_id', ''),
    nullif(p_data->>'title', ''),
    nullif(p_data->>'studio', ''),
    array(select value from jsonb_array_elements_text(coalesce(p_data->'host_names', '[]'::jsonb)) as names(value)),
    array(select value from jsonb_array_elements_text(coalesce(p_data->'assistant_names', '[]'::jsonb)) as names(value)),
    array(select value from jsonb_array_elements_text(coalesce(p_data->'technical_names', '[]'::jsonb)) as names(value)),
    private.normalize_shift_capacity(p_data->>'required_host_count', 1::smallint),
    private.normalize_shift_capacity(p_data->>'required_support_count', 1::smallint),
    private.normalize_shift_capacity(p_data->>'required_technical_count', 1::smallint),
    nullif(p_data->>'registration_cutoff_at', '')::timestamptz,
    coalesce((p_data->>'allow_multi_role')::boolean, false),
    nullif(p_data->>'import_batch_id', ''),
    coalesce(nullif(p_data->>'status', ''), 'scheduled'),
    nullif(p_data->>'live_link', ''),
    nullif(p_data->>'product_notes', ''),
    actor_id
  ) returning * into created_shift;

  foreach role_name in array array['host', 'support', 'technical']::text[]
  loop
    initial_user_id := nullif(p_data->>(role_name || '_id'), '');
    if initial_user_id is not null then
      perform private.insert_manual_shift_assignment(
        created_shift.id, initial_user_id, role_name, actor_id, 'Initial shift assignment', false
      );
    end if;
  end loop;

  update public.shifts set registration_locked = false where id = created_shift.id;
  select * into created_shift from public.shifts where id = created_shift.id;
  return created_shift;
end;
$$;

revoke all on function public.create_shift(jsonb) from public, anon, authenticated;
grant execute on function public.create_shift(jsonb) to authenticated;
