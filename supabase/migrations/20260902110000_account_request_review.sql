-- V1.1 Account Request Phase 2: Admin review state only.
-- Approval and rejection stop before Auth, Staff, identity linking, or
-- provisioning. Review writes use the canonical persistent audit trail.

alter table public.account_requests
  add column version integer not null default 0;

alter table public.account_requests
  add constraint account_requests_version_nonnegative_check
  check (version >= 0);

create or replace function public.approve_account_request(
  p_request_id uuid,
  p_expected_version integer
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text;
  v_request public.account_requests;
begin
  v_actor_id := private.require_staff_admin();

  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;

  if v_request.status = 'approved' then
    return v_request;
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_PENDING';
  end if;

  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_REVIEW_STALE';
  end if;

  update public.account_requests as request_row
  set status = 'approved',
      reviewed_at = statement_timestamp(),
      reviewed_by = v_actor_id,
      rejection_reason = null,
      provisioning_status = 'not_started',
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.status = 'pending'
    and request_row.version = p_expected_version
  returning * into v_request;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_REVIEW_STALE';
  end if;

  return v_request;
end;
$$;

create or replace function public.reject_account_request(
  p_request_id uuid,
  p_expected_version integer,
  p_rejection_reason text
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text;
  v_reason text;
  v_request public.account_requests;
begin
  v_actor_id := private.require_staff_admin();

  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;

  if v_request.status = 'rejected' then
    return v_request;
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_PENDING';
  end if;

  v_reason := btrim(coalesce(p_rejection_reason, ''));
  if v_reason = '' then
    raise exception using errcode = '22023', message = 'ACCOUNT_REQUEST_REJECTION_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception using errcode = '22023', message = 'ACCOUNT_REQUEST_REJECTION_REASON_TOO_LONG';
  end if;

  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_REVIEW_STALE';
  end if;

  update public.account_requests as request_row
  set status = 'rejected',
      reviewed_at = statement_timestamp(),
      reviewed_by = v_actor_id,
      rejection_reason = v_reason,
      provisioning_status = 'not_started',
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.status = 'pending'
    and request_row.version = p_expected_version
  returning * into v_request;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_REVIEW_STALE';
  end if;

  return v_request;
end;
$$;

revoke all on function public.approve_account_request(uuid, integer) from public, anon, authenticated;
revoke all on function public.reject_account_request(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.approve_account_request(uuid, integer) to authenticated;
grant execute on function public.reject_account_request(uuid, integer, text) to authenticated;

-- Keep account-request review events in the existing immutable row-change audit
-- stream. This is the existing trigger contract with only the new module and
-- rejection-reason mappings added.
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
      when 'account_requests' then 'staff'
      when 'business_users' then 'staff'
      when 'brands' then 'brands'
      when 'platforms' then 'platforms'
      when 'campaigns' then 'campaigns'
      else 'settings'
    end,
    action_value, case when tg_table_name = 'account_requests' then 'account_requests' else replace(tg_table_name, '_', ' ') end,
    entity_id_value, entity_name_value,
    before_row, after_row, changed, coalesce(after_row->>'deletion_reason', after_row->>'rejection_reason', after_row->>'review_notes'),
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
drop trigger if exists audit_account_requests_change on public.account_requests;
create trigger audit_account_requests_change
after insert or update or delete on public.account_requests
for each row execute function private.capture_audit_row_change();

-- Account request submission is public-neutral, but its persistent notification
-- is recipient-scoped to active canonical Admin business users only.
create or replace function private.emit_account_request_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  for recipient_id in
    select business_user.id
    from public.business_users as business_user
    where business_user.system_permission = 'admin'
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
  loop
    perform private.insert_notification(
      recipient_id,
      'account_request_submitted',
      'system',
      'info',
      'New account request',
      'A new account request is ready for review.',
      'account_requests',
      new.id::text,
      '/staff',
      'account_request_submitted:' || new.id::text || ':' || recipient_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.emit_account_request_notification() from public, anon, authenticated;
drop trigger if exists account_requests_notification_events on public.account_requests;
create trigger account_requests_notification_events
after insert on public.account_requests
for each row execute function private.emit_account_request_notification();

comment on column public.account_requests.version is
  'Server-controlled optimistic concurrency revision for Admin review.';
comment on function public.approve_account_request(uuid, integer) is
  'Admin-only Phase 2 review transition. Does not provision Auth or Staff.';
comment on function public.reject_account_request(uuid, integer, text) is
  'Admin-only Phase 2 review transition. Does not provision Auth or Staff.';
