do $rc16$
declare
  v_segment text;
  v_period text;
  v_rate text;
  v_line text;
  v_duplicate_period text;
  v_empty_period text;
begin
  if (select count(*) from information_schema.tables
     where table_schema='public' and table_name in (
       'workforce_actual_segments','workforce_rate_cards',
       'workforce_payroll_periods','workforce_payroll_lines',
       'workforce_payroll_audit')) <> 5 then
    raise exception 'RC16 tables missing';
  end if;
  if exists(select 1 from pg_class
    where oid in ('public.workforce_actual_segments'::regclass,
      'public.workforce_rate_cards'::regclass,
      'public.workforce_payroll_periods'::regclass,
      'public.workforce_payroll_lines'::regclass,
      'public.workforce_payroll_audit'::regclass)
    and not relrowsecurity) then raise exception 'RC16 RLS missing'; end if;
  if has_table_privilege('anon','public.workforce_payroll_lines','SELECT')
    or has_table_privilege('authenticated','public.workforce_payroll_lines','SELECT')
    or has_table_privilege('authenticated','public.workforce_rate_cards','INSERT') then
    raise exception 'RC16 direct browser SQL privilege leak'; end if;
  insert into public.workforce_actual_segments(
    shift_id,staff_id,operational_role,event_kind,actual_start_at,actual_end_at,
    evidence_note,created_by
  ) values ('shift-1','staff-1','host','worked',
    '2026-09-30T21:30:00+07','2026-09-30T23:00:00+07',
    'Approved shift evidence','admin-1') returning id into v_segment;
  begin
    update public.workforce_actual_segments set review_status='approved',
      reviewed_by='finance-1',review_note='Independent evidence review',reviewed_at=now(),version=2 where id=v_segment;
  exception when others then
    raise exception 'RC16 approval update unexpectedly rejected: %',sqlerrm;
  end;
  begin
    update public.workforce_actual_segments set evidence_note='tamper',version=3 where id=v_segment;
    raise exception 'approved attendance tamper was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE' then raise; end if;
  end;
  insert into public.workforce_rate_cards(staff_id,operational_role,effective_from,
    vnd_per_hour,overtime_multiplier_basis_points,approved_by,approved_at,approval_note)
  values ('staff-1','host','2026-09-01',100000,15000,'finance-1',now(),
    'Signed rate approval') returning id into v_rate;
  insert into public.workforce_payroll_periods(period_start,period_end,created_by)
  values ('2026-09-01','2026-09-30','admin-1') returning id into v_period;
  insert into public.workforce_payroll_lines(period_id,segment_id,rate_card_id,
    staff_id,operational_role,actual_minutes,payable_minutes,overtime_minutes,
    rate_vnd_per_hour,overtime_multiplier_basis_points,gross_vnd)
  values(v_period,v_segment,v_rate,'staff-1','host',90,90,30,100000,15000,175000)
  returning id into v_line;
  begin
    update public.workforce_payroll_lines set gross_vnd=999999 where id=v_line;
    raise exception 'incorrect gross total was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_PAYROLL_GROSS_MISMATCH' then raise; end if;
  end;
  perform public.workforce_rc16_transition_payroll(
    v_period,'draft','reviewed','finance-1','Verified attendance review');
  perform public.workforce_rc16_transition_payroll(
    v_period,'reviewed','confirmed','admin-1','Approved payable minutes');
  perform public.workforce_rc16_transition_payroll(
    v_period,'confirmed','payroll_ready','finance-1','Reconciled payroll period');
  perform public.workforce_rc16_transition_payroll(
    v_period,'payroll_ready','locked','admin-1','Final finance approval');
  if (select count(*) from public.workforce_payroll_audit
      where period_id=v_period) <> 4 then
    raise exception 'RC16 audited transitions missing';
  end if;
  begin
    update public.workforce_payroll_periods set status='draft' where id=v_period;
    raise exception 'locked period was reopened';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_PERIOD_LOCKED' then raise; end if;
  end;
  begin
    update public.workforce_payroll_lines set adjustment_vnd=1000,
      adjustment_reason='Test adjustment' where id=v_line;
    raise exception 'locked period line was modified';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT'
      and sqlerrm <> 'WORKFORCE_PAYROLL_ORIGINAL_PERIOD_LOCKED' then raise; end if;
  end;

  -- Regression: overlapping payroll periods must not pay the
  -- same verified segment twice, even after the first is Locked.
  insert into public.workforce_payroll_periods(period_start,period_end,created_by)
    values ('2026-09-15','2026-09-30','admin-1')
    returning id into v_duplicate_period;
  begin
    insert into public.workforce_payroll_lines(
      period_id,segment_id,rate_card_id,staff_id,operational_role,
      actual_minutes,payable_minutes,overtime_minutes,rate_vnd_per_hour,
      overtime_multiplier_basis_points,gross_vnd
    ) values (
      v_duplicate_period,v_segment,v_rate,'staff-1','host',
      90,90,30,100000,15000,175000
    );
    raise exception 'cross-period double-pay line was accepted';
  exception when unique_violation then
    null; -- workforce_payroll_one_period_per_segment must reject it
  end;

  -- Regression: an empty Draft cannot enter an irreversible
  -- Reviewed/Confirmed state that prevents adding pay lines.
  insert into public.workforce_payroll_periods(period_start,period_end,created_by)
    values ('2026-10-01','2026-10-31','admin-1')
    returning id into v_empty_period;
  begin
    perform public.workforce_rc16_transition_payroll(
      v_empty_period,'draft','reviewed','finance-1',
      'Independent empty period review');
    raise exception 'empty payroll review was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_PAYROLL_EMPTY_PERIOD' then raise; end if;
  end;
  if (select status from public.workforce_payroll_periods
      where id=v_empty_period) <> 'draft' then
    raise exception 'empty payroll period was not left in Draft';
  end if;
end $rc16$;
-- Ensure an uncompleted Shift cannot become approved actual work,
-- even when a caller bypasses the Next.js API.
insert into public.shifts(id,date,status)
  values ('shift-future','2026-11-20','scheduled');
do $unfinished$
declare v_id text;
begin
  insert into public.workforce_actual_segments(
    shift_id,staff_id,operational_role,event_kind,
    actual_start_at,actual_end_at,evidence_note,created_by
  ) values (
    'shift-future','staff-1','host','worked',
    '2026-11-20T09:00:00+07','2026-11-20T11:00:00+07',
    'Future shift evidence not verified','admin-1'
  ) returning id into v_id;
  begin
    update public.workforce_actual_segments set review_status='approved',
      reviewed_by='finance-1',review_note='Incorrect early approval',
      reviewed_at=now(),version=2 where id=v_id;
    raise exception 'unfinished shift was approved';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_SHIFT_NOT_COMPLETED' then raise; end if;
  end;
  update public.workforce_actual_segments
    set review_status='rejected',reviewed_by='finance-1',
      review_note='Rejected unsupported evidence',reviewed_at=now(),version=2
    where id=v_id;
  begin
    delete from public.workforce_actual_segments where id=v_id;
    raise exception 'rejected evidence deletion was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE' then raise; end if;
  end;
end $unfinished$;
