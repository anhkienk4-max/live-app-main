-- Partial synthetic database fixture; never execute on cloud. Runner supplies namespace.
do $fixture$
declare
  ns text := current_setting('rc16f.namespace');
  item jsonb;
  manifest jsonb := current_setting('rc16f.manifest')::jsonb;
  receipt jsonb;
begin
  insert into public.shifts(id,date) values(ns||'-overnight','2026-09-30');
  insert into public.workforce_payroll_periods(id,period_start,period_end,created_by)
    values(ns||'-period','2026-09-02','2026-09-30','admin-1');
  for item in select value from jsonb_array_elements(manifest->'fixtures') loop
    insert into public.business_users(id,system_permission) values(ns||'-'||(item->>'id'),'member');
    if item->>'id'='UNKNOWN' then continue; end if;
    insert into public.workforce_actual_segments(id,shift_id,staff_id,operational_role,event_kind,
      coverage_kind,actual_start_at,actual_end_at,evidence_note,created_by)
    values(ns||'-segment-'||(item->>'id'),ns||'-overnight',ns||'-'||(item->>'id'),item->>'role',
      case when item->>'id'='NOSHOW' then 'no_show' else 'worked' end,item->>'coverage',
      (item->>'start')::timestamptz,(item->>'end')::timestamptz,'Synthetic operator attendance evidence','admin-1');
    update public.workforce_actual_segments set review_status='approved',reviewed_by='finance-1',
      reviewed_at=now(),review_note='Independent synthetic evidence review',version=2
      where id=ns||'-segment-'||(item->>'id');
    if item->>'id'='NOSHOW' then continue; end if;
    insert into public.workforce_rate_cards(id,staff_id,operational_role,effective_from,effective_through,
      vnd_per_hour,overtime_multiplier_basis_points,approved_by,approved_at,approval_note)
    values(ns||'-rate-'||(item->>'id'),ns||'-'||(item->>'id'),item->>'role','2026-09-01','2026-09-30',
      100000,15000,'finance-1',now(),'Synthetic rate approval only');
    insert into public.workforce_payroll_lines(id,period_id,segment_id,rate_card_id,staff_id,operational_role,
      actual_minutes,payable_minutes,overtime_minutes,rate_vnd_per_hour,overtime_multiplier_basis_points,gross_vnd)
    values(ns||'-line-'||(item->>'id'),ns||'-period',ns||'-segment-'||(item->>'id'),ns||'-rate-'||(item->>'id'),
      ns||'-'||(item->>'id'),item->>'role',(item->>'actual_minutes')::integer,(item->>'payable_minutes')::integer,
      (item->>'ot_minutes')::integer,100000,15000,(item->>'gross_vnd')::bigint);
  end loop;
  receipt := public.workforce_rc16b_correct_payroll_line(ns||'-period',ns||'-line-H1',1,
    '30000000-0000-4000-8000-000000000001','correct_line','admin-1','Synthetic minutes correction',
    60,30,-1000,'Synthetic independently reviewed adjustment',125000);
  if (receipt->'line'->>'net_vnd')::bigint <> 124000 then raise exception 'Synthetic correction total mismatch'; end if;
  receipt := public.workforce_rc16b_correct_payroll_line(ns||'-period',ns||'-line-H1',1,
    '30000000-0000-4000-8000-000000000001','correct_line','admin-1','Synthetic minutes correction',
    60,30,-1000,'Synthetic independently reviewed adjustment',125000);
  if not (receipt->>'replayed')::boolean then raise exception 'Synthetic replay missing'; end if;
  perform public.workforce_rc16b_correct_payroll_line(ns||'-period',ns||'-line-H2',1,
    '30000000-0000-4000-8000-000000000002','void_line','admin-1','Synthetic terminal void evidence');
  perform public.workforce_rc16_transition_payroll(ns||'-period','draft','reviewed','finance-1','Independent synthetic payroll review');
  perform public.workforce_rc16_transition_payroll(ns||'-period','reviewed','confirmed','admin-1','Synthetic payroll confirmation');
  perform public.workforce_rc16_transition_payroll(ns||'-period','confirmed','payroll_ready','admin-1','Synthetic readiness approval');
  perform public.workforce_rc16_transition_payroll(ns||'-period','payroll_ready','locked','admin-1','Synthetic final lock evidence');
  if (select sum(net_vnd) from public.workforce_payroll_lines where period_id=ns||'-period' and voided_at is null) <> 540667
    or (select count(*) from public.workforce_payroll_lines where period_id=ns||'-period' and voided_at is null) <> 6
    or (select count(*) from public.workforce_payroll_audit where period_id=ns||'-period') <> 6 then
    raise exception 'Synthetic active-line/audit reconciliation failed';
  end if;
end $fixture$;
