-- MASTER-F7 Patch 2: keep Phase-3 provisioning RPCs server-only.
-- The historical functions remain the state-machine implementation. These
-- wrappers validate the real Admin actor, establish the same auth.uid()
-- context used by the audit triggers, and are executable only by service_role.

create or replace function private.require_staff_admin_for_auth_user(
  p_actor_auth_user_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id text;
begin
  if p_actor_auth_user_id is null then
    raise exception using errcode = '42501', message = 'STAFF_ADMIN_REQUIRED';
  end if;
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    p_actor_auth_user_id::text,
    true
  );
  v_actor_id := private.require_staff_admin();
  return v_actor_id;
end;
$$;

revoke all on function private.require_staff_admin_for_auth_user(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.set_provisioning_actor(
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_staff_admin_for_auth_user(p_actor_auth_user_id);
end;
$$;

revoke all on function private.set_provisioning_actor(uuid)
  from public, anon, authenticated, service_role;

-- These wrappers are the only Data API callable form of the Phase-3 state
-- machine. The actor UUID is accepted only on this service_role-only boundary;
-- the HTTP route derives it from the authenticated Admin session.
create or replace function public.server_begin_account_request_provisioning(
  p_request_id uuid,
  p_expected_version integer,
  p_retry boolean,
  p_actor_auth_user_id uuid
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.set_provisioning_actor(p_actor_auth_user_id);
  return public.begin_account_request_provisioning(
    p_request_id,
    p_expected_version,
    p_retry
  );
end;
$$;

create or replace function public.server_ensure_account_request_identity(
  p_request_id uuid,
  p_expected_version integer,
  p_auth_user_id uuid,
  p_staff_id text,
  p_actor_auth_user_id uuid
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.set_provisioning_actor(p_actor_auth_user_id);
  return public.ensure_account_request_identity(
    p_request_id,
    p_expected_version,
    p_auth_user_id,
    p_staff_id
  );
end;
$$;

create or replace function public.server_complete_account_request_provisioning(
  p_request_id uuid,
  p_expected_version integer,
  p_provisioning_status text,
  p_actor_auth_user_id uuid
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.set_provisioning_actor(p_actor_auth_user_id);
  return public.complete_account_request_provisioning(
    p_request_id,
    p_expected_version,
    p_provisioning_status
  );
end;
$$;

create or replace function public.server_fail_account_request_provisioning(
  p_request_id uuid,
  p_expected_version integer,
  p_error_code text,
  p_actor_auth_user_id uuid
)
returns public.account_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.set_provisioning_actor(p_actor_auth_user_id);
  return public.fail_account_request_provisioning(
    p_request_id,
    p_expected_version,
    p_error_code
  );
end;
$$;

-- Remove direct browser execution from both the historical functions and the
-- new wrappers. The server-only role is granted only the wrappers.
revoke all on function public.begin_account_request_provisioning(uuid, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.ensure_account_request_identity(uuid, integer, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_account_request_provisioning(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_account_request_provisioning(uuid, integer, text)
  from public, anon, authenticated, service_role;

revoke all on function public.server_begin_account_request_provisioning(uuid, integer, boolean, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.server_ensure_account_request_identity(uuid, integer, uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.server_complete_account_request_provisioning(uuid, integer, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.server_fail_account_request_provisioning(uuid, integer, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.server_begin_account_request_provisioning(uuid, integer, boolean, uuid)
  to service_role;
grant execute on function public.server_ensure_account_request_identity(uuid, integer, uuid, text, uuid)
  to service_role;
grant execute on function public.server_complete_account_request_provisioning(uuid, integer, text, uuid)
  to service_role;
grant execute on function public.server_fail_account_request_provisioning(uuid, integer, text, uuid)
  to service_role;

comment on function public.server_begin_account_request_provisioning(uuid, integer, boolean, uuid) is
  'Server-only Phase-3 provisioning claim with database-validated Admin actor.';
comment on function public.server_ensure_account_request_identity(uuid, integer, uuid, text, uuid) is
  'Server-only Phase-3 Staff/Auth reconciliation with database-validated Admin actor.';
comment on function public.server_complete_account_request_provisioning(uuid, integer, text, uuid) is
  'Server-only Phase-3 completion with database-validated Admin actor.';
comment on function public.server_fail_account_request_provisioning(uuid, integer, text, uuid) is
  'Server-only Phase-3 failure recording with database-validated Admin actor.';
