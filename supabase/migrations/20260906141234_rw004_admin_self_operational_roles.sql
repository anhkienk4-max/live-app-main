-- RW-004: Admin Self Operational Roles

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
    if not v_is_admin and exists (
      select 1 from jsonb_object_keys(p_data) as supplied(key)
      where supplied.key not in (
        'full_name', 'avatar_url', 'avatar_storage_path', 'phone', 'department'
      )
    ) then
      raise exception using errcode = '42501', message = 'STAFF_SELF_PRIVILEGE_ESCALATION_DENIED';
    elsif v_is_admin and exists (
      select 1 from jsonb_object_keys(p_data) as supplied(key)
      where supplied.key not in (
        'full_name', 'avatar_url', 'avatar_storage_path', 'phone', 'department', 'operational_roles'
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
