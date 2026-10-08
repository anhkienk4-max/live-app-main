-- STAGING integration regression; read-only transaction, impersonating canonical Auth actors.
begin;
do $$
begin
  if has_function_privilege('anon', 'public.get_staff_directory()', 'execute')
    or has_function_privilege('anon', 'public.get_shift_staffing_summary(text[])', 'execute')
    or has_function_privilege('anon', 'public.get_swap_exchange_candidates(text,text)', 'execute')
    or has_function_privilege('anon', 'public.get_report_revisions(text)', 'execute') then
    raise exception 'anonymous projection/revision access';
  end if;
  perform set_config('request.jwt.claim.sub', (select auth_user_id::text from public.business_users where id = '3'), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id from public.business_users where id = '3'), 'role', 'authenticated')::text, true);
end $$;
set local role authenticated;
do $$
declare report_id text; versions integer[];
begin
  if private.current_system_permission() <> 'member' then raise exception 'wrong member actor'; end if;
  if exists(select 1 from public.shift_registrations where user_id <> private.current_business_user_id() or user_id is null) then raise exception 'foreign raw registration exposure'; end if;
  if not exists(select 1 from public.shift_registrations where user_id = private.current_business_user_id()) then raise exception 'own registration unavailable'; end if;
  if exists(select 1 from public.business_users where id <> private.current_business_user_id()) then raise exception 'foreign contact/auth/account exposure'; end if;
  if not exists(select 1 from public.business_users where id = private.current_business_user_id()) then raise exception 'own profile unavailable'; end if;
  if not exists(select 1 from public.get_staff_directory() where id <> private.current_business_user_id()) then raise exception 'safe directory unavailable'; end if;
  if not exists(select 1 from public.get_shift_staffing_summary(array(select id from public.shifts)) where approved > 0) then raise exception 'approved staffing aggregate unavailable'; end if;
  select id into report_id from public.reports where archived_at is null and deleted_at is null order by id limit 1;
  if report_id is null then raise exception 'report fixture unavailable'; end if;
  select array_agg(r.version) into versions from public.get_report_revisions(report_id) as r;
  if versions is null then raise exception 'revision fixture unavailable'; end if;
  if versions <> (select array_agg(v order by v) from unnest(versions) as v) then raise exception 'revision order incorrect'; end if;
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claim.sub', (select auth_user_id::text from public.business_users where id = '2'), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id from public.business_users where id = '2'), 'role', 'authenticated')::text, true);
end $$;
set local role authenticated;
do $$ begin
  if private.current_system_permission() <> 'leader' then raise exception 'wrong leader actor'; end if;
  if not exists(select 1 from public.shift_registrations where user_id <> private.current_business_user_id() and review_notes is not null) then raise exception 'authorized review context unavailable'; end if;
  if (select count(*) from public.business_users) < 2 then raise exception 'leader staff context unavailable'; end if;
  perform 1 from public.get_report_revisions((select id from public.reports where archived_at is null and deleted_at is null order by id limit 1));
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claim.sub', (select auth_user_id::text from public.business_users where id = '1'), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id from public.business_users where id = '1'), 'role', 'authenticated')::text, true);
end $$;
set local role authenticated;
do $$ begin
  if private.current_system_permission() <> 'admin' then raise exception 'wrong admin actor'; end if;
  if (select count(*) from public.business_users) < 2 then raise exception 'admin staff unavailable'; end if;
  perform 1 from public.get_report_revisions((select id from public.reports where archived_at is null and deleted_at is null order by id limit 1));
end $$;
reset role;
rollback;
select 'PASS: Member negative access, own access, safe aggregates/directory, privileged review, revision RPC/order, anonymous grants' as result;
