select public.p0_assert((select bool_and(has_table_privilege('service_role','public.'||t,'TRUNCATE'))
  from unnest(array['workforce_payroll_audit','report_revisions','audit_logs','audit_log_reviews']) t),'reproduced live TRUNCATE grants');
insert into public.workforce_payroll_audit(period_id,action,actor_id,reason) values('test-period','review','test-admin','Isolated initial audit');
savepoint reproduce_gap;
set role service_role;
truncate public.workforce_payroll_audit;
select public.p0_assert((select count(*)=0 from public.workforce_payroll_audit),'source row trigger does not protect TRUNCATE');
reset role;
rollback to savepoint reproduce_gap;

-- APPLY_HOTFIX

select public.p0_assert((select bool_and(not has_table_privilege('service_role','public.'||t,'UPDATE,DELETE,TRUNCATE'))
  from unnest(array['workforce_payroll_audit','report_revisions','audit_logs','audit_log_reviews']) t),'effective mutation privileges removed');
set role service_role;
do $$declare t text; key text; begin
  foreach t in array array['workforce_payroll_audit','report_revisions','audit_logs','audit_log_reviews'] loop
    key:=case when t='audit_log_reviews' then 'audit_id' when t='workforce_payroll_audit' then 'reason' else 'id' end;
    perform public.p0_assert_denied(format('truncate public.%I cascade',t),'42501','service TRUNCATE denied '||t);
    perform public.p0_assert_denied(format('update public.%I set %I=%I',t,key,key),'42501','service UPDATE denied '||t);
    perform public.p0_assert_denied(format('delete from public.%I',t),'42501','service DELETE denied '||t);
  end loop;
end $$;
insert into public.workforce_payroll_audit(period_id,action,actor_id,reason) values('test-period','confirm','test-admin','Isolated second audit');
select public.p0_assert((select count(*)=2 from public.workforce_payroll_audit),'service payroll audit SELECT/INSERT including identity sequence');
reset role;

-- Owner still reaches the unchanged immutable trigger independently of ACL denial.
select public.p0_assert_denied('update public.workforce_payroll_audit set reason=''Changed audit reason''','P0001','immutable trigger blocks owner UPDATE');
select public.p0_assert_denied('delete from public.workforce_payroll_audit','P0001','immutable trigger blocks owner DELETE');
select private.record_report_revision('test-report','test-admin','draft','create','Isolated initial report','{}','{}','{}','{}');
select private.record_report_revision('test-report','test-admin','draft','save','Isolated revised report','{}','{}','{}','{}');
select public.p0_assert((select count(*)=2 from public.report_revisions),'revision append workflow preserved');
select public.p0_assert((select count(*)=2 from public.audit_logs),'source audit capture trigger appends both revisions');
set role service_role;
select public.p0_assert((select count(*)=2 from public.report_revisions),'service revision read preserved');
select public.p0_assert((select count(*)=2 from public.audit_logs),'service audit read preserved');
reset role;

set role authenticated;
do $$declare actor text; t text; key text; begin
  foreach actor in array array['test-admin','test-leader','test-member'] loop
    perform set_config('p0.test_actor',actor,true);
    foreach t in array array['workforce_payroll_audit','report_revisions','audit_logs','audit_log_reviews'] loop
      key:=case when t='audit_log_reviews' then 'audit_id' when t='workforce_payroll_audit' then 'reason' else 'id' end;
      perform public.p0_assert_denied(format('truncate public.%I cascade',t),'42501',actor||' TRUNCATE denied '||t);
      perform public.p0_assert_denied(format('update public.%I set %I=%I',t,key,key),'42501',actor||' UPDATE denied '||t);
      perform public.p0_assert_denied(format('delete from public.%I',t),'42501',actor||' DELETE denied '||t);
    end loop;
    perform public.p0_assert_denied('insert into public.workforce_payroll_audit(period_id,action,actor_id,reason) values(''test-period'',''review'',''test-admin'',''Unauthorized audit append'')','42501',actor||' direct payroll audit INSERT denied');
  end loop;
end $$;
select set_config('p0.test_actor','test-admin',true);
select public.update_audit_review((select id from public.audit_logs limit 1),'Reviewed in isolated regression','reviewed','Valid review rationale');
select public.update_audit_review((select id from public.audit_logs limit 1),'Resolved in isolated regression','resolved','Valid handling rationale');
select public.p0_assert((select count(*)=1 and bool_and(review_status='resolved') from public.audit_log_reviews),'Admin source RPC INSERT and UPDATE plus read preserved');
select set_config('p0.test_actor','test-leader',true);
select public.p0_assert_denied('select public.update_audit_review((select id from public.audit_logs limit 1),null,''reviewed'',null)','42501','Leader audit review RPC denied');
select set_config('p0.test_actor','test-member',true);
select public.p0_assert_denied('select public.update_audit_review(''missing'',null,''reviewed'',null)','42501','Member audit review RPC denied');
reset role;
select public.p0_assert((select count(*)=2 from public.workforce_payroll_audit),'denied operations preserve payroll audit rows');
select public.p0_assert((select count(*)=2 from public.report_revisions),'denied operations preserve report revisions');
