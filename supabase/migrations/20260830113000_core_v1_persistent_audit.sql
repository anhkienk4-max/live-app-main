-- Core V1 persistent audit trail.
-- Audit events are appended by database triggers in the same transaction as
-- the business mutation. Application roles receive read-only access.

create table public.audit_logs (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default statement_timestamp(),
  actor_auth_user_id uuid null,
  actor_business_user_id text null references public.business_users(id) on delete set null,
  actor_name text null,
  actor_role text null,
  module text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  entity_name text not null,
  before_data jsonb null,
  after_data jsonb null,
  changed_fields text[] not null default '{}'::text[],
  reason text null,
  source text not null default 'manual',
  status text not null default 'success',
  error_code text null,
  correlation_id text not null default gen_random_uuid()::text,
  related_records jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  entity_exists boolean not null default true,
  constraint audit_logs_id_not_blank check (btrim(id) <> ''),
  constraint audit_logs_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint audit_logs_entity_id_not_blank check (btrim(entity_id) <> ''),
  constraint audit_logs_source_check check (source in ('manual', 'excel_import', 'google_sheets', 'system', 'ocr', 'upload')),
  constraint audit_logs_status_check check (status in ('success', 'failed'))
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_business_user_id, created_at desc);
create index audit_logs_module_action_idx on public.audit_logs (module, action, created_at desc);
create index audit_logs_correlation_idx on public.audit_logs (correlation_id);

-- Administrative review metadata is separate from immutable events.
create table public.audit_log_reviews (
  audit_id text primary key references public.audit_logs(id) on delete cascade,
  admin_note text null,
  review_status text not null default 'unreviewed',
  handling_reason text null,
  updated_by text null references public.business_users(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint audit_log_reviews_status_check check (review_status in ('unreviewed', 'reviewed', 'action_required', 'resolved'))
);

create index audit_log_reviews_updated_at_idx on public.audit_log_reviews (updated_at desc);

create or replace function private.audit_sanitize_row(p_value jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := '{}'::jsonb;
  item record;
  sanitized jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return null;
  end if;
  for item in select key, value from jsonb_each(p_value) loop
    if item.key ~* '(password|token|secret|api[_-]?key|access[_-]?key|refresh|otp|base64|binary)' then
      continue;
    end if;
    if item.key ~* '(^|_)(file|image|thumbnail)_?url$' and jsonb_typeof(item.value) = 'string' then
      sanitized := to_jsonb('[redacted_reference]'::text);
    elsif jsonb_typeof(item.value) = 'string' and length(item.value #>> '{}') > 10000 then
      sanitized := to_jsonb('[redacted_large_value]'::text);
    else
      sanitized := item.value;
    end if;
    result := result || jsonb_build_object(item.key, sanitized);
  end loop;
  return result;
end;
$$;

revoke all on function private.audit_sanitize_row(jsonb) from public, anon, authenticated;

create or replace function private.audit_action_for_change(
  p_table_name text,
  p_operation text,
  p_before jsonb,
  p_after jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  old_deleted timestamptz;
  new_deleted timestamptz;
  old_archived timestamptz;
  new_archived timestamptz;
  old_status text;
  new_status text;
  old_locked boolean;
  new_locked boolean;
begin
  if p_operation = 'INSERT' then return 'create'; end if;
  if p_operation = 'DELETE' then return 'delete'; end if;
  old_deleted := nullif(p_before->>'deleted_at', '')::timestamptz;
  new_deleted := nullif(p_after->>'deleted_at', '')::timestamptz;
  old_archived := nullif(p_before->>'archived_at', '')::timestamptz;
  new_archived := nullif(p_after->>'archived_at', '')::timestamptz;
  if old_deleted is null and new_deleted is not null then return 'soft_delete'; end if;
  if old_deleted is not null and new_deleted is null then return 'restore'; end if;
  if old_archived is null and new_archived is not null then return 'archive'; end if;
  if old_archived is not null and new_archived is null then return 'restore'; end if;
  old_locked := nullif(p_before->>'registration_locked', '')::boolean;
  new_locked := nullif(p_after->>'registration_locked', '')::boolean;
  if old_locked is false and new_locked is true then return 'lock'; end if;
  if old_locked is true and new_locked is false then return 'reopen'; end if;
  old_status := p_before->>'status';
  new_status := p_after->>'status';
  if old_status is distinct from new_status then
    if new_status = 'approved' then return 'approve'; end if;
    if new_status = 'rejected' then return 'reject'; end if;
    if new_status = 'cancelled' then return 'cancel_registration'; end if;
    if new_status = 'completed' then return 'confirm'; end if;
  end if;
  return 'update';
end;
$$;

revoke all on function private.audit_action_for_change(text, text, jsonb, jsonb) from public, anon, authenticated;

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
  before_row := private.audit_sanitize_row(case when tg_op = 'DELETE' then to_jsonb(old) else null end);
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

-- Attach to every persisted Core V1 operational source of record. Audit rows
-- are written after the mutation and roll back with it if insertion fails.
create trigger audit_business_users_change after insert or update or delete on public.business_users for each row execute function private.capture_audit_row_change();
create trigger audit_brands_change after insert or update or delete on public.brands for each row execute function private.capture_audit_row_change();
create trigger audit_platforms_change after insert or update or delete on public.platforms for each row execute function private.capture_audit_row_change();
create trigger audit_campaigns_change after insert or update or delete on public.campaigns for each row execute function private.capture_audit_row_change();
create trigger audit_shifts_change after insert or update or delete on public.shifts for each row execute function private.capture_audit_row_change();
create trigger audit_shift_registrations_change after insert or update or delete on public.shift_registrations for each row execute function private.capture_audit_row_change();
create trigger audit_swap_requests_change after insert or update or delete on public.swap_requests for each row execute function private.capture_audit_row_change();
create trigger audit_reports_change after insert or update or delete on public.reports for each row execute function private.capture_audit_row_change();
create trigger audit_report_revisions_change after insert or update or delete on public.report_revisions for each row execute function private.capture_audit_row_change();
create trigger audit_report_images_change after insert or update or delete on public.report_images for each row execute function private.capture_audit_row_change();
create trigger audit_live_report_images_change after insert or update or delete on public.live_report_images for each row execute function private.capture_audit_row_change();
create trigger audit_schedule_import_batches_change after insert or update or delete on public.schedule_import_batches for each row execute function private.capture_audit_row_change();
create trigger audit_schedule_import_batch_rows_change after insert or update or delete on public.schedule_import_batch_rows for each row execute function private.capture_audit_row_change();

alter table public.audit_logs enable row level security;
alter table public.audit_log_reviews enable row level security;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.audit_log_reviews from anon, authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.audit_log_reviews to authenticated;

create policy audit_logs_read
  on public.audit_logs for select to authenticated
  using (
    (select private.current_system_permission()) = 'admin'
    or (
      (select private.current_system_permission()) = 'leader'
      and module in ('calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports')
    )
    or actor_business_user_id = (select private.current_business_user_id())
  );

create policy audit_log_reviews_read
  on public.audit_log_reviews for select to authenticated
  using ((select private.current_system_permission()) = 'admin');

create or replace function public.update_audit_review(
  p_audit_id text,
  p_admin_note text,
  p_review_status text,
  p_handling_reason text
)
returns public.audit_log_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text := private.current_business_user_id();
  result public.audit_log_reviews;
begin
  if actor_id is null or private.current_system_permission() <> 'admin' then
    raise exception using errcode = '42501', message = 'AUDIT_REVIEW_NOT_ALLOWED';
  end if;
  if not exists (select 1 from public.audit_logs where id = p_audit_id) then
    raise exception using errcode = 'P0001', message = 'AUDIT_EVENT_NOT_FOUND';
  end if;
  if p_review_status not in ('unreviewed', 'reviewed', 'action_required', 'resolved') then
    raise exception using errcode = '22023', message = 'AUDIT_REVIEW_STATUS_INVALID';
  end if;
  insert into public.audit_log_reviews (audit_id, admin_note, review_status, handling_reason, updated_by)
  values (p_audit_id, p_admin_note, p_review_status, p_handling_reason, actor_id)
  on conflict (audit_id) do update set
    admin_note = excluded.admin_note,
    review_status = excluded.review_status,
    handling_reason = excluded.handling_reason,
    updated_by = excluded.updated_by,
    updated_at = statement_timestamp()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.update_audit_review(text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_audit_review(text, text, text, text) to authenticated;

comment on table public.audit_logs is 'Core V1 immutable, database-owned operational audit events.';
comment on table public.audit_log_reviews is 'Administrative review metadata kept separate from immutable audit events.';
