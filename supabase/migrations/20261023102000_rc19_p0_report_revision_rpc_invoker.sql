-- RC19 Security #84 follow-up: defense-in-depth on revision history API.
-- The previous SEC-DEF revision RPC was callable by authenticated actors.
-- Existing reports and report_revisions SELECT RLS now enforce exact per-report
-- ownership/approved staffing using private.can_read_report(report_id).
-- Invoker rights apply those table RLS policies to the returned history rows.
-- Preserve the RPC signature, body, errors, grant model and data unchanged.
-- Safe to re-run against the exact schema; do NOT blindly db-push migrations.
begin;
alter function public.get_report_revisions(text) security invoker;
revoke all on function public.get_report_revisions(text) from public, anon, authenticated, service_role;
grant execute on function public.get_report_revisions(text) to authenticated;
commit;
