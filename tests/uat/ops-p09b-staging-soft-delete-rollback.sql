-- P0.9b existing Staging only; simulated SQL auth claim, NOT signed JWT.
-- Creates one synthetic report and ROLLBACKs all effects.
begin;
set local statement_timeout='30s';
select set_config('p09b.member_sub',(select auth_user_id::text from public.business_users
 where system_permission='member' and status='active' and account_status='active'
 and auth_user_id is not null order by id limit 1),true);
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.business_users
 where system_permission='admin' and status='active' and account_status='active'
 and auth_user_id is not null order by id limit 1),true);
do $seed$
declare rid text;
begin
 if (select count(*) from public.reports)<>9
 or md5(pg_get_functiondef('public.soft_delete_report(text,text)'::regprocedure)) <> '3ac3a225d294b9906e33a4db5dc727fb'
 then raise exception 'P09B_BASELINE_CHANGED';end if;
 insert into public.reports(shift_id,status,submitted_by,metrics_confirmed)
 values((select id from public.shifts s where not exists
 (select 1 from public.reports r where r.shift_id=s.id) order by id limit 1),'draft',null,false)
 returning id into rid;
 perform set_config('p09b.report_id',rid,true);
end;$seed$;
select set_config('request.jwt.claim.sub',current_setting('p09b.member_sub'),true);
set local role authenticated;
do $deny$
begin
 if private.current_system_permission()<>'member' then raise exception 'P09B_MEMBER_REQUIRED';end if;
 begin
  perform public.soft_delete_report(current_setting('p09b.report_id'),'rollback synthetic UAT');
  raise exception 'P09B_NULL_SUBMITTER_BYPASS';
 exception when insufficient_privilege then null;end;
end;$deny$;
reset role;
update public.reports set submitted_by=private.current_business_user_id()
 where id=current_setting('p09b.report_id');
set local role authenticated;
do $allow$
declare r public.reports;
begin
 r:=public.soft_delete_report(current_setting('p09b.report_id'),'rollback synthetic UAT');
 if r.deleted_at is null or r.status<>'archived'
 then raise exception 'P09B_OWNED_REPORT_ARCHIVE_FAILED';end if;
end;$allow$;
reset role;
select 'PASS: missing owner denied, valid owner allowed, ROLLBACK-only' as verdict;
rollback;
