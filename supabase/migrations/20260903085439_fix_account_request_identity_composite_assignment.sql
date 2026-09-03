-- Forward-only repair for safe assignment of the business_users composite
-- returned by create_staff_member_with_auth during account-request provisioning.

create or replace function public.ensure_account_request_identity(
  p_request_id uuid,
  p_expected_version integer,
  p_auth_user_id uuid,
  p_staff_id text default null
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_request public.account_requests;
  v_staff public.business_users;
  v_auth_email text;
  v_auth_metadata jsonb;
  v_email text;
  v_staff_count integer;
  v_auth_provider text;
begin
  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_APPROVED';
  end if;
  if v_request.provisioning_status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_NOT_IN_PROGRESS';
  end if;
  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  if p_auth_user_id is null then
    raise exception using errcode = '22023', message = 'ACCOUNT_AUTH_USER_NOT_FOUND';
  end if;

  v_email := lower(btrim(v_request.email));
  select lower(btrim(email)), coalesce(raw_app_meta_data, '{}'::jsonb)
    into v_auth_email, v_auth_metadata
  from auth.users
  where id = p_auth_user_id;
  if not found or v_auth_email is null or v_auth_email = '' then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_AUTH_USER_NOT_FOUND';
  end if;
  if v_auth_email <> v_email then
    raise exception using errcode = '22023', message = 'ACCOUNT_AUTH_EMAIL_MISMATCH';
  end if;
  if nullif(btrim(v_auth_metadata ->> 'business_user_id'), '') is not null then
    if p_staff_id is not null and v_auth_metadata ->> 'business_user_id' <> p_staff_id then
      raise exception using errcode = '23505', message = 'ACCOUNT_AUTH_USER_ALREADY_LINKED';
    end if;
    if p_staff_id is null and not exists (
      select 1
      from public.business_users as metadata_staff
      where metadata_staff.id = v_auth_metadata ->> 'business_user_id'
        and lower(btrim(metadata_staff.email)) = v_email
    ) then
      raise exception using errcode = '23505', message = 'ACCOUNT_AUTH_USER_ALREADY_LINKED';
    end if;
  end if;

  v_auth_provider := case when exists (
    select 1 from auth.identities
    where user_id = p_auth_user_id and provider = 'google'
  ) then 'google' else 'email' end;

  if p_staff_id is not null and btrim(p_staff_id) <> '' then
    select staff_row.*
      into v_staff
    from public.business_users as staff_row
    where staff_row.id = p_staff_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'ACCOUNT_STAFF_NOT_FOUND';
    end if;
    if lower(btrim(v_staff.email)) <> v_email then
      raise exception using errcode = '22023', message = 'ACCOUNT_AUTH_EMAIL_MISMATCH';
    end if;
    if v_staff.archived_at is not null or v_staff.deleted_at is not null then
      raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_ARCHIVED';
    end if;
    if v_staff.status <> 'active' or v_staff.account_status = 'rejected' then
      raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_INACTIVE';
    end if;
    if v_staff.auth_user_id is not null and v_staff.auth_user_id <> p_auth_user_id then
      raise exception using errcode = '23505', message = 'ACCOUNT_STAFF_ALREADY_LINKED';
    end if;
  else
    select count(*) into v_staff_count
    from public.business_users as staff_row
    where lower(btrim(staff_row.email)) = v_email;
    if v_staff_count > 1 then
      raise exception using errcode = '23505', message = 'ACCOUNT_EMAIL_AMBIGUOUS';
    end if;
    if v_staff_count = 1 then
      select staff_row.*
        into v_staff
      from public.business_users as staff_row
      where lower(btrim(staff_row.email)) = v_email
      for update;
      if v_staff.archived_at is not null or v_staff.deleted_at is not null then
        raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_ARCHIVED';
      end if;
      if v_staff.status <> 'active' or v_staff.account_status = 'rejected' then
        raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_INACTIVE';
      end if;
      if v_staff.auth_user_id is not null and v_staff.auth_user_id <> p_auth_user_id then
        raise exception using errcode = '23505', message = 'ACCOUNT_STAFF_ALREADY_LINKED';
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.business_users
    where auth_user_id = p_auth_user_id
      and (v_staff.id is null or id <> v_staff.id)
  ) then
    raise exception using errcode = '23505', message = 'ACCOUNT_AUTH_USER_ALREADY_LINKED';
  end if;

  if v_staff.id is null then
    select created_staff.*
      into v_staff
    from public.create_staff_member_with_auth(
      p_auth_user_id,
      jsonb_build_object(
        'email', v_email,
        'full_name', btrim(v_request.full_name),
        'phone', nullif(btrim(v_request.phone), ''),
        'department', nullif(btrim(v_request.department), '')
      )
    ) as created_staff;
    if v_staff.id is null or not exists (
      select 1
      from public.business_users as created_user
      where created_user.id = v_staff.id
        and created_user.auth_user_id = p_auth_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_FAILED';
    end if;
    if v_auth_provider = 'google' then
      update public.business_users
      set auth_provider = 'google'
      where id = v_staff.id
      returning * into v_staff;
    end if;
  elsif v_staff.auth_user_id is null then
    update public.business_users
    set auth_user_id = p_auth_user_id,
        auth_provider = v_auth_provider
    where id = v_staff.id
    returning * into v_staff;
  end if;

  update public.account_requests as request_row
  set staff_id = v_staff.id,
      auth_user_id = p_auth_user_id,
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

revoke all on function public.ensure_account_request_identity(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_account_request_identity(uuid, integer, uuid, text) to authenticated;

comment on function public.ensure_account_request_identity(uuid, integer, uuid, text) is
  'Admin-only request-scoped Staff/Auth reconciliation. New identities default to member.';
