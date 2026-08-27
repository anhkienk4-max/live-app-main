create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  title text not null,
  message text not null,
  type text not null,
  read boolean not null default false,
  created_at timestamptz not null default statement_timestamp()
);

alter table public.notifications
  add column if not exists recipient_id text null references public.business_users(id) on delete cascade,
  add column if not exists notification_type text null,
  add column if not exists severity text null,
  add column if not exists related_entity_type text null,
  add column if not exists related_entity_id text null,
  add column if not exists action_url text null,
  add column if not exists event_key text null,
  add column if not exists read_at timestamptz null;

update public.notifications as notification
set recipient_id = business_user.id
from public.business_users as business_user
where notification.recipient_id is null
  and notification.user_id = business_user.auth_user_id;

update public.notifications
set notification_type = case type
  when 'shift' then 'shift_assigned'
  when 'swap' then 'swap_request'
  when 'report' then 'report_submitted'
  when 'dashboard' then 'system'
  else 'system'
end
where notification_type is null;

update public.notifications
set severity = 'info'
where severity is null;

update public.notifications
set read_at = created_at
where read = true and read_at is null;

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_read_at_idx
  on public.notifications (recipient_id, read_at);
create unique index if not exists notifications_event_key_uidx
  on public.notifications (event_key)
  where event_key is not null;

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

drop policy if exists "Users can view their notifications" on public.notifications;
drop policy if exists "Users can update their notifications" on public.notifications;

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (
  (select private.current_business_user_is_active())
  and (
    recipient_id = (select private.current_business_user_id())
    or user_id = (select auth.uid())
  )
);

create or replace function private.insert_notification(
  p_recipient_id text,
  p_type text,
  p_legacy_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_related_entity_type text,
  p_related_entity_id text,
  p_action_url text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null or not exists (
    select 1
    from public.business_users as business_user
    where business_user.id = p_recipient_id
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
  ) then
    return;
  end if;

  insert into public.notifications (
    user_id, recipient_id, type, notification_type, severity, title, message,
    related_entity_type, related_entity_id, action_url, event_key, read, read_at
  ) values (
    null,
    p_recipient_id,
    p_legacy_type,
    p_type,
    p_severity,
    p_title,
    p_message,
    p_related_entity_type,
    p_related_entity_id,
    case when p_action_url like '/%' and p_action_url not like '//%' then p_action_url else null end,
    p_event_key,
    false,
    null
  )
  on conflict (event_key) where event_key is not null do nothing;
end;
$$;

revoke all on function private.insert_notification(text, text, text, text, text, text, text, text, text, text)
from public, anon, authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.notifications as notification
    where notification.id = p_notification_id
      and (
        notification.recipient_id = (select private.current_business_user_id())
        or notification.user_id = (select auth.uid())
      )
  ) then
    raise exception using errcode = '42501', message = 'NOTIFICATION_NOT_OWNED';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, statement_timestamp()), read = true
  where id = p_notification_id
    and (
      recipient_id = (select private.current_business_user_id())
      or user_id = (select auth.uid())
    );
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, statement_timestamp()), read = true
  where (
    recipient_id = (select private.current_business_user_id())
    or user_id = (select auth.uid())
  )
  and read_at is null;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function private.notification_reviewer_ids(p_shift_id text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  with direct_reviewers as (
    select business_user.id
    from public.business_users as business_user
    join public.shifts as shift on shift.id = p_shift_id
    where business_user.id in (shift.host_id, shift.support_id, shift.technical_id)
      and business_user.system_permission in ('leader', 'admin')
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
  )
  select id from direct_reviewers;
$$;

revoke all on function private.notification_reviewer_ids(text) from public, anon, authenticated;

create or replace function private.emit_shift_registration_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  reviewer_id text;
  transition text;
  notification_type text;
  title text;
  message text;
  event_prefix text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if tg_op = 'INSERT' and new.status = 'pending' then
    for reviewer_id in select private.notification_reviewer_ids(new.shift_id)
    loop
      perform private.insert_notification(
        reviewer_id, 'registration_submitted', 'shift', 'info',
        'Registration pending', 'A staff member submitted a shift registration for review.',
        'shift', new.shift_id, '/calendar',
        'registration_submitted:' || new.id || ':' || reviewer_id
      );
    end loop;
  elsif tg_op = 'INSERT' and new.status = 'manually_assigned' then
    perform private.insert_notification(
      new.user_id, 'shift_assigned', 'shift', 'info',
      'Shift assigned', 'You were assigned to a shift.',
      'shift', new.shift_id, '/calendar',
      'shift_assigned:' || new.id || ':' || new.user_id
    );
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    transition := case when new.status = 'approved' then 'staffing_approval' else 'staffing_rejection' end;
    notification_type := case when new.status = 'approved' then 'staffing_approval' else 'staffing_rejection' end;
    title := case when new.status = 'approved' then 'Registration approved' else 'Registration rejected' end;
    message := case when new.status = 'approved' then 'Your shift registration was approved.' else coalesce(new.review_notes, 'Your shift registration was rejected.') end;
    perform private.insert_notification(
      new.user_id, notification_type, 'shift', case when new.status = 'approved' then 'success' else 'warning' end,
      title, message, 'shift', new.shift_id, '/calendar',
      transition || ':' || new.id || ':' || new.user_id
    );
  end if;
  return new;
end;
$$;

revoke all on function private.emit_shift_registration_notification() from public, anon, authenticated;
drop trigger if exists shift_registrations_notification_events on public.shift_registrations;
create trigger shift_registrations_notification_events
after insert or update of status on public.shift_registrations
for each row execute function private.emit_shift_registration_notification();

create or replace function private.emit_swap_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  participant_id text;
  recipient_id text;
  event_type text;
  title text;
  message text;
  related_id text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  related_id := new.id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    participant_id := coalesce(new.counterpart_id, new.replacement_staff_id);
    if participant_id is not null then
      perform private.insert_notification(
        participant_id, 'swap_request', 'swap', 'info',
        'Swap request', 'A swap request needs your response.',
        'swap_request', related_id, '/swaps',
        'swap_request:' || related_id || ':' || participant_id
      );
    end if;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    event_type := case
      when new.status = 'accepted' then 'swap_accepted'
      when new.status = 'rejected' then 'swap_rejected'
      when new.status in ('approved', 'completed') then 'swap_approved'
      else null
    end;
    if event_type is null then return new; end if;
    title := case event_type
      when 'swap_accepted' then 'Swap accepted'
      when 'swap_rejected' then 'Swap rejected'
      else 'Swap approved'
    end;
    message := case event_type
      when 'swap_accepted' then 'The selected participant accepted the swap request.'
      when 'swap_rejected' then 'The swap request was rejected.'
      else 'Your swap request was completed.'
    end;
    for recipient_id in
      select distinct id from unnest(array_remove(array[new.requester_id, new.counterpart_id, new.replacement_staff_id], null)) as ids(id)
    loop
      perform private.insert_notification(
        recipient_id, event_type, 'swap', case when event_type = 'swap_rejected' then 'warning' else 'success' end,
        title, message, 'swap_request', related_id, '/swaps',
        event_type || ':' || related_id || ':' || recipient_id || ':' || new.status
      );
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.emit_swap_notification() from public, anon, authenticated;
drop trigger if exists swap_requests_notification_events on public.swap_requests;
create trigger swap_requests_notification_events
after insert or update of status on public.swap_requests
for each row execute function private.emit_swap_notification();

create or replace function private.emit_report_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  recipient_id text;
  event_type text;
  title text;
  message text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if (tg_op = 'INSERT' and new.status = 'in_review')
    or (tg_op = 'UPDATE' and old.status in ('draft', 'reopened') and new.status = 'in_review') then
    for recipient_id in select private.notification_reviewer_ids(new.shift_id)
    loop
      perform private.insert_notification(
        recipient_id, 'report_submitted', 'report', 'info',
        'Report submitted', 'A report is ready for review.',
        'report', new.id, '/reports',
        'report_submitted:' || new.id || ':' || recipient_id
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'in_review' and new.status in ('confirmed', 'reopened') then
    event_type := case when new.status = 'confirmed' then 'report_reviewed' else 'report_reviewed' end;
    title := case when new.status = 'confirmed' then 'Report approved' else 'Report needs updates' end;
    message := case when new.status = 'confirmed' then 'Your report was approved.' else coalesce(new.review_notes, 'Your report needs updates.') end;
    perform private.insert_notification(
      new.submitted_by, event_type, 'report', case when new.status = 'confirmed' then 'success' else 'warning' end,
      title, message, 'report', new.id, '/reports',
      event_type || ':' || new.id || ':' || coalesce(new.submitted_by, '') || ':' || new.status
    );
  end if;
  return new;
end;
$$;

revoke all on function private.emit_report_notification() from public, anon, authenticated;
drop trigger if exists reports_notification_events on public.reports;
create trigger reports_notification_events
after insert or update of status on public.reports
for each row execute function private.emit_report_notification();

create or replace function private.emit_import_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  event_type text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if (tg_op = 'INSERT' and new.status in ('confirmed', 'failed'))
    or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('confirmed', 'failed')) then
    event_type := case when new.status = 'confirmed' then 'import_completed' else 'import_failure' end;
    perform private.insert_notification(
      new.created_by, event_type, 'system', case when new.status = 'confirmed' then 'success' else 'error' end,
      case when new.status = 'confirmed' then 'Import completed' else 'Import failed' end,
      case when new.status = 'confirmed' then 'Your schedule import completed.' else 'Your schedule import failed.' end,
      'schedule_import', new.id, '/calendar',
      event_type || ':' || new.id || ':' || new.created_by
    );
  end if;
  return new;
end;
$$;

revoke all on function private.emit_import_notification() from public, anon, authenticated;
drop trigger if exists schedule_import_batches_notification_events on public.schedule_import_batches;
create trigger schedule_import_batches_notification_events
after insert or update of status on public.schedule_import_batches
for each row execute function private.emit_import_notification();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

comment on column public.notifications.recipient_id is 'Canonical business_users recipient. Legacy user_id remains unchanged for compatibility.';
comment on column public.notifications.notification_type is 'Canonical application notification type. Legacy type remains unchanged for compatibility.';
comment on column public.notifications.read_at is 'Canonical persistent read timestamp. Legacy read remains for compatibility.';
comment on column public.notifications.event_key is 'Deterministic business-transition recipient deduplication key.';
