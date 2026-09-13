-- Account-request provisioning is complete only when its linked business user
-- can satisfy the active-user resolver. Auth confirmation remains owned by
-- Supabase Auth; email_verified reflects that state and is never fabricated.

update public.business_users as business_user
set status = 'active',
    account_status = 'active',
    email_verified = auth_user.email_confirmed_at is not null
from public.account_requests as request_row
join auth.users as auth_user on auth_user.id = request_row.auth_user_id
where request_row.status = 'approved'
  and request_row.provisioning_status in ('invited', 'linked')
  and request_row.staff_id = business_user.id
  and business_user.auth_user_id = request_row.auth_user_id
  and lower(btrim(business_user.email)) = lower(btrim(request_row.email))
  and business_user.archived_at is null
  and business_user.deleted_at is null
  and business_user.account_status <> 'rejected';

create or replace function public.complete_account_request_provisioning(
  p_request_id uuid,
  p_expected_version integer,
  p_provisioning_status text
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_request public.account_requests;
  v_email_verified boolean;
begin
  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;
  if v_request.provisioning_status in ('invited', 'linked') then
    return v_request;
  end if;
  if v_request.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_APPROVED';
  end if;
  if v_request.provisioning_status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_NOT_IN_PROGRESS';
  end if;
  if p_provisioning_status not in ('invited', 'linked') then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_STATUS_INVALID';
  end if;
  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  if v_request.staff_id is null or v_request.auth_user_id is null then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_IDENTITY_INCOMPLETE';
  end if;

  select auth_user.email_confirmed_at is not null
    into v_email_verified
  from auth.users as auth_user
  where auth_user.id = v_request.auth_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_AUTH_USER_NOT_FOUND';
  end if;

  update public.business_users as business_user
  set status = 'active',
      account_status = 'active',
      email_verified = v_email_verified
  where business_user.id = v_request.staff_id
    and business_user.auth_user_id = v_request.auth_user_id
    and lower(btrim(business_user.email)) = lower(btrim(v_request.email))
    and business_user.archived_at is null
    and business_user.deleted_at is null
    and business_user.account_status <> 'rejected';
  if not found then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_IDENTITY_CONFLICT';
  end if;

  update public.account_requests as request_row
  set provisioning_status = p_provisioning_status,
      provisioning_error_code = null,
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.status = 'approved'
    and request_row.provisioning_status = 'in_progress'
    and request_row.version = p_expected_version
  returning * into v_request;
  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  return v_request;
end;
$$;

create or replace function public.approve_staff_account(p_user_id text)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_result public.business_users;
  v_email_verified boolean;
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_APPROVAL_DENIED';
  end if;
  select * into v_result
  from public.business_users
  where id = p_user_id
    and account_status = 'pending_approval'
    and archived_at is null
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_PENDING_ACCOUNT_NOT_FOUND';
  end if;
  if v_result.auth_user_id is not null then
    select auth_user.email_confirmed_at is not null
      into v_email_verified
    from auth.users as auth_user
    where auth_user.id = v_result.auth_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'STAFF_AUTH_IDENTITY_NOT_FOUND';
    end if;
  end if;
  update public.business_users
  set status = 'active',
      account_status = 'active',
      email_verified = coalesce(v_email_verified, email_verified)
  where id = p_user_id
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.reject_staff_account(p_user_id text)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_result public.business_users;
  v_email_verified boolean;
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_REJECTION_DENIED';
  end if;
  select * into v_result
  from public.business_users
  where id = p_user_id
    and account_status = 'pending_approval'
    and archived_at is null
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_PENDING_ACCOUNT_NOT_FOUND';
  end if;
  if v_result.auth_user_id is not null then
    select auth_user.email_confirmed_at is not null
      into v_email_verified
    from auth.users as auth_user
    where auth_user.id = v_result.auth_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'STAFF_AUTH_IDENTITY_NOT_FOUND';
    end if;
  end if;
  update public.business_users
  set status = 'inactive',
      account_status = 'rejected',
      email_verified = coalesce(v_email_verified, email_verified)
  where id = p_user_id
  returning * into v_result;
  return v_result;
end;
$$;

comment on function public.complete_account_request_provisioning(uuid, integer, text) is
  'Server-only provisioning completion that activates the reconciled Staff profile and reflects Supabase Auth email confirmation.';
