-- ADA OPS P0.5 — SELECT-only Staging negative authorization regression.
-- Exact target: amagnzebmmuqiptmrjmc (existing Clean Staging).
-- NEVER use this script to infer real JWT acceptance: request claims are
-- simulated under PostgreSQL authenticated role, NOT signed by Supabase Auth.
-- No business IDs, names, tokens, salaries or provider metadata returned.
begin read only;
set local statement_timeout='15s';

-- A legitimate existing linked staging Member has a deliberately scoped read,
-- but zero direct access to confidential payroll data or privileged snapshot.
select set_config('request.jwt.claim.sub',(
  select auth_user_id::text from public.business_users
  where system_permission='member' and status='active'
    and account_status='active' and deleted_at is null
    and auth_user_id is not null
  order by id limit 1
),true);
set local role authenticated;
do $member$
declare visible_shifts integer;
begin
  if private.current_system_permission() is distinct from 'member'
    or not private.current_business_user_is_active()
  then raise exception 'P05_MEMBER_IDENTITY_NOT_RESOLVED'; end if;
  visible_shifts:=(public.get_shift_list_page('all',1,50,'{}'::jsonb)->>'total')::integer;
  if visible_shifts is null or visible_shifts<0 or visible_shifts>=79 then
    raise exception 'P05_MEMBER_SCOPE_UNEXPECTED'; end if;
  if has_function_privilege(current_user,'public.get_payroll_period_snapshot(text)','EXECUTE')
    or has_table_privilege(current_user,'public.workforce_payroll_periods','SELECT')
    or has_table_privilege(current_user,'public.workforce_payroll_lines','SELECT')
    or has_table_privilege(current_user,'public.workforce_rate_cards','SELECT')
  then raise exception 'P05_MEMBER_PAYROLL_PRIVILEGE_LEAK'; end if;
end
$member$;
reset role;

-- A syntactically valid but absent Auth sub must not map onto an active
-- business user. These read list RPCs must all reject with SQLSTATE 42501.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
set local role authenticated;
do $invalid$
begin
  if private.current_business_user_is_active()
    or private.current_system_permission() is not null
  then raise exception 'P05_ABSENT_IDENTITY_ACCEPTED'; end if;
  begin
    perform public.get_shift_list_page('all',1,10,'{}'::jsonb);
    raise exception 'P05_UNKNOWN_SHIFT_DISCLOSURE';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_report_list_page(1,10,'{}'::jsonb);
    raise exception 'P05_UNKNOWN_REPORT_DISCLOSURE';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_swap_list_page(1,10,'{}'::jsonb);
    raise exception 'P05_UNKNOWN_SWAP_DISCLOSURE';
  exception when insufficient_privilege then null;
  end;
end
$invalid$;
reset role;
-- Important: do not expose account metadata or role-cross-user rows.
select 'PASS: member scope/payroll denial + unknown-claim fail-closed (simulated JWT)' as verdict;
rollback;
