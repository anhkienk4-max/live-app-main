-- Persist the distinction between schedule-derived and manually corrected status.
alter table public.shifts add column if not exists status_mode text;

update public.shifts
set status_mode = case
  when status in ('paused', 'completed', 'cancelled') then 'manual'
  else 'auto'
end
where status_mode is null;

alter table public.shifts alter column status_mode set default 'auto';
alter table public.shifts alter column status_mode set not null;
alter table public.shifts drop constraint if exists shifts_status_mode_check;
alter table public.shifts add constraint shifts_status_mode_check
  check (status_mode in ('auto', 'manual'));

-- Status changes made by the existing manual RPC become manual overrides. The
-- automatic and return-to-auto RPCs use transaction-local guards below.
create or replace function private.set_shift_status_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  override_mode text;
  source_mode text;
begin
  override_mode := current_setting('app.shift_status_mode_override', true);
  source_mode := current_setting('app.audit_source', true);
  if override_mode in ('auto', 'manual') then
    new.status_mode := override_mode;
  elsif new.status is distinct from old.status and coalesce(source_mode, 'manual') <> 'system' then
    new.status_mode := 'manual';
  end if;
  return new;
end;
$$;

drop trigger if exists set_shift_status_mode_before_update on public.shifts;
create trigger set_shift_status_mode_before_update
before update of status on public.shifts
for each row execute function private.set_shift_status_mode();

-- Keep the existing versioned RPC and its field/permission checks. The only
-- lifecycle extension is allowing a previously automatic completion to be
-- corrected by an authorized user.
create or replace function public.update_shift(
  p_shift_id text,
  p_patch jsonb,
  p_confirm_impact boolean default false
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  actor_permission text;
  existing_shift public.shifts;
  updated_shift public.shifts;
  input_key text;
  requested_status text;
begin
  actor_id := private.require_shift_actor(true);
  actor_permission := private.current_system_permission();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'SHIFT_PAYLOAD_INVALID';
  end if;
  if p_patch ?| array['host_id', 'support_id', 'technical_id'] then
    raise exception using errcode = '22023', message = 'STAFFING_FIELDS_USE_STAFFING_RPC';
  end if;
  for input_key in select jsonb_object_keys(p_patch)
  loop
    if input_key <> all (array[
      'date', 'start_time', 'end_time', 'brand_id', 'platform_id', 'campaign_id',
      'title', 'studio', 'required_host_count', 'required_support_count',
      'required_technical_count', 'status', 'live_link', 'product_notes',
      'registration_cutoff_at', 'allow_multi_role'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
    if actor_permission = 'leader'
      and input_key in ('registration_cutoff_at', 'allow_multi_role')
    then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  end loop;
  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if existing_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  requested_status := coalesce(nullif(p_patch->>'status', ''), existing_shift.status);
  if actor_permission in ('leader', 'admin')
    and requested_status <> existing_shift.status and not (
      (existing_shift.status = 'scheduled' and requested_status in ('scheduled', 'preparing', 'cancelled'))
      or (existing_shift.status = 'preparing' and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'cancelled'))
      or (existing_shift.status = 'live' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'paused' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and existing_shift.status_mode = 'auto'
        and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and existing_shift.status_mode = 'manual' and requested_status = 'completed')
      or (existing_shift.status = 'cancelled' and requested_status = 'cancelled')
    ) then
    raise exception using errcode = '42501', message = 'SHIFT_STATUS_TRANSITION_NOT_ALLOWED';
  end if;
  if existing_shift.status = 'live' and p_patch ?| array['date', 'start_time', 'platform_id'] then
    raise exception using errcode = 'P0001', message = 'LIVE_SHIFT_FIELD_LOCKED';
  end if;
  if existing_shift.status = 'completed'
    and p_patch ?| array['date', 'start_time', 'end_time', 'platform_id', 'campaign_id']
    and not p_confirm_impact
  then
    raise exception using errcode = 'P0001', message = 'COMPLETED_SHIFT_IMPACT_CONFIRMATION_REQUIRED';
  end if;
  update public.shifts as shift
  set
    date = case when p_patch ? 'date' then (p_patch->>'date')::date else shift.date end,
    start_time = case when p_patch ? 'start_time' then (p_patch->>'start_time')::time else shift.start_time end,
    end_time = case when p_patch ? 'end_time' then (p_patch->>'end_time')::time else shift.end_time end,
    brand_id = case when p_patch ? 'brand_id' then nullif(p_patch->>'brand_id', '') else shift.brand_id end,
    platform_id = case when p_patch ? 'platform_id' then nullif(p_patch->>'platform_id', '') else shift.platform_id end,
    campaign_id = case when p_patch ? 'campaign_id' then nullif(p_patch->>'campaign_id', '') else shift.campaign_id end,
    title = case when p_patch ? 'title' then nullif(p_patch->>'title', '') else shift.title end,
    studio = case when p_patch ? 'studio' then nullif(p_patch->>'studio', '') else shift.studio end,
    required_host_count = case when p_patch ? 'required_host_count' then private.normalize_shift_capacity(p_patch->>'required_host_count', 1::smallint) else shift.required_host_count end,
    required_support_count = case when p_patch ? 'required_support_count' then private.normalize_shift_capacity(p_patch->>'required_support_count', 1::smallint) else shift.required_support_count end,
    required_technical_count = case when p_patch ? 'required_technical_count' then private.normalize_shift_capacity(p_patch->>'required_technical_count', 1::smallint) else shift.required_technical_count end,
    registration_cutoff_at = case when p_patch ? 'registration_cutoff_at' then nullif(p_patch->>'registration_cutoff_at', '')::timestamptz else shift.registration_cutoff_at end,
    allow_multi_role = case when p_patch ? 'allow_multi_role' then (p_patch->>'allow_multi_role')::boolean else shift.allow_multi_role end,
    status = requested_status,
    live_link = case when p_patch ? 'live_link' then nullif(p_patch->>'live_link', '') else shift.live_link end,
    product_notes = case when p_patch ? 'product_notes' then nullif(p_patch->>'product_notes', '') else shift.product_notes end,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into updated_shift;
  perform private.assert_shift_staffing_consistent(updated_shift);
  return updated_shift;
end;
$$;

-- Reconcile only active auto-mode shifts. The RPC is intentionally idempotent;
-- callers can run it before reads and on existing polling intervals.
create or replace function public.refresh_automatic_shift_statuses()
returns table(updated_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_shift_actor(false);
  perform set_config('app.audit_source', 'system', true);
  return query
  with desired as (
    select shift.id, shift.version,
      case
        when statement_timestamp() >= shift.end_at then 'completed'
        when statement_timestamp() >= shift.start_at then 'live'
        when statement_timestamp() >= shift.registration_cutoff_at then 'preparing'
        else 'scheduled'
      end as next_status
    from public.shifts as shift
    where shift.deleted_at is null
      and shift.archived_at is null
      and shift.status_mode = 'auto'
      and shift.status <> 'cancelled'
  ), updated as (
    update public.shifts as shift
    set status = desired.next_status
    from desired
    where shift.id = desired.id
      and shift.status_mode = 'auto'
      and shift.version = desired.version
      and shift.status is distinct from desired.next_status
    returning shift.id
  )
  select count(*)::integer from updated;
end;
$$;

create or replace function public.return_shift_to_automatic(
  p_shift_id text,
  p_expected_version integer default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_shift public.shifts;
  updated_shift public.shifts;
begin
  perform private.require_shift_actor(true);
  select * into current_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if current_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if p_expected_version is null or p_expected_version <> current_shift.version then
    raise exception using errcode = 'P0001', message = 'STALE_WRITE';
  end if;
  if current_shift.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'SHIFT_CANCELLED_CANNOT_AUTO';
  end if;
  perform set_config('app.shift_status_mode_override', 'auto', true);
  update public.shifts as shift
  set status = case
    when statement_timestamp() >= shift.end_at then 'completed'
    when statement_timestamp() >= shift.start_at then 'live'
    when statement_timestamp() >= shift.registration_cutoff_at then 'preparing'
    else 'scheduled'
  end,
  status_mode = 'auto'
  where shift.id = p_shift_id
  returning * into updated_shift;
  return updated_shift;
end;
$$;

revoke all on function private.set_shift_status_mode() from public, anon, authenticated;
revoke all on function public.refresh_automatic_shift_statuses() from public, anon;
revoke all on function public.return_shift_to_automatic(text, integer) from public, anon;
grant execute on function public.refresh_automatic_shift_statuses() to authenticated;
grant execute on function public.return_shift_to_automatic(text, integer) to authenticated;

-- Automatic transitions are system sourced in the existing audit trail; manual
-- corrections retain the default manual source and the actor identity.
create or replace function private.capture_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
  actor_business_id text;
  actor_auth_id uuid;
  actor_display_name text;
  actor_permission text;
  entity_id_value text;
  entity_name_value text;
  changed text[];
  action_value text;
  source_value text := coalesce(nullif(current_setting('app.audit_source', true), ''), 'manual');
  metadata_value jsonb := '{}'::jsonb;
begin
  if source_value not in ('manual', 'excel_import', 'google_sheets', 'system', 'ocr', 'upload') then
    source_value := 'manual';
  end if;
  before_row := private.audit_sanitize_row(case when tg_op <> 'INSERT' then to_jsonb(old) else null end);
  after_row := private.audit_sanitize_row(case when tg_op <> 'DELETE' then to_jsonb(new) else null end);
  entity_id_value := coalesce(after_row->>'id', before_row->>'id');
  if entity_id_value is null or btrim(entity_id_value) = '' then return coalesce(new, old); end if;
  entity_name_value := coalesce(after_row->>'title', after_row->>'name', after_row->>'full_name', before_row->>'title', before_row->>'name', before_row->>'full_name', entity_id_value);
  actor_auth_id := auth.uid();
  actor_business_id := private.current_business_user_id();
  select business_user.full_name, business_user.system_permission
    into actor_display_name, actor_permission
  from public.business_users as business_user
  where business_user.id = actor_business_id;
  action_value := private.audit_action_for_change(tg_table_name, tg_op, before_row, after_row);
  if tg_op = 'INSERT' and coalesce(after_row->>'source', '') in ('excel_import', 'google_sheets') then
    source_value := after_row->>'source';
  elsif coalesce(after_row->>'source', '') in ('ocr', 'upload', 'system') then
    source_value := after_row->>'source';
  end if;
  metadata_value := jsonb_build_object('table', tg_table_name, 'operation', tg_op);
  if after_row ? 'status' then metadata_value := metadata_value || jsonb_build_object('status', after_row->>'status'); end if;
  if after_row ? 'status_mode' then metadata_value := metadata_value || jsonb_build_object('status_mode', after_row->>'status_mode'); end if;
  if after_row ? 'version' then metadata_value := metadata_value || jsonb_build_object('version', after_row->>'version'); end if;
  select coalesce(array_agg(key order by key), '{}'::text[]) into changed
  from (
    select key from jsonb_object_keys(coalesce(before_row, '{}'::jsonb)) as old_keys(key)
    union select key from jsonb_object_keys(coalesce(after_row, '{}'::jsonb)) as new_keys(key)
  ) as keys
  where (before_row->key) is distinct from (after_row->key);
  insert into public.audit_logs (
    actor_auth_user_id, actor_business_user_id, actor_name, actor_role,
    module, action, entity_type, entity_id, entity_name,
    before_data, after_data, changed_fields, reason, source, correlation_id,
    metadata, entity_exists
  ) values (
    actor_auth_id, actor_business_id, actor_display_name, actor_permission,
    case tg_table_name
      when 'shifts' then 'calendar' when 'shift_registrations' then 'calendar'
      when 'reports' then 'reports' when 'report_revisions' then 'reports'
      when 'report_images' then 'reports' when 'live_report_images' then 'reports'
      when 'swap_requests' then 'swaps' when 'schedule_import_batches' then 'imports'
      when 'schedule_import_batch_rows' then 'imports' when 'business_users' then 'staff'
      when 'brands' then 'brands' when 'platforms' then 'platforms'
      when 'campaigns' then 'campaigns' else 'settings'
    end,
    action_value, replace(tg_table_name, '_', ' '), entity_id_value, entity_name_value,
    before_row, after_row, changed, coalesce(after_row->>'deletion_reason', after_row->>'review_notes'),
    source_value, coalesce(nullif(current_setting('request.header.x-request-id', true), ''), gen_random_uuid()::text),
    metadata_value, tg_op <> 'DELETE'
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.capture_audit_row_change() from public, anon, authenticated;
