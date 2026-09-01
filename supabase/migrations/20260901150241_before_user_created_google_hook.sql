-- V1.1 staging-safe Before User Created Auth Hook.
-- Google Auth identity creation is blocked here; application access remains
-- governed by the canonical business_users.auth_user_id link.

create or replace function public.before_user_created_block_google(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_provider text;
begin
  -- A missing provider is treated as the existing non-Google flow so email
  -- provisioning and recovery are not coupled to this Google-only guard.
  if event is null or pg_catalog.jsonb_typeof(event) <> 'object' then
    return '{}'::jsonb;
  end if;

  v_provider := event->'user'->'app_metadata'->>'provider';
  if pg_catalog.lower(pg_catalog.btrim(coalesce(v_provider, ''))) = 'google' then
    return pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'http_code', 403,
        'message', 'Google account creation is not allowed. Use an approved invitation.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_block_google(jsonb)
  to supabase_auth_admin;
revoke execute on function public.before_user_created_block_google(jsonb)
  from public, anon, authenticated;

comment on function public.before_user_created_block_google(jsonb) is
  'Before User Created hook: block new Google Auth users without creating or linking application Staff records.';
