-- Disposable PostgreSQL-only contract. Does not represent full Supabase Auth/RLS.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema private;
create table public.business_users (
  id text primary key, system_permission text not null,
  status text not null default 'active',
  account_status text not null default 'active',
  archived_at timestamptz, deleted_at timestamptz
);
create table public.shifts (
  id text primary key, host_id text, support_id text, technical_id text
);
create table public.reports (
  id text primary key, shift_id text not null references public.shifts(id),
  status text not null, version_number integer not null default 0,
  submitted_by text, review_notes text
);
create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id text, notification_type text, severity text, title text,
  message text, related_entity_type text, related_entity_id text,
  action_url text, event_key text, read boolean default false
);
create unique index notifications_event_key_uidx
  on public.notifications(event_key) where event_key is not null;

create function private.current_business_user_id()
returns text language sql stable set search_path = ''
as $$ select nullif(current_setting('app.actor',true),''); $$;

create function private.notification_reviewer_ids(p_shift_id text)
returns setof text language sql stable set search_path = ''
as $$
  select u.id
  from public.business_users u
  join public.shifts s on s.id = p_shift_id
  where u.id in (s.host_id,s.support_id,s.technical_id)
    and u.system_permission in ('leader','admin')
    and u.status='active' and u.account_status='active'
    and u.archived_at is null and u.deleted_at is null;
$$;

-- Minimal direct dependency of emit_report_notification, matching the
-- persistent event-key ON CONFLICT contract of the real notification migration.
create function private.insert_notification(
  p_recipient_id text, p_type text, p_legacy_type text, p_severity text,
  p_title text, p_message text, p_related_entity_type text,
  p_related_entity_id text, p_action_url text, p_event_key text
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_recipient_id is null or not exists(
    select 1 from public.business_users u where u.id=p_recipient_id
    and u.status='active' and u.account_status='active'
    and u.archived_at is null and u.deleted_at is null
  ) then return; end if;
  insert into public.notifications(
    recipient_id,notification_type,severity,title,message,related_entity_type,
    related_entity_id,action_url,event_key,read
  ) values(
    p_recipient_id,p_type,p_severity,p_title,p_message,p_related_entity_type,
    p_related_entity_id,p_action_url,p_event_key,false
  )
  on conflict(event_key) where event_key is not null do nothing;
end;
$$;

insert into public.business_users(id,system_permission,status,account_status) values
('submitter','member','active','active'),
('reviewer','leader','active','active'),
('disabled-reviewer','admin','active','inactive');
insert into public.shifts(id,host_id,support_id,technical_id)
values ('shift-a','submitter','reviewer','disabled-reviewer');
