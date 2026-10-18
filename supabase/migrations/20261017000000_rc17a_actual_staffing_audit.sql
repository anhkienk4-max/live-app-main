-- RC1.7A: Actual Staffing Dedicated Audit Trail & Overlap Index (STAGED ONLY)
-- TARGET ENVIRONMENT: LOCAL / STAGING TEST FIXTURES ONLY.
-- DO NOT RUN ON PRODUCTION WITHOUT EXPLICIT AUTHORIZATION.

-- 1. Create dedicated, idempotent trigger function for workforce_actual_segments audit
-- Sets module to 'calendar' so Leaders and Admins can view logs under audit_logs_read RLS.
-- Correctly handles review_status changes to identify 'approve' and 'reject' actions.
create or replace function private.capture_workforce_actual_audit()
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
  reason_value text;
  metadata_value jsonb := '{}'::jsonb;
begin
  before_row := private.audit_sanitize_row(case when tg_op <> 'INSERT' then to_jsonb(old) else null end);
  after_row := private.audit_sanitize_row(case when tg_op <> 'DELETE' then to_jsonb(new) else null end);

  entity_id_value := coalesce(after_row->>'id', before_row->>'id');
  if entity_id_value is null or btrim(entity_id_value) = '' then
    return coalesce(new, old);
  end if;

  entity_name_value := coalesce(
    (after_row->>'staff_id') || ' (' || (after_row->>'operational_role') || ')',
    (before_row->>'staff_id') || ' (' || (before_row->>'operational_role') || ')',
    entity_id_value
  );

  -- Determine lifecycle action
  if tg_op = 'INSERT' then
    action_value := 'create';
    actor_business_id := coalesce(after_row->>'created_by', private.current_business_user_id());
    reason_value := after_row->>'evidence_note';
  elsif tg_op = 'DELETE' then
    action_value := 'delete';
    actor_business_id := private.current_business_user_id();
    reason_value := before_row->>'evidence_note';
  else
    if (before_row->>'review_status') is distinct from (after_row->>'review_status') then
      if after_row->>'review_status' = 'approved' then
        action_value := 'approve';
      elsif after_row->>'review_status' = 'rejected' then
        action_value := 'reject';
      else
        action_value := 'update';
      end if;
      actor_business_id := coalesce(after_row->>'reviewed_by', private.current_business_user_id());
      reason_value := coalesce(after_row->>'review_note', after_row->>'evidence_note');
    else
      action_value := 'update';
      actor_business_id := private.current_business_user_id();
      reason_value := after_row->>'evidence_note';
    end if;
  end if;

  actor_auth_id := auth.uid();
  if actor_business_id is not null then
    select business_user.full_name, business_user.system_permission
      into actor_display_name, actor_permission
    from public.business_users as business_user
    where business_user.id = actor_business_id;
  end if;

  metadata_value := jsonb_build_object(
    'table', tg_table_name,
    'operation', tg_op,
    'shift_id', coalesce(after_row->>'shift_id', before_row->>'shift_id'),
    'event_kind', coalesce(after_row->>'event_kind', before_row->>'event_kind'),
    'coverage_kind', coalesce(after_row->>'coverage_kind', before_row->>'coverage_kind'),
    'version', coalesce(after_row->>'version', before_row->>'version')
  );

  select coalesce(array_agg(key order by key), '{}'::text[])
    into changed
  from (
    select key from jsonb_object_keys(coalesce(before_row, '{}'::jsonb)) as old_keys(key)
    union
    select key from jsonb_object_keys(coalesce(after_row, '{}'::jsonb)) as new_keys(key)
  ) as keys
  where (before_row->key) is distinct from (after_row->key);

  insert into public.audit_logs (
    actor_auth_user_id,
    actor_business_user_id,
    actor_name,
    actor_role,
    module,
    action,
    entity_type,
    entity_id,
    entity_name,
    before_data,
    after_data,
    changed_fields,
    reason,
    source,
    correlation_id,
    metadata,
    entity_exists
  ) values (
    actor_auth_id,
    actor_business_id,
    actor_display_name,
    actor_permission,
    'calendar',
    action_value,
    'workforce_actual_segment',
    entity_id_value,
    entity_name_value,
    before_row,
    after_row,
    changed,
    reason_value,
    'manual',
    coalesce(nullif(current_setting('request.header.x-request-id', true), ''), gen_random_uuid()::text),
    metadata_value,
    tg_op <> 'DELETE'
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.capture_workforce_actual_audit() from public, anon, authenticated;

-- 2. Attach trigger idempotently to workforce_actual_segments
drop trigger if exists audit_workforce_actual_segments_change on public.workforce_actual_segments;
create trigger audit_workforce_actual_segments_change
  after insert or update or delete on public.workforce_actual_segments
  for each row execute function private.capture_workforce_actual_audit();

-- 3. Fast concurrency index for cross-shift staff overlap detection
-- Accelerates [actual_start_at, actual_end_at) interval queries for Assistant & Host split shifts
create index if not exists workforce_actual_staff_active_overlap
  on public.workforce_actual_segments (staff_id, actual_start_at, actual_end_at)
  where event_kind = 'worked' and review_status = 'approved';

comment on trigger audit_workforce_actual_segments_change on public.workforce_actual_segments is
  'RC1.7A: Audits all Actual Staffing segment lifecycle events (draft submission, review approval/rejection) into public.audit_logs under module calendar';
