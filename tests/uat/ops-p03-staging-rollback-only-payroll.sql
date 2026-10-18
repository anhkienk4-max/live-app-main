-- OPS P0.3: EXISTING STAGING ONLY / fully ROLLBACK-only synthetic payroll UAT.
-- No real staff/shifts/rates are modified. Never point this at Production.
-- NOT the disposable CI fixture: exercises actual Supabase Staging schema.
-- Suppress output of any staff IDs, PII, salaries or provider credentials.
begin;
set local statement_timeout='60s';
set local lock_timeout='3s';
select pg_advisory_xact_lock(hashtextextended('ops:p03:staging:synthetic_rollback_20261018',0));
do $p03_uat$
declare
  v_nonce text := replace(gen_random_uuid()::text,'-','');
  v_admin text; v_reviewer text; v_staff text; v_shift text;
  v_brand text; v_platform text; v_seg text; v_rate text; v_period text; v_line text;
  v_result jsonb; v_retry jsonb; v_req uuid := gen_random_uuid();
begin
  -- Guard Staging fingerprint and baseline, before creating a single synthetic row.
  if to_regclass('public.operational_files') is null
     or to_regclass('public.workforce_payroll_lines') is null
     or (select count(*) from public.shifts) <> 79
     or (select count(*) from public.business_users) <> 12
     or (select count(*) from public.workforce_payroll_lines) <> 0
     or (select count(*) from public.workforce_actual_segments) <> 0
     or (select count(*) from public.workforce_rate_cards) <> 0
     or (select count(*) from public.workforce_payroll_periods) <> 0
     or (select count(*) from public.workforce_payroll_audit) <> 0
     or (select count(*) from public.operational_storage_routes where approved_at is null) <> 2
  then
     raise exception 'P0_UAT_TARGET_OR_BASELINE_CHANGED';
  end if;
  select id into v_brand from public.brands order by id limit 1;
  select id into v_platform from public.platforms order by id limit 1;
  if v_brand is null or v_platform is null then raise exception 'P0_UAT_NO_BRAND_OR_PLATFORM'; end if;

  v_admin := 'uat-admin-'||v_nonce;
  v_reviewer := 'uat-reviewer-'||v_nonce;
  v_staff := 'uat-host-'||v_nonce;
  v_shift := 'uat-shift-'||v_nonce;

  insert into public.business_users(id,email,full_name,role,system_permission,status,account_status,operational_roles)
  values
    (v_admin,'uat-admin-'||v_nonce||'@example.invalid','P0 Synthetic Admin','admin','admin','active','active','{}'::text[]),
    (v_reviewer,'uat-reviewer-'||v_nonce||'@example.invalid','P0 Synthetic Independent Reviewer','admin','admin','active','active','{}'::text[]),
    (v_staff,'uat-host-'||v_nonce||'@example.invalid','P0 Synthetic Host','staff','member','active','active',array['host']);

  insert into public.shifts
    (id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,
     brand_id,platform_id,registration_cutoff_at,status,status_mode,execution_source)
  values
    (v_shift,date '2026-09-30',time '21:30',time '23:00',
     timestamptz '2026-09-30 21:30+07',timestamptz '2026-09-30 23:00+07',
     date '2026-09-30',false,90,v_brand,v_platform,
     timestamptz '2026-09-29 21:30+07','completed','manual','internal');

  insert into public.workforce_actual_segments
    (shift_id,staff_id,operational_role,event_kind,coverage_kind,actual_start_at,
     actual_end_at,evidence_note,created_by)
  values (v_shift,v_staff,'host','worked','planned',
    timestamptz '2026-09-30 21:30+07',timestamptz '2026-09-30 23:00+07',
    'Staging synthetic verified attendance only',v_admin)
  returning id into v_seg;

  update public.workforce_actual_segments
     set review_status='approved',reviewed_by=v_reviewer,
         reviewed_at=statement_timestamp(),
         review_note='Independent UAT review without real staff',version=2
   where id=v_seg;
  if (select review_status from public.workforce_actual_segments where id=v_seg) <> 'approved' then
    raise exception 'P0_UAT_REVIEW_FAILED';
  end if;
  begin
    update public.workforce_actual_segments set evidence_note='tampered',version=3 where id=v_seg;
    raise exception 'P0_UAT_IMMUTABILITY_NOT_ENFORCED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE' then raise; end if;
  end;

  insert into public.workforce_rate_cards
    (staff_id,operational_role,effective_from,vnd_per_hour,
     overtime_multiplier_basis_points,approved_by,approved_at,approval_note)
  values(v_staff,'host',date '2026-09-01',100000,15000,v_reviewer,
    statement_timestamp(),'Synthetic authorized rate approval')
  returning id into v_rate;
  insert into public.workforce_payroll_periods(period_start,period_end,created_by)
    values(date '2026-09-01',date '2026-09-30',v_admin)
    returning id into v_period;
  insert into public.workforce_payroll_lines
    (period_id,segment_id,rate_card_id,staff_id,operational_role,actual_minutes,
     payable_minutes,overtime_minutes,rate_vnd_per_hour,overtime_multiplier_basis_points,gross_vnd)
  values(v_period,v_seg,v_rate,v_staff,'host',90,90,30,100000,15000,175000)
  returning id into v_line;
  if (select gross_vnd from public.workforce_payroll_lines where id=v_line) <> 175000
     or (select net_vnd from public.workforce_payroll_lines where id=v_line) <> 175000
  then raise exception 'P0_UAT_PAYROLL_ARITHMETIC_FAILED'; end if;
  begin
    update public.workforce_payroll_lines set gross_vnd=999999 where id=v_line;
    raise exception 'P0_UAT_BAD_GROSS_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_PAYROLL_CORRECTION_REQUIRES_RPC' then raise; end if;
  end;

  v_result := public.workforce_rc16b_correct_payroll_line(
    v_period,v_line,1,v_req,'correct_line',v_admin,
    'Approved UAT minutes correction',60,30,-1000,
    'Documented synthetic adjustment',125000);
  if v_result->'line'->>'version'<>'2'
     or v_result->'line'->>'gross_vnd'<>'125000'
     or v_result->'line'->>'net_vnd'<>'124000'
     or (select count(*) from public.workforce_payroll_audit where period_id=v_period) <> 1
  then raise exception 'P0_UAT_CORRECTION_OR_AUDIT_FAILED'; end if;

  v_retry := public.workforce_rc16b_correct_payroll_line(
    v_period,v_line,1,v_req,'correct_line',v_admin,
    'Approved UAT minutes correction',60,30,-1000,
    'Documented synthetic adjustment',125000);
  if v_retry->>'replayed'<>'true'
    or (select count(*) from public.workforce_payroll_audit where period_id=v_period) <> 1
  then raise exception 'P0_UAT_IDEMPOTENT_REPLAY_FAILED'; end if;
  begin
    perform public.workforce_rc16b_correct_payroll_line(
      v_period,v_line,1,v_req,'correct_line',v_admin,
      'Changed retry content should be rejected',60,30,-1000,
      'Documented synthetic adjustment',125000);
    raise exception 'P0_UAT_CHANGED_REPLAY_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.workforce_rc16b_correct_payroll_line(
      v_period,v_line,1,gen_random_uuid(),'correct_line',v_admin,
      'Stale version should be rejected',60,30,-1000,
      'Documented synthetic adjustment',125000);
    raise exception 'P0_UAT_STALE_VERSION_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_PAYROLL_STALE_LINE' then raise; end if;
  end;

  perform public.workforce_rc16_transition_payroll(
    v_period,'draft','reviewed',v_reviewer,'Independently reviewed UAT payroll');
  perform public.workforce_rc16_transition_payroll(
    v_period,'reviewed','confirmed',v_admin,'Approved synthetic payable minutes');
  perform public.workforce_rc16_transition_payroll(
    v_period,'confirmed','payroll_ready',v_reviewer,'Reconciled synthetic payroll');
  perform public.workforce_rc16_transition_payroll(
    v_period,'payroll_ready','locked',v_admin,'Final synthetic finance approval');

  if (select status from public.workforce_payroll_periods where id=v_period) <> 'locked'
    or (select count(*) from public.workforce_payroll_audit where period_id=v_period) <> 5
  then raise exception 'P0_UAT_PAYROLL_TRANSITION_OR_AUDIT_FAILED'; end if;
  begin
    update public.workforce_payroll_periods set status='draft' where id=v_period;
    raise exception 'P0_UAT_LOCK_BYPASSED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_PERIOD_LOCKED' then raise; end if;
  end;
  raise notice 'P0_UAT_PASS: synthetic actual/review/immutability/rate/period/gross/correction/audit/lock (ROLLBACK pending)';
end;
$p03_uat$;
set local role service_role;
do $check_snapshot$
declare v_snapshot jsonb;
begin
  select public.get_payroll_period_snapshot(id) into v_snapshot
  from public.workforce_payroll_periods where status='locked' limit 1;
  if current_user <> 'service_role' or v_snapshot is null
    or (v_snapshot->>'lineCount')::integer <> 1
    or (v_snapshot->>'auditCount')::integer <> 5
    or jsonb_array_length(v_snapshot->'lines') <> 1
    or jsonb_array_length(v_snapshot->'audit') <> 5
  then raise exception 'P0_UAT_SERVICE_SNAPSHOT_NOT_COMPLETE'; end if;
end;
$check_snapshot$;
reset role;
select 'PASS — transaction-rollback-only Staging synthetic UAT' as verdict,
 (select count(*) from public.workforce_actual_segments) as synthetic_segments,
 (select count(*) from public.workforce_rate_cards) as synthetic_rate_cards,
 (select count(*) from public.workforce_payroll_periods) as synthetic_payroll_periods,
 (select count(*) from public.workforce_payroll_lines) as synthetic_payroll_lines,
 (select count(*) from public.workforce_payroll_audit) as synthetic_payroll_audit,
 (select count(*) from public.business_users) as staging_staff_plus_synthetic,
 (select count(*) from public.shifts) as staging_shifts_plus_synthetic;
rollback;
