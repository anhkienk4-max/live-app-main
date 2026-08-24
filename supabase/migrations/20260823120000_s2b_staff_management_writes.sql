-- S2B Staff Management writes and Permission Matrix v2.
-- System permission and operational roles remain independent. Mutations are
-- RPC-only and derive the actor from auth.uid().

create or replace function private.require_staff_admin()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text;
begin
  v_actor_id := private.current_business_user_id();
  if v_actor_id is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'STAFF_ADMIN_REQUIRED';
  end if;
  return v_actor_id;
end;
$$;

revoke all on function private.require_staff_admin() from public, anon, authenticated;

create or replace function public.create_staff_member(p_data jsonb)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_permission text;
  v_roles text[];
  v_status text;
  v_account_status text;
  v_result public.business_users;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'STAFF_PAYLOAD_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_data) as supplied(key)
    where supplied.key not in (
      'email', 'full_name', 'avatar_url', 'avatar_storage_path', 'phone',
      'system_permission', 'operational_roles', 'department', 'status',
      'account_status', 'email_verified', 'auth_provider', 'join_date'
    )
  ) then
    raise exception using errcode = '22023', message = 'STAFF_FIELD_NOT_ALLOWED';
  end if;
  if nullif(btrim(p_data ->> 'email'), '') is null
    or nullif(btrim(p_data ->> 'full_name'), '') is null
  then
    raise exception using errcode = '22023', message = 'STAFF_REQUIRED_FIELDS_MISSING';
  end if;

  v_permission := coalesce(nullif(btrim(p_data ->> 'system_permission'), ''), 'member');
  if v_permission not in ('admin', 'leader', 'member') then
    raise exception using errcode = '22023', message = 'STAFF_SYSTEM_PERMISSION_INVALID';
  end if;

  if p_data ? 'operational_roles' and jsonb_typeof(p_data -> 'operational_roles') <> 'array' then
    raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
  end if;
  select coalesce(array_agg(role_value order by ordinal), '{}'::text[])
    into v_roles
    from jsonb_array_elements_text(coalesce(p_data -> 'operational_roles', '[]'::jsonb))
      with ordinality as roles(role_value, ordinal);
  if not (v_roles <@ array['host', 'support', 'technical']::text[]) then
    raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
  end if;

  v_status := coalesce(nullif(btrim(p_data ->> 'status'), ''), 'active');
  if v_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'STAFF_STATUS_INVALID';
  end if;
  v_account_status := coalesce(nullif(btrim(p_data ->> 'account_status'), ''), 'active');
  if v_account_status not in ('pending_email_verification', 'pending_approval', 'rejected', 'active') then
    raise exception using errcode = '22023', message = 'STAFF_ACCOUNT_STATUS_INVALID';
  end if;

  insert into public.business_users (
    id, email, full_name, avatar_url, avatar_storage_path, phone, role,
    system_permission, operational_roles, department, status, account_status,
    email_verified, auth_provider, join_date
  ) values (
    gen_random_uuid()::text,
    lower(btrim(p_data ->> 'email')),
    btrim(p_data ->> 'full_name'),
    nullif(btrim(p_data ->> 'avatar_url'), ''),
    nullif(btrim(p_data ->> 'avatar_storage_path'), ''),
    nullif(btrim(p_data ->> 'phone'), ''),
    case when v_permission = 'member' then 'staff' else v_permission end,
    v_permission,
    v_roles,
    nullif(btrim(p_data ->> 'department'), ''),
    v_status,
    v_account_status,
    coalesce((p_data ->> 'email_verified')::boolean, false),
    nullif(btrim(p_data ->> 'auth_provider'), ''),
    coalesce((p_data ->> 'join_date')::date, current_date)
  ) returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.update_staff_member(p_user_id text, p_data jsonb)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.current_business_user_id();
  v_is_admin boolean := private.is_admin();
  v_target public.business_users;
  v_permission text;
  v_roles text[];
  v_status text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'STAFF_ACTIVE_USER_REQUIRED';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'STAFF_PAYLOAD_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_data) as supplied(key)
    where supplied.key not in (
      'email', 'full_name', 'avatar_url', 'avatar_storage_path', 'phone',
      'system_permission', 'operational_roles', 'department', 'status'
    )
  ) then
    raise exception using errcode = '22023', message = 'STAFF_FIELD_NOT_ALLOWED';
  end if;
  if p_user_id = v_actor_id then
    if exists (
      select 1 from jsonb_object_keys(p_data) as supplied(key)
      where supplied.key not in (
        'full_name', 'avatar_url', 'avatar_storage_path', 'phone', 'department'
      )
    ) then
      raise exception using errcode = '42501', message = 'STAFF_SELF_PRIVILEGE_ESCALATION_DENIED';
    end if;
  elsif not v_is_admin then
    raise exception using errcode = '42501', message = 'STAFF_ADMIN_REQUIRED';
  end if;

  select * into v_target
  from public.business_users
  where id = p_user_id and deleted_at is null and archived_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_NOT_FOUND';
  end if;

  v_permission := coalesce(p_data ->> 'system_permission', v_target.system_permission);
  if v_permission not in ('admin', 'leader', 'member') then
    raise exception using errcode = '22023', message = 'STAFF_SYSTEM_PERMISSION_INVALID';
  end if;
  if p_data ? 'operational_roles' then
    if jsonb_typeof(p_data -> 'operational_roles') <> 'array' then
      raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
    end if;
    select coalesce(array_agg(role_value order by ordinal), '{}'::text[])
      into v_roles
      from jsonb_array_elements_text(p_data -> 'operational_roles')
        with ordinality as roles(role_value, ordinal);
    if not (v_roles <@ array['host', 'support', 'technical']::text[]) then
      raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
    end if;
  else
    v_roles := v_target.operational_roles;
  end if;
  v_status := coalesce(p_data ->> 'status', v_target.status);
  if v_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'STAFF_STATUS_INVALID';
  end if;

  update public.business_users
  set email = case when p_data ? 'email' then lower(btrim(p_data ->> 'email')) else email end,
      full_name = case when p_data ? 'full_name' then btrim(p_data ->> 'full_name') else full_name end,
      avatar_url = case when p_data ? 'avatar_url' then nullif(btrim(p_data ->> 'avatar_url'), '') else avatar_url end,
      avatar_storage_path = case when p_data ? 'avatar_storage_path' then nullif(btrim(p_data ->> 'avatar_storage_path'), '') else avatar_storage_path end,
      phone = case when p_data ? 'phone' then nullif(btrim(p_data ->> 'phone'), '') else phone end,
      system_permission = v_permission,
      role = case when v_permission = 'member' then 'staff' else v_permission end,
      operational_roles = v_roles,
      department = case when p_data ? 'department' then nullif(btrim(p_data ->> 'department'), '') else department end,
      status = v_status
  where id = p_user_id
  returning * into v_target;

  return v_target;
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
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_APPROVAL_DENIED';
  end if;
  update public.business_users
  set status = 'active', account_status = 'active', email_verified = true
  where id = p_user_id and account_status = 'pending_approval'
    and archived_at is null and deleted_at is null
  returning * into v_result;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_PENDING_ACCOUNT_NOT_FOUND';
  end if;
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
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_REJECTION_DENIED';
  end if;
  update public.business_users
  set status = 'inactive', account_status = 'rejected', email_verified = true
  where id = p_user_id and account_status = 'pending_approval'
    and archived_at is null and deleted_at is null
  returning * into v_result;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_PENDING_ACCOUNT_NOT_FOUND';
  end if;
  return v_result;
end;
$$;

create or replace function public.archive_staff_member(p_user_id text, p_reason text)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_result public.business_users;
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_ARCHIVE_DENIED';
  end if;
  update public.business_users
  set status = 'inactive', archived_at = statement_timestamp(), archived_by = v_actor_id,
      deletion_reason = coalesce(nullif(btrim(p_reason), ''), 'Archived by administrator')
  where id = p_user_id and archived_at is null and deleted_at is null
  returning * into v_result;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_NOT_FOUND_OR_ARCHIVED';
  end if;
  return v_result;
end;
$$;

create or replace function public.restore_staff_member(p_user_id text, p_reason text)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_result public.business_users;
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_RESTORE_DENIED';
  end if;
  update public.business_users
  set status = 'active', archived_at = null, archived_by = null,
      deleted_at = null, deleted_by = null, deletion_reason = null
  where id = p_user_id and (archived_at is not null or deleted_at is not null)
  returning * into v_result;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_ARCHIVED_RECORD_NOT_FOUND';
  end if;
  return v_result;
end;
$$;

revoke insert, update, delete on table public.business_users from authenticated;

revoke all on function public.create_staff_member(jsonb) from public, anon, authenticated;
revoke all on function public.update_staff_member(text, jsonb) from public, anon, authenticated;
revoke all on function public.approve_staff_account(text) from public, anon, authenticated;
revoke all on function public.reject_staff_account(text) from public, anon, authenticated;
revoke all on function public.archive_staff_member(text, text) from public, anon, authenticated;
revoke all on function public.restore_staff_member(text, text) from public, anon, authenticated;

grant execute on function public.create_staff_member(jsonb) to authenticated;
grant execute on function public.update_staff_member(text, jsonb) to authenticated;
grant execute on function public.approve_staff_account(text) to authenticated;
grant execute on function public.reject_staff_account(text) to authenticated;
grant execute on function public.archive_staff_member(text, text) to authenticated;
grant execute on function public.restore_staff_member(text, text) to authenticated;

comment on function public.create_staff_member(jsonb) is
  'Admin-only staff creation. Does not create or modify an auth.users identity.';
comment on function public.update_staff_member(text, jsonb) is
  'Admin-only staff update. auth_user_id and account approval state are immutable here.';
