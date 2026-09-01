-- V1.1 account provisioning foundation.
-- Auth Admin API calls remain in the server-only application service. This
-- function performs the authenticated, atomic business-user link and keeps
-- authorization metadata server-controlled.

create or replace function public.link_staff_auth_user(
  p_staff_id text,
  p_auth_user_id uuid,
  p_system_permission text,
  p_mode text
)
returns public.business_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.require_staff_admin();
  v_auth_email text;
  v_auth_metadata jsonb;
  v_target public.business_users;
  v_permission text;
begin
  if p_staff_id is null or btrim(p_staff_id) = ''
    or p_auth_user_id is null
    or p_mode is null
    or p_mode not in ('provision', 'link')
  then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_PAYLOAD_INVALID';
  end if;

  select lower(btrim(email)), coalesce(raw_app_meta_data, '{}'::jsonb)
    into v_auth_email, v_auth_metadata
  from auth.users
  where id = p_auth_user_id;
  if not found or v_auth_email is null or v_auth_email = '' then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_AUTH_USER_NOT_FOUND';
  end if;

  select * into v_target
  from public.business_users
  where id = p_staff_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_STAFF_NOT_FOUND';
  end if;
  if v_target.archived_at is not null or v_target.deleted_at is not null then
    raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_ARCHIVED';
  end if;
  if v_target.status <> 'active' or v_target.account_status = 'rejected' then
    raise exception using errcode = '42501', message = 'ACCOUNT_STAFF_INACTIVE';
  end if;
  if v_target.auth_user_id is not null then
    raise exception using errcode = '23505', message = 'ACCOUNT_STAFF_ALREADY_LINKED';
  end if;
  if exists (
    select 1 from public.business_users
    where auth_user_id = p_auth_user_id
      and id <> p_staff_id
  ) then
    raise exception using errcode = '23505', message = 'ACCOUNT_AUTH_USER_ALREADY_LINKED';
  end if;
  if lower(btrim(v_target.email)) <> v_auth_email then
    raise exception using errcode = '22023', message = 'ACCOUNT_AUTH_EMAIL_MISMATCH';
  end if;

  v_permission := coalesce(nullif(btrim(p_system_permission), ''), v_target.system_permission);
  if v_permission not in ('admin', 'leader', 'member') then
    raise exception using errcode = '22023', message = 'ACCOUNT_ROLE_INVALID';
  end if;

  update public.business_users
  set auth_user_id = p_auth_user_id,
      system_permission = v_permission,
      role = case when v_permission = 'member' then 'staff' else v_permission end,
      auth_provider = 'email',
      status = case when p_mode = 'provision' then 'inactive' else status end,
      account_status = case when p_mode = 'provision' then 'pending_approval' else account_status end,
      email_verified = case when p_mode = 'provision' then false else email_verified end
  where id = p_staff_id
  returning * into v_target;

  update auth.users
  set raw_app_meta_data = v_auth_metadata
    || jsonb_build_object(
      'system_permission', v_target.system_permission,
      'business_user_id', v_target.id
    )
  where id = p_auth_user_id;

  return v_target;
end;
$$;

revoke all on function public.link_staff_auth_user(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.link_staff_auth_user(text, uuid, text, text) to authenticated;

comment on function public.link_staff_auth_user(text, uuid, text, text) is
  'Admin-only existing Staff/Auth link. The provision mode creates a pending activation state; link mode preserves the Staff lifecycle state.';
