-- P06 existing Staging only (amagnzebmmuqiptmrjmc), never Production.
-- No signed JWT: a simulated existing active Admin auth-sub under authenticated
-- PG role. All new data is a synthetic shift inside this ROLLBACK transaction.
-- Never include real Auth identifiers, shift rows, passwords or PII in output.
begin;
set local statement_timeout='40s';
set local lock_timeout='3s';
do $guard$
begin
 if (select count(*) from public.shifts) <> 79
   or (select count(*) from public.business_users) <> 12
   or md5(pg_get_functiondef('public.create_shift(jsonb)'::regprocedure)) <> '7f813fa9c9c4b25f2ed965ffc9fe872c'
   or md5(pg_get_functiondef('public.update_shift(text,jsonb,boolean)'::regprocedure)) <> '052af1089ed967316d385007828e971c'
   or md5(pg_get_functiondef('public.update_shift(text,jsonb,boolean,integer)'::regprocedure)) <> 'ead3d98c97a4f293a521e1a6bf4aba3c'
 then raise exception 'P06_WRITER_SCHEMA_OR_STAGING_GUARD'; end if;
end;
$guard$;
select set_config('request.jwt.claim.sub',
 (select auth_user_id::text from public.business_users
 where system_permission='admin' and status='active' and account_status='active'
 and auth_user_id is not null order by id limit 1),true);
select set_config('p06.uat_brand',(select id from public.brands order by id limit 1),true);
select set_config('p06.uat_platform',(select id from public.platforms order by id limit 1),true);
set local role authenticated;
do $test$
declare s public.shifts; changed public.shifts;
begin
 if private.current_system_permission()<>'admin' then
  raise exception 'P06_ACTIVE_ADMIN_REQUIRED'; end if;
 s:=public.create_shift(jsonb_build_object(
 'date','2099-01-05','start_time','16:00','end_time','18:00',
 'brand_id',current_setting('p06.uat_brand'),
 'platform_id',current_setting('p06.uat_platform'),
 'title','P06 SYNTHETIC STAGING ROLLBACK SHIFT',
 'execution_source','internal'));
 if s.id is null or s.execution_source is distinct from 'internal'
 then raise exception 'P06_CREATE_FAILED'; end if;
 changed:=public.update_shift(s.id,'{"execution_source":"agency"}'::jsonb,false,s.version);
 if changed.execution_source is distinct from 'agency'
 then raise exception 'P06_AGENCY_PATCH_FAILED'; end if;
 s:=changed;
 changed:=public.update_shift(s.id,'{"execution_source":null}'::jsonb,false,s.version);
 if changed.execution_source is not null then raise exception 'P06_NULL_PATCH_FAILED'; end if;
 begin
  perform public.update_shift(changed.id,'{"execution_source":"outsourced"}'::jsonb,false,changed.version);
  raise exception 'P06_INVALID_SOURCE_ACCEPTED';
 exception when sqlstate '22023' then null;
 end;
 begin
  perform public.update_shift(changed.id,'{"title":"stale"}'::jsonb,false,s.version);
  raise exception 'P06_STALE_VERSION_ACCEPTED';
 exception when sqlstate 'P0001' then
  if sqlerrm not like '%STALE%' and sqlerrm not like '%VERSION%' then raise; end if;
 end;
end;
$test$;
reset role;
select 'PASS: shift create, versioned agency/NULL, invalid and stale rejection; rollback only' as verdict,
  (select count(*) from public.shifts) as in_transaction_shifts;
rollback;
