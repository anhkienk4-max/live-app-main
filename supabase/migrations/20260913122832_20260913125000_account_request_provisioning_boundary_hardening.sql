-- Restore the server-only provisioning boundary after a later identity repair
-- accidentally re-granted browser-role execution on an internal transition.

revoke all on function public.begin_account_request_provisioning(uuid, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_account_request_provisioning(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.ensure_account_request_identity(uuid, integer, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_account_request_provisioning(uuid, integer, text)
  from public, anon, authenticated, service_role;

revoke all on function public.server_begin_account_request_provisioning(uuid, integer, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.server_complete_account_request_provisioning(uuid, integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.server_ensure_account_request_identity(uuid, integer, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.server_fail_account_request_provisioning(uuid, integer, text, uuid)
  from public, anon, authenticated;

grant execute on function public.server_begin_account_request_provisioning(uuid, integer, boolean, uuid)
  to service_role;
grant execute on function public.server_complete_account_request_provisioning(uuid, integer, text, uuid)
  to service_role;
grant execute on function public.server_ensure_account_request_identity(uuid, integer, uuid, text, uuid)
  to service_role;
grant execute on function public.server_fail_account_request_provisioning(uuid, integer, text, uuid)
  to service_role;
