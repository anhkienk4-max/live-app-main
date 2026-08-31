-- Forward-only correction for the shared Core V1 audit trigger.
-- INSERT: before NULL / after NEW; UPDATE: before OLD / after NEW;
-- DELETE: before OLD / after NULL.
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
  source_value text := 'manual';
  metadata_value jsonb := '{}'::jsonb;
begin
  before_row := private.audit_sanitize_row(case when tg_op <> 'INSERT' then to_jsonb(old) else null end);
  after_row := private.audit_sanitize_row(case when tg_op <> 'DELETE' then to_jsonb(new) else null end);
  entity_id_value := coalesce(after_row->>'id', before_row->>'id');
  if entity_id_value is null or btrim(entity_id_value) = '' then
    return coalesce(new, old);
  end if;
  entity_name_value := coalesce(
    after_row->>'title', after_row->>'name', after_row->>'full_name',
    before_row->>'title', before_row->>'name', before_row->>'full_name',
    entity_id_value
  );
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
  if after_row ? 'version' then metadata_value := metadata_value || jsonb_build_object('version', after_row->>'version'); end if;
  select coalesce(array_agg(key order by key), '{}'::text[])
    into changed
  from (
    select key from jsonb_object_keys(coalesce(before_row, '{}'::jsonb)) as old_keys(key)
    union
    select key from jsonb_object_keys(coalesce(after_row, '{}'::jsonb)) as new_keys(key)
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
      when 'shifts' then 'calendar'
      when 'shift_registrations' then 'calendar'
      when 'reports' then 'reports'
      when 'report_revisions' then 'reports'
      when 'report_images' then 'reports'
      when 'live_report_images' then 'reports'
      when 'swap_requests' then 'swaps'
      when 'schedule_import_batches' then 'imports'
      when 'schedule_import_batch_rows' then 'imports'
      when 'business_users' then 'staff'
      when 'brands' then 'brands'
      when 'platforms' then 'platforms'
      when 'campaigns' then 'campaigns'
      else 'settings'
    end,
    action_value, replace(tg_table_name, '_', ' '), entity_id_value, entity_name_value,
    before_row, after_row, changed, coalesce(after_row->>'deletion_reason', after_row->>'review_notes'),
    source_value,
    coalesce(nullif(current_setting('request.header.x-request-id', true), ''), gen_random_uuid()::text),
    metadata_value, tg_op <> 'DELETE'
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_audit_row_change() from public, anon, authenticated;
