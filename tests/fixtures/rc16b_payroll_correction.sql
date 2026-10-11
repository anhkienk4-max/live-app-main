-- Synthetic-only PostgreSQL fixture. Never execute on a Supabase environment.
create function pg_temp.check_ok(p_ok boolean,p_label text) returns void
language plpgsql as $$ begin
  if p_ok is distinct from true then raise exception 'FAIL: %',p_label; end if;
  raise notice 'RC16B_PASS: %',p_label;
end $$;
create function pg_temp.expect_error(p_sql text,p_error text,p_label text) returns void
language plpgsql as $$ begin
  begin
    execute p_sql;
    raise exception 'EXPECTED_REJECTION_MISSING';
  exception when others then
    if sqlerrm <> p_error then raise; end if;
  end;
  raise notice 'RC16B_PASS: %',p_label;
end $$;

insert into public.business_users(id,system_permission) values
  ('staff-b','member'),('staff-c','member'),('staff-d','member'),('staff-e','member'),
  ('leader-b','leader'),('admin-b','admin');
insert into public.business_users(id,system_permission,status) values ('admin-inactive','admin','inactive');
insert into public.shifts(id,date) values ('shift-split','2026-09-30');
insert into public.workforce_actual_segments(
  id,shift_id,staff_id,operational_role,event_kind,actual_start_at,actual_end_at,evidence_note,created_by
) values
  ('segment-b','shift-1','staff-b','host','worked','2026-09-30T23:30:00+07','2026-10-01T01:00:00+07','Verified overnight host work','admin-1'),
  ('segment-c','shift-1','staff-c','host','worked','2026-09-30T21:30:00+07','2026-09-30T23:00:00+07','Verified second host work','admin-1'),
  ('segment-d','shift-1','staff-d','support','worked','2026-09-30T21:30:00+07','2026-09-30T23:00:00+07','Verified support across host segments','admin-1');
update public.workforce_actual_segments set review_status='approved',reviewed_by='finance-1',
  review_note='Independently verified actual work',reviewed_at=now(),version=2
  where id in ('segment-b','segment-c','segment-d');
insert into public.workforce_rate_cards(
  id,staff_id,operational_role,effective_from,effective_through,vnd_per_hour,
  overtime_multiplier_basis_points,approved_by,approved_at,approval_note
) values
  ('rate-b','staff-b','host','2026-09-01','2026-09-30',100000,15000,'finance-1',now(),'Approved contractual rate'),
  ('rate-c','staff-c','host','2026-09-01','2026-09-30',100000,15000,'finance-1',now(),'Approved contractual rate'),
  ('rate-d','staff-d','support','2026-09-01','2026-09-30',100000,15000,'finance-1',now(),'Approved contractual rate'),
  ('rate-b-oct','staff-b','host','2026-10-01',null,200000,15000,'finance-1',now(),'Approved next-month contractual rate'),
  ('role-host',null,'host','2026-09-01','2026-09-30',50000,15000,'finance-1',now(),'Explicitly approved role default');
insert into public.workforce_payroll_periods(id,period_start,period_end,created_by) values
  ('period-b','2026-09-29','2026-09-30','admin-1'),
  ('period-overlap','2026-09-15','2026-10-01','admin-1'),
  ('concurrency-period','2026-09-20','2026-09-30','admin-1');
insert into public.workforce_payroll_lines(
  id,period_id,segment_id,rate_card_id,staff_id,operational_role,actual_minutes,
  payable_minutes,overtime_minutes,rate_vnd_per_hour,overtime_multiplier_basis_points,gross_vnd
) values
  ('line-b','period-b','segment-b','rate-b','staff-b','host',90,90,30,100000,15000,175000),
  ('concurrency-line','concurrency-period','segment-d','rate-d','staff-d','support',90,90,30,100000,15000,175000);

set role service_role;
do $attendance$
begin
  perform pg_temp.check_ok((select count(distinct staff_id)>=2 from public.workforce_actual_segments
    where shift_id='shift-1' and operational_role='host' and review_status='approved'),
    'multiple Hosts in one shift remain independent attendance');
  insert into public.workforce_actual_segments(id,shift_id,staff_id,operational_role,event_kind,
    coverage_kind,actual_start_at,actual_end_at,evidence_note,created_by) values
    ('replacement-e','shift-1','staff-e','host','worked','replacement',
      '2026-09-30T22:15:00+07','2026-09-30T23:00:00+07','Verified replacement host work','admin-1'),
    ('overlap-d','shift-split','staff-d','support','worked','planned',
      '2026-09-30T22:00:00+07','2026-09-30T23:00:00+07','Duplicated support across split hosts','admin-1'),
    ('no-show-d','shift-1','staff-d','support','no_show','planned',null,null,
      'No show contradicts worked evidence','admin-1');
  update public.workforce_actual_segments set review_status='approved',reviewed_by='finance-1',
    reviewed_at=now(),review_note='Replacement independently verified',version=2 where id='replacement-e';
  perform pg_temp.check_ok((select coverage_kind='replacement' from public.workforce_actual_segments
    where id='replacement-e'),'replacement preserves explicit actual segment');
  perform pg_temp.expect_error($sql$update public.workforce_actual_segments set review_status='approved',
    reviewed_by='finance-1',reviewed_at=now(),review_note='Overlapping support cannot be approved',version=2
    where id='overlap-d'$sql$,'WORKFORCE_APPROVED_STAFF_OVERLAP','split Host support overlap cannot duplicate payable time');
  perform pg_temp.expect_error($sql$update public.workforce_actual_segments set review_status='approved',
    reviewed_by='finance-1',reviewed_at=now(),review_note='No show contradicts actual work',version=2
    where id='no-show-d'$sql$,'WORKFORCE_APPROVED_NO_SHOW_CONFLICT','explicit no-show cannot contradict worked evidence');
  perform pg_temp.expect_error($sql$insert into public.workforce_payroll_lines(period_id,segment_id,rate_card_id,
    staff_id,operational_role,actual_minutes,payable_minutes,overtime_minutes,rate_vnd_per_hour,
    overtime_multiplier_basis_points,gross_vnd) values
    ('period-overlap','segment-c','role-host','staff-c','host',90,90,0,50000,15000,75000)$sql$,
    'WORKFORCE_PAYROLL_RATE_UNVERIFIED','DB enforces staff-specific rate over role default');
  perform pg_temp.expect_error($sql$insert into public.workforce_payroll_lines(period_id,segment_id,rate_card_id,
    staff_id,operational_role,actual_minutes,payable_minutes,overtime_minutes,rate_vnd_per_hour,
    overtime_multiplier_basis_points,gross_vnd) values
    ('period-overlap','segment-b','rate-b-oct','staff-b','host',90,90,0,200000,15000,300000)$sql$,
    'WORKFORCE_PAYROLL_RATE_UNVERIFIED','overnight work uses shift business date for rates');
end $attendance$;
do $tests$
declare
  v_result jsonb;
  v_retry jsonb;
  v_status text;
begin
  v_result := public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',1,'10000000-0000-4000-8000-000000000001','correct_line','admin-1',
    'Approved payable and OT correction',60,30,-1000,'Approved negative adjustment',125000);
  perform pg_temp.check_ok(v_result->'line'->>'gross_vnd'='125000'
    and v_result->'line'->>'net_vnd'='124000' and v_result->'line'->>'version'='2',
    'valid correction uses independently computed VND');
  perform pg_temp.check_ok(v_result->'audit'->>'actor_id'='admin-1'
    and v_result->'audit'->>'period_id'='period-b' and v_result->'audit'->>'line_id'='line-b'
    and v_result->'audit'->>'line_version'='2' and v_result->'audit'->>'action'='correct_line'
    and v_result->'audit'->>'created_at' is not null
    and v_result->'audit'->'previous_values'->>'gross_vnd'='175000'
    and v_result->'audit'->'updated_values'=v_result->'line',
    'audit captures actor timestamp reason revision and full snapshots');
  v_retry := public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',1,'10000000-0000-4000-8000-000000000001','correct_line','admin-1',
    'Approved payable and OT correction',60,30,-1000,'Approved negative adjustment',125000);
  perform pg_temp.check_ok(v_retry->>'replayed'='true' and v_retry->'audit'=v_result->'audit'
    and (select count(*) from public.workforce_payroll_audit where line_id='line-b')=1,
    'same request replays exactly one audit');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',1,'10000000-0000-4000-8000-000000000001','correct_line','admin-1',
    'Changed retry must not apply',60,30,-1000,'Approved negative adjustment',125000)$sql$,
    'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT','changed retry is rejected');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',1,gen_random_uuid(),'correct_line','admin-1',
    'Stale correction must not apply',60,30,0,null,125000)$sql$,
    'WORKFORCE_PAYROLL_STALE_LINE','stale version is rejected');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'correct_line','admin-1',
    'Invalid minutes exceed evidence',91,0,0,null,151667)$sql$,
    'WORKFORCE_PAYROLL_CORRECTION_INVALID','payable minutes above actual rejected by DB');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'correct_line','admin-1',
    'Invalid OT exceeds payable minutes',60,61,0,null,150833)$sql$,
    'WORKFORCE_PAYROLL_CORRECTION_INVALID','OT above payable rejected by DB');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'correct_line','admin-1',
    '',60,0,0,null,100000)$sql$,
    'WORKFORCE_PAYROLL_CORRECTION_INVALID','missing correction reason rejected');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'correct_line','admin-1',
    'Missing adjustment evidence',60,0,-1000,null,100000)$sql$,
    'WORKFORCE_PAYROLL_CORRECTION_INVALID','missing adjustment reason rejected');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'correct_line','admin-1',
    'Client arithmetic cannot win',60,0,0,null,999999)$sql$,
    'WORKFORCE_PAYROLL_GROSS_MISMATCH','server DB calculation mismatch rejected');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'correct_line','admin-1',
    'Negative net cannot be paid',60,0,-200000,'Approved negative adjustment',100000)$sql$,
    'WORKFORCE_PAYROLL_CORRECTION_INVALID','negative net rejected');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'void_line','leader-b','Unauthorized salary change')$sql$,
    'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN','DB rejects Leader actor');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'void_line','staff-b','Unauthorized salary change')$sql$,
    'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN','DB rejects Member actor');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,gen_random_uuid(),'void_line','admin-inactive','Inactive salary actor denied')$sql$,
    'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN','DB rejects inactive Admin actor');
  perform pg_temp.expect_error($sql$update public.workforce_payroll_lines set payable_minutes=0 where id='line-b'$sql$,
    'WORKFORCE_PAYROLL_CORRECTION_REQUIRES_RPC','direct unaudited correction rejected');
  perform pg_temp.expect_error($sql$delete from public.workforce_payroll_lines where id='line-b'$sql$,
    'WORKFORCE_PAYROLL_LINE_DELETE_BLOCKED','Draft deletion rejected');
  perform set_config('workforce.rc16b_line_call','1',true);
  perform pg_temp.expect_error($sql$update public.workforce_payroll_lines set period_id='period-overlap',version=3 where id='line-b'$sql$,
    'WORKFORCE_PAYROLL_LINE_IDENTITY_IMMUTABLE','correction cannot transfer line to another period');
  perform pg_temp.expect_error($sql$update public.workforce_payroll_lines set segment_id='segment-c',version=3 where id='line-b'$sql$,
    'WORKFORCE_PAYROLL_LINE_IDENTITY_IMMUTABLE','correction cannot release original segment reservation');
  perform pg_temp.expect_error($sql$update public.workforce_payroll_lines set version=4 where id='line-b'$sql$,
    'WORKFORCE_PAYROLL_STALE_LINE','version cannot skip a revision');
  perform pg_temp.expect_error($sql$update public.workforce_payroll_lines set voided_at=now(),payable_minutes=0,version=3 where id='line-b'$sql$,
    'WORKFORCE_PAYROLL_VOID_MUST_PRESERVE_EVIDENCE','void cannot rewrite original payable evidence');
  perform set_config('workforce.rc16b_line_call','',true);
  perform pg_temp.check_ok((select version=2 and net_vnd=124000 from public.workforce_payroll_lines where id='line-b')
    and (select count(*)=1 from public.workforce_payroll_audit where line_id='line-b'),
    'failed corrections leave neither partial line change nor audit');
  v_result := public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,'10000000-0000-4000-8000-000000000002','void_line','admin-1','Void claim with preserved evidence');
  perform pg_temp.check_ok(v_result->'line'->>'voided_at' is not null
    and v_result->'line'->>'net_vnd'='124000' and v_result->'line'->>'version'='3'
    and v_result->'audit'->'previous_values'->>'net_vnd'='124000',
    'void preserves salary evidence and records audit');
  v_retry := public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',2,'10000000-0000-4000-8000-000000000002','void_line','admin-1','Void claim with preserved evidence');
  perform pg_temp.check_ok(v_retry->>'replayed'='true' and v_retry->'audit'=v_result->'audit',
    'void retry is idempotent');
  perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',3,gen_random_uuid(),'correct_line','admin-1','Cannot revive voided claim',60,0,0,null,100000)$sql$,
    'WORKFORCE_PAYROLL_LINE_VOIDED','void is terminal');
  perform pg_temp.expect_error($sql$select public.workforce_rc16_transition_payroll(
    'period-b','draft','reviewed','finance-1','Review void-only payroll period')$sql$,
    'WORKFORCE_PAYROLL_EMPTY_PERIOD','all-void period cannot enter Review');
  begin
    insert into public.workforce_payroll_lines(period_id,segment_id,rate_card_id,staff_id,
      operational_role,actual_minutes,payable_minutes,overtime_minutes,rate_vnd_per_hour,
      overtime_multiplier_basis_points,gross_vnd)
    values('period-overlap','segment-b','rate-b','staff-b','host',90,60,30,100000,15000,125000);
    raise exception 'Voided segment was paid twice';
  exception when unique_violation then
    raise notice 'RC16B_PASS: void retains global duplicate payment protection';
  end;
  insert into public.workforce_payroll_lines(id,period_id,segment_id,rate_card_id,staff_id,
    operational_role,actual_minutes,payable_minutes,overtime_minutes,rate_vnd_per_hour,
    overtime_multiplier_basis_points,gross_vnd)
    values('active-line','period-b','segment-c','rate-c','staff-c','host',90,90,30,100000,15000,175000);
  perform public.workforce_rc16b_correct_payroll_line('period-b','active-line',1,
    gen_random_uuid(),'correct_line','finance-1','Correction by prospective reviewer',60,0,0,null,100000);
  perform pg_temp.expect_error($sql$select public.workforce_rc16_transition_payroll(
    'period-b','draft','reviewed','admin-1','Period creator cannot self review')$sql$,
    'WORKFORCE_PAYROLL_SELF_REVIEW','creator cannot review');
  perform pg_temp.expect_error($sql$select public.workforce_rc16_transition_payroll(
    'period-b','draft','reviewed','finance-1','Corrector cannot self review')$sql$,
    'WORKFORCE_PAYROLL_SELF_REVIEW','line corrector cannot review');
  perform public.workforce_rc16_transition_payroll('period-b','draft','reviewed','admin-b','Independent payroll review');
  perform pg_temp.expect_error($sql$select public.workforce_rc16_transition_payroll(
    'period-b','reviewed','confirmed','admin-b','Reviewer cannot self confirm')$sql$,
    'WORKFORCE_PAYROLL_SELF_CONFIRM','reviewer cannot confirm');
  foreach v_status in array array['reviewed','confirmed','payroll_ready','locked'] loop
    if v_status='confirmed' then
      perform public.workforce_rc16_transition_payroll('period-b','reviewed','confirmed','admin-1','Independent payroll confirmation');
    elsif v_status='payroll_ready' then
      perform public.workforce_rc16_transition_payroll('period-b','confirmed','payroll_ready','admin-1','Ready after verified approval');
    elsif v_status='locked' then
      perform public.workforce_rc16_transition_payroll('period-b','payroll_ready','locked','admin-1','Lock verified payroll');
    end if;
    perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
      'period-b','active-line',2,gen_random_uuid(),'correct_line','admin-1','Post Review correction denied',60,0,0,null,100000)$sql$,
      'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT',v_status||' correction rejected');
    perform pg_temp.expect_error($sql$select public.workforce_rc16b_correct_payroll_line(
      'period-b','active-line',2,gen_random_uuid(),'void_line','admin-1','Post Review void denied')$sql$,
      'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT',v_status||' void rejected');
  end loop;
  v_retry := public.workforce_rc16b_correct_payroll_line(
    'period-b','line-b',1,'10000000-0000-4000-8000-000000000001','correct_line','admin-1',
    'Approved payable and OT correction',60,30,-1000,'Approved negative adjustment',125000);
  perform pg_temp.check_ok(v_retry->>'replayed'='true' and v_retry->'line'->>'version'='2'
    and (select version=3 and voided_at is not null from public.workforce_payroll_lines where id='line-b'),
    'old successful retry after lock returns original snapshot without revival');
end $tests$;
reset role;

-- Superuser verification proves trigger protection even beyond normal grants.
select pg_temp.expect_error('update public.workforce_payroll_audit set reason=''tamper attempt'' where line_id=''line-b''',
  'WORKFORCE_PAYROLL_AUDIT_IMMUTABLE','audit update immutable');
select pg_temp.expect_error('delete from public.workforce_payroll_audit where line_id=''line-b''',
  'WORKFORCE_PAYROLL_AUDIT_IMMUTABLE','audit delete immutable');
select pg_temp.check_ok(not has_table_privilege('authenticated','public.workforce_payroll_audit','SELECT')
  and not has_table_privilege('anon','public.workforce_payroll_audit','SELECT')
  and not has_function_privilege('authenticated',
    'public.workforce_rc16b_correct_payroll_line(text,text,integer,uuid,text,text,text,integer,integer,bigint,text,bigint)','EXECUTE'),
  'salary audit and RPC inaccessible to authenticated browser roles');
select pg_temp.expect_error('update public.workforce_actual_segments set actual_end_at=now() where id=''segment-b''',
  'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE','finalized attendance evidence remains immutable');
select pg_temp.expect_error('update public.workforce_rate_cards set vnd_per_hour=1 where id=''rate-b''',
  'WORKFORCE_APPROVED_RATE_IMMUTABLE','finalized approved rate remains immutable');
