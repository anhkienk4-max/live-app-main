-- Core V1 account lifecycle: atomically link a server-created Auth user to a
-- business_users row. Auth Admin API invocation remains server-only.

create or replace function public.create_staff_member_with_auth(
  p_auth_user_id uuid,
  p_data jsonb
)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_email text;
  v_permission text;
  v_roles text[];
  v_result public.business_users;
  v_auth_email text;
begin
  if p_auth_user_id is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'STAFF_PAYLOAD_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_data) as supplied(key)
    where supplied.key not in (
      'email', 'full_name', 'avatar_url', 'avatar_storage_path', 'phone',
      'system_permission', 'operational_roles', 'department', 'join_date'
    )
  ) then
    raise exception using errcode = '22023', message = 'STAFF_FIELD_NOT_ALLOWED';
  end if;

  v_email := lower(btrim(p_data ->> 'email'));
  if v_email is null or v_email = '' or nullif(btrim(p_data ->> 'full_name'), '') is null then
    raise exception using errcode = '22023', message = 'STAFF_REQUIRED_FIELDS_MISSING';
  end if;

  select lower(btrim(email)) into v_auth_email from auth.users where id = p_auth_user_id;
  if v_auth_email is null or v_auth_email <> v_email then
    raise exception using errcode = '22023', message = 'STAFF_AUTH_EMAIL_MISMATCH';
  end if;
  if exists (select 1 from public.business_users where auth_user_id = p_auth_user_id)
    or exists (select 1 from public.business_users where lower(email) = v_email) then
    raise exception using errcode = '23505', message = 'STAFF_ACCOUNT_ALREADY_LINKED';
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

  insert into public.business_users (
    id, auth_user_id, email, full_name, avatar_url, avatar_storage_path, phone,
    role, system_permission, operational_roles, department, status, account_status,
    email_verified, auth_provider, join_date
  ) values (
    gen_random_uuid()::text, p_auth_user_id, v_email, btrim(p_data ->> 'full_name'),
    nullif(btrim(p_data ->> 'avatar_url'), ''), nullif(btrim(p_data ->> 'avatar_storage_path'), ''),
    nullif(btrim(p_data ->> 'phone'), ''), case when v_permission = 'member' then 'staff' else v_permission end,
    v_permission, v_roles, nullif(btrim(p_data ->> 'department'), ''), 'inactive', 'pending_approval',
    false, 'email', coalesce((p_data ->> 'join_date')::date, current_date)
  ) returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.create_staff_member_with_auth(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_staff_member_with_auth(uuid, jsonb) to authenticated;

comment on function public.create_staff_member_with_auth(uuid, jsonb) is
  'Admin-only Core V1 account creation. Links an existing Auth identity without accepting client actor identity.';

create or replace function public.sync_staff_auth_metadata(p_user_id text)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.current_business_user_id();
  v_target public.business_users;
  v_existing jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'STAFF_ACTIVE_USER_REQUIRED';
  end if;
  if p_user_id <> v_actor_id and not private.is_admin() then
    raise exception using errcode = '42501', message = 'STAFF_ADMIN_REQUIRED';
  end if;
  select * into v_target from public.business_users
  where id = p_user_id and deleted_at is null and archived_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_NOT_FOUND';
  end if;
  if v_target.auth_user_id is not null then
    select coalesce(raw_app_meta_data, '{}'::jsonb) into v_existing
    from auth.users where id = v_target.auth_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'STAFF_AUTH_IDENTITY_NOT_FOUND';
    end if;
    update auth.users
    set raw_app_meta_data = v_existing
      || jsonb_build_object('system_permission', v_target.system_permission, 'business_user_id', v_target.id)
    where id = v_target.auth_user_id;
  end if;
  return v_target;
end;
$$;

revoke all on function public.sync_staff_auth_metadata(text) from public, anon, authenticated;
grant execute on function public.sync_staff_auth_metadata(text) to authenticated;
