create function pg_temp.l_ok(value boolean,label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'RC16L_FAIL: %',label; end if; raise notice 'RC16L_PASS: %',label; end $$;
create function pg_temp.l_denied(statement text,expected text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then if position(expected in sqlerrm)=0 then raise exception 'unexpected error %, expected %',sqlerrm,expected; end if; raise notice 'RC16L_PASS: %',expected; return; end;
  raise exception 'Expected denial: %',expected;
end $$;
insert into public.business_users(id,system_permission) values('member-l','member'),('leader-l','leader'),('staff-l','member');
insert into public.workforce_actual_segments(id,shift_id,staff_id,operational_role,event_kind,coverage_kind,actual_start_at,actual_end_at,evidence_note,created_by)
values('l-root','shift-1','staff-1','host','worked','planned','2026-10-14 23:30+07','2026-10-15 02:00+07','Original overnight evidence','admin-1'),
('l-support','shift-1','staff-l','support','worked','planned','2026-10-15 00:15+07','2026-10-15 03:00+07','Independent support hours','admin-1');
update public.workforce_actual_segments set review_status='approved',version=2,reviewed_by='finance-1',reviewed_at=now(),review_note='Independent reviewer confirmed' where id in ('l-root','l-support');
select pg_temp.l_ok((select count(*)=2 from public.workforce_actual_active_segments where review_status='approved'),'independent roles and overnight segments');
select pg_temp.l_denied($s$update public.workforce_actual_segments set evidence_note='Overwrite confirmed evidence' where id='l-root'$s$,'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE');
select pg_temp.l_denied($s$select public.workforce_rc16l_amend_actual('l-root',1,'16000000-0000-4000-8000-000000000001','admin-1','{}','Wrong version correction')$s$,'WORKFORCE_ACTUAL_STALE_OR_LOCKED');
select pg_temp.l_denied($s$select public.workforce_rc16l_amend_actual('l-root',2,'16000000-0000-4000-8000-000000000001','member-l','{}','Member correction denied')$s$,'WORKFORCE_ACTOR_DENIED');
select public.workforce_rc16l_amend_actual('l-root',2,'16000000-0000-4000-8000-000000000001','leader-l',
  '{"staff_id":"staff-1","operational_role":"host","event_kind":"worked","coverage_kind":"extra","actual_start_at":"2026-10-14T23:45:00+07:00","actual_end_at":"2026-10-15T02:30:00+07:00","evidence_note":"Arrived late and worked overtime"}', 'Verified late start and overtime');
select pg_temp.l_ok(public.workforce_rc16l_amend_actual('l-root',2,'16000000-0000-4000-8000-000000000001','leader-l',
  '{"staff_id":"staff-1","operational_role":"host","event_kind":"worked","coverage_kind":"extra","actual_start_at":"2026-10-14T23:45:00+07:00","actual_end_at":"2026-10-15T02:30:00+07:00","evidence_note":"Arrived late and worked overtime"}', 'Verified late start and overtime')->>'replayed'='true','same UUID replays one amendment');
select pg_temp.l_ok((select count(*)=1 from public.workforce_actual_audit where action='amend'),'retry adds no audit');
select pg_temp.l_ok((select count(*)=1 from public.workforce_actual_active_segments where id='l-root'),'pending amendment preserves authoritative original');
select pg_temp.l_denied($s$select public.workforce_rc16l_amend_actual('l-root',2,'16000000-0000-4000-8000-000000000001','leader-l','{}','Changed retry payload')$s$,'WORKFORCE_AMENDMENT_IDEMPOTENCY_CONFLICT');
select pg_temp.l_denied($s$update public.workforce_actual_segments set review_status='approved',version=2,reviewed_by='leader-l',reviewed_at=now(),review_note='Cannot self approve amendment' where supersedes_segment_id='l-root'$s$,'reviewed_actor_consistency');
select pg_temp.l_denied($s$update public.workforce_actual_segments set review_status='approved',version=2,reviewed_by='admin-1',reviewed_at=now(),review_note='Original actor is not independent' where supersedes_segment_id='l-root'$s$,'WORKFORCE_SELF_REVIEW_BLOCKED');
update public.workforce_actual_segments set review_status='approved',version=2,reviewed_by='finance-1',reviewed_at=now(),review_note='Independent amendment review' where supersedes_segment_id='l-root';
select pg_temp.l_ok((select count(*)=0 from public.workforce_actual_active_segments where id='l-root'),'approved amendment supersedes without overwrite');
select pg_temp.l_ok((select actual_start_at='2026-10-14 23:30+07'::timestamptz and version=2 and evidence_note='Original overnight evidence' from public.workforce_actual_segments where id='l-root'),'original remains unchanged');
select pg_temp.l_ok((select before_values->>'evidence_note'='Original overnight evidence' and after_values->>'evidence_note'='Arrived late and worked overtime' from public.workforce_actual_audit where action='amend'),'audit retains before after and actor');
select pg_temp.l_denied($s$select public.workforce_rc16l_amend_actual('l-root',2,'16000000-0000-4000-8000-000000000002','leader-l','{}','Second correction of stale source')$s$,'WORKFORCE_ACTUAL_STALE_OR_LOCKED');
select pg_temp.l_denied($s$update public.workforce_actual_audit set action='record'$s$,'WORKFORCE_PAYROLL_AUDIT_IMMUTABLE');
select pg_temp.l_ok(not has_table_privilege('authenticated','public.workforce_actual_segments','SELECT'),'Member cannot directly read evidence');
select pg_temp.l_ok(not has_table_privilege('service_role','public.workforce_actual_audit','UPDATE,DELETE,TRUNCATE'),'audit service role cannot overwrite or truncate');
select pg_temp.l_ok(not has_function_privilege('authenticated','public.workforce_rc16l_amend_actual(text,integer,uuid,text,jsonb,text)','EXECUTE'),'amendment RPC is service only');
select pg_temp.l_ok((select date='2026-09-30' from public.shifts where id='shift-1'),'planned schedule unchanged');
insert into public.workforce_rate_cards(id,staff_id,operational_role,effective_from,vnd_per_hour,overtime_multiplier_basis_points,approved_by,approved_at,approval_note)
  values('l-rate','staff-l','support','2026-09-01',60000,15000,'finance-1',now(),'Verified synthetic test rate');
insert into public.workforce_payroll_periods(id,period_start,period_end,created_by) values('l-period','2026-09-01','2026-09-30','admin-1');
insert into public.workforce_payroll_lines(id,period_id,segment_id,rate_card_id,staff_id,operational_role,actual_minutes,payable_minutes,overtime_minutes,rate_vnd_per_hour,overtime_multiplier_basis_points,gross_vnd)
  values('l-line','l-period','l-support','l-rate','staff-l','support',165,165,0,60000,15000,165000);
select pg_temp.l_denied($s$select public.workforce_rc16l_amend_actual('l-support',2,'16000000-0000-4000-8000-000000000003','leader-l',
  '{"staff_id":"staff-l","operational_role":"support","event_kind":"worked","coverage_kind":"planned","actual_start_at":"2026-10-15T00:30:00+07:00","actual_end_at":"2026-10-15T03:00:00+07:00","evidence_note":"Adjustment of reserved segment"}', 'Reserved payroll evidence must be protected')$s$,'WORKFORCE_SEGMENT_RESERVED_BY_PAYROLL');
select pg_temp.l_ok((select count(*)=0 from public.workforce_actual_segments where supersedes_segment_id='l-support'),'failed amendment leaves no candidate');
select pg_temp.l_ok((select count(*)=0 from public.workforce_actual_audit where action='amend' and before_values->>'id'='l-support'),'failed amendment leaves no audit');
