-- P0.9: direct SECURITY DEFINER removal endpoint, reproduces regression cases on EXISTING STAGING ONLY.
-- Transaction-rollback-only. No uploads, external provider actions, or real
-- user/shift/report/image rows changed persistently.
begin;
set local statement_timeout='45s';
set local lock_timeout='3s';
select set_config('p09.member_sub',(select auth_user_id::text from public.business_users
  where system_permission='member' and status='active' and account_status='active'
    and auth_user_id is not null and deleted_at is null order by id limit 1),true);
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.business_users
  where system_permission='admin' and status='active' and account_status='active'
    and auth_user_id is not null and deleted_at is null order by id limit 1),true);

do $seed$
declare v_report text;
begin
 if (select count(*) from public.reports)<>9
  or (select count(*) from public.report_images)<>3
  or (select count(*) from public.live_report_images)<>1
  or md5(pg_get_functiondef('public.remove_report_image(text)'::regprocedure)) <> '61361b3f2ff6ed2a4f4f71e1be3f6436'
  or md5(pg_get_functiondef('public.remove_live_report_image(text)'::regprocedure)) <> '7b4c1af5cf810d1d30fac246c7315c37'
 then raise exception 'P09_IMAGE_DELETE_STAGING_SCHEMA_GUARD'; end if;
 insert into public.reports(shift_id,status,submitted_by,metrics_confirmed)
 values((select s.id from public.shifts s where not exists
 (select 1 from public.reports r where r.shift_id=s.id)
 order by s.id limit 1),'draft',null,false) returning id into v_report;
 insert into public.report_images(report_id,image_type,image_url,storage_path,uploaded_by)
 values(v_report,'dashboard','https://example.invalid/p09.png','p09-rollback-only/test.png',null);
 insert into public.live_report_images(report_id,file_name,file_url,mime_type,size_bytes,category,uploaded_by)
 values(v_report,'p09-test.png','https://example.invalid/p09-live.png','image/png',1,'other',null);
 perform set_config('p09.report',v_report,true);
end;$seed$;

select set_config('request.jwt.claim.sub',current_setting('p09.member_sub'),true);
set local role authenticated;
do $deny$
begin
 if private.current_system_permission() <> 'member' then
  raise exception 'P09_ROLE_RESOLUTION_FAILED'; end if;
 begin
   perform public.remove_report_image(i.id) from public.report_images i
   where i.report_id=current_setting('p09.report');
   raise exception 'P09_DASHBOARD_NULL_UPLOADER_ACCEPTED';
 exception when insufficient_privilege then null; end;
 begin
   perform public.remove_live_report_image(i.id) from public.live_report_images i
   where i.report_id=current_setting('p09.report');
   raise exception 'P09_LIVE_NULL_UPLOADER_ACCEPTED';
 exception when insufficient_privilege then null; end;
end;$deny$;
reset role;

-- Isolate the independent missing-uploader predicate:
-- report submitted_by is the Member, but both images uploaded_by are NULL.
update public.reports set submitted_by=private.current_business_user_id()
 where id=current_setting('p09.report');
set local role authenticated;
do $uploader_missing$
begin
 begin
   perform public.remove_report_image(i.id) from public.report_images i
   where i.report_id=current_setting('p09.report');
   raise exception 'P09_DASHBOARD_NULL_UPLOADER_WITH_OWN_REPORT_ACCEPTED';
 exception when insufficient_privilege then null; end;
 begin
   perform public.remove_live_report_image(i.id) from public.live_report_images i
   where i.report_id=current_setting('p09.report');
   raise exception 'P09_LIVE_NULL_UPLOADER_WITH_OWN_REPORT_ACCEPTED';
 exception when insufficient_privilege then null; end;
end;$uploader_missing$;
reset role;

-- Isolate the independent missing-submitter predicate:
-- both uploads belong to Member; report submitted_by is NULL.
update public.reports set submitted_by=null where id=current_setting('p09.report');
update public.report_images set uploaded_by=private.current_business_user_id()
 where report_id=current_setting('p09.report');
update public.live_report_images set uploaded_by=private.current_business_user_id()
 where report_id=current_setting('p09.report');
set local role authenticated;
do $submitter_missing$
begin
 begin
   perform public.remove_report_image(i.id) from public.report_images i
   where i.report_id=current_setting('p09.report');
   raise exception 'P09_DASHBOARD_NULL_SUBMITTER_WITH_OWN_UPLOAD_ACCEPTED';
 exception when insufficient_privilege then null; end;
 begin
   perform public.remove_live_report_image(i.id) from public.live_report_images i
   where i.report_id=current_setting('p09.report');
   raise exception 'P09_LIVE_NULL_SUBMITTER_WITH_OWN_UPLOAD_ACCEPTED';
 exception when insufficient_privilege then null; end;
end;$submitter_missing$;
reset role;

-- Now make the exact same *synthetic* report/images owned by linked Member.
-- This tests legitimate ownership was not accidentally denied by the fix.
update public.reports set submitted_by=private.current_business_user_id()
 where id=current_setting('p09.report');
-- Above must be linked Member claim; inserted report exists only in transaction.
update public.report_images set uploaded_by=private.current_business_user_id()
 where report_id=current_setting('p09.report');
update public.live_report_images set uploaded_by=private.current_business_user_id()
 where report_id=current_setting('p09.report');
set local role authenticated;
do $allowed$
declare ok_dashboard boolean;ok_live boolean;
begin
 select public.remove_report_image(i.id) into ok_dashboard
 from public.report_images i where i.report_id=current_setting('p09.report');
 select public.remove_live_report_image(i.id) into ok_live
 from public.live_report_images i where i.report_id=current_setting('p09.report');
 if not coalesce(ok_dashboard,false) or not coalesce(ok_live,false)
  or exists(select 1 from public.report_images where report_id=current_setting('p09.report'))
  or exists(select 1 from public.live_report_images where report_id=current_setting('p09.report'))
 then raise exception 'P09_OWNER_WRONGLY_DENIED_OR_METADATA_NOT_DELETED'; end if;
end;$allowed$;
reset role;
select 'PASS: NULL uploader/submitted_by deny, correct Member owner allowed (rollback only)' as verdict;
rollback;
