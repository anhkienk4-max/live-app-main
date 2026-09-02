-- V1.1 Account Request Phase 1: persistence and safe submission only.
-- This migration intentionally does not create Auth users, Staff records,
-- notifications, permissions, or provisioning side effects.

create table public.account_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  phone text null,
  department text null,
  status text not null default 'pending',
  provisioning_status text not null default 'not_started',
  staff_id text null references public.business_users(id) on delete set null,
  auth_user_id uuid null references auth.users(id) on delete set null,
  submitted_at timestamptz not null default statement_timestamp(),
  reviewed_at timestamptz null,
  reviewed_by text null references public.business_users(id) on delete set null,
  rejection_reason text null,
  provisioning_error_code text null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint account_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint account_requests_provisioning_status_check
    check (provisioning_status in ('not_started', 'in_progress', 'invited', 'linked', 'failed')),
  constraint account_requests_email_not_blank
    check (btrim(email) <> ''),
  constraint account_requests_full_name_not_blank
    check (btrim(full_name) <> '')
);

create unique index account_requests_pending_email_uidx
  on public.account_requests (lower(btrim(email)))
  where status = 'pending';

create index account_requests_status_submitted_at_idx
  on public.account_requests (status, submitted_at desc);

create index account_requests_normalized_email_idx
  on public.account_requests (lower(btrim(email)));

create trigger account_requests_set_updated_at
before update on public.account_requests
for each row execute function private.set_updated_at();

alter table public.account_requests enable row level security;
revoke all on table public.account_requests from public, anon, authenticated;

create or replace function public.submit_account_request(
  p_email text,
  p_full_name text,
  p_phone text default null,
  p_department text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_department text := nullif(btrim(coalesce(p_department, '')), '');
  v_conflict text;
begin
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or char_length(v_email) > 320 then
    raise exception 'Invalid account request.' using errcode = '22023';
  end if;

  if v_full_name = '' or char_length(v_full_name) > 200 then
    raise exception 'Invalid account request.' using errcode = '22023';
  end if;

  if v_phone is not null and char_length(v_phone) > 80 then
    raise exception 'Invalid account request.' using errcode = '22023';
  end if;

  if v_department is not null and char_length(v_department) > 160 then
    raise exception 'Invalid account request.' using errcode = '22023';
  end if;

  select case
    when exists (
      select 1
      from public.business_users as business_user
      where lower(btrim(business_user.email)) = v_email
        and business_user.auth_user_id is not null
        and business_user.status = 'active'
        and business_user.account_status = 'active'
        and business_user.archived_at is null
        and business_user.deleted_at is null
    ) then 'active_linked_account'
    when exists (
      select 1
      from public.business_users as business_user
      where lower(btrim(business_user.email)) = v_email
    ) then 'existing_staff'
    when exists (
      select 1
      from auth.users as auth_user
      where lower(btrim(coalesce(auth_user.email, ''))) = v_email
    ) then 'existing_auth'
    else 'new'
  end into v_conflict;

  -- A pending duplicate and an already active linked account both receive
  -- the same neutral acknowledgement. No existing row is changed.
  if v_conflict = 'active_linked_account'
    or exists (
      select 1
      from public.account_requests as request_row
      where lower(btrim(request_row.email)) = v_email
        and request_row.status = 'pending'
    ) then
    return jsonb_build_object(
      'ok', true,
      'message', 'If your request is eligible, it has been recorded for review.'
    );
  end if;

  -- Existing Staff-only and Auth-only identities are deliberately recorded
  -- without identifiers. They must be resolved by a later Admin workflow.
  insert into public.account_requests (
    email, full_name, phone, department
  ) values (
    v_email, v_full_name, v_phone, v_department
  ) on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'message', 'If your request is eligible, it has been recorded for review.'
  );
end;
$$;

revoke all on function public.submit_account_request(text, text, text, text) from public;
revoke all on function public.submit_account_request(text, text, text, text) from anon, authenticated;
grant execute on function public.submit_account_request(text, text, text, text) to anon, authenticated;

create or replace function public.list_account_requests(
  p_status text default 'pending'
)
returns setof public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := coalesce(nullif(btrim(p_status), ''), 'pending');
begin
  perform private.require_staff_admin();

  if v_status not in ('pending', 'approved', 'rejected', 'cancelled', 'all') then
    raise exception 'Invalid account request status.' using errcode = '22023';
  end if;

  if v_status = 'all' then
    return query
      select request_row.*
      from public.account_requests as request_row
      order by request_row.submitted_at desc, request_row.id desc;
  end if;

  return query
    select request_row.*
    from public.account_requests as request_row
    where request_row.status = v_status
    order by request_row.submitted_at desc, request_row.id desc;
end;
$$;

create or replace function public.get_account_request(
  p_request_id uuid
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.account_requests;
begin
  perform private.require_staff_admin();
  select request_row.* into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id;
  return v_request;
end;
$$;

revoke all on function public.list_account_requests(text) from public, anon, authenticated;
revoke all on function public.get_account_request(uuid) from public, anon, authenticated;
grant execute on function public.list_account_requests(text) to authenticated;
grant execute on function public.get_account_request(uuid) to authenticated;

comment on table public.account_requests is
  'Unauthenticated access requests. Phase 1 persists pending requests only; approval and provisioning are separate workflows.';
comment on function public.submit_account_request(text, text, text, text) is
  'Public neutral-acknowledgement boundary. Never creates Auth, Staff, permissions, notifications, or links.';
comment on function public.list_account_requests(text) is
  'Admin-only read boundary for Account Request review; no approval mutation.';
comment on function public.get_account_request(uuid) is
  'Admin-only Account Request detail read boundary; no approval mutation.';
