-- P1B security hardening only.
-- The managed event trigger invokes this function internally; API roles do not
-- need permission to call the SECURITY DEFINER function directly.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    raise notice 'public.rls_auto_enable() is not present; no function ACL to harden';
    return;
  end if;

  execute
    'revoke execute on function public.rls_auto_enable() '
    'from public, anon, authenticated, service_role';

  if has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')
    or has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute')
    or has_function_privilege('service_role', 'public.rls_auto_enable()', 'execute')
  then
    raise exception 'public.rls_auto_enable() still has an executable API-role ACL';
  end if;
end;
$$;
