-- C5.15: second-precision payroll applies prospectively to shifts dated
-- 2026-11-10 or later. Existing payroll snapshots are not backfilled.
alter table public.workforce_payroll_lines
  add column if not exists actual_seconds integer,
  add column if not exists payable_seconds integer,
  add column if not exists overtime_seconds integer;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname='workforce_payroll_actual_seconds_range'
    and conrelid='public.workforce_payroll_lines'::regclass) then
    alter table public.workforce_payroll_lines add constraint workforce_payroll_actual_seconds_range
      check (actual_seconds is null or actual_seconds between 1 and 86400) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='workforce_payroll_payable_seconds_range'
    and conrelid='public.workforce_payroll_lines'::regclass) then
    alter table public.workforce_payroll_lines add constraint workforce_payroll_payable_seconds_range
      check (payable_seconds is null or payable_seconds between 0 and 86400) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='workforce_payroll_overtime_seconds_range'
    and conrelid='public.workforce_payroll_lines'::regclass) then
    alter table public.workforce_payroll_lines add constraint workforce_payroll_overtime_seconds_range
      check (overtime_seconds is null or overtime_seconds between 0 and 86400) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='workforce_payroll_seconds_tuple'
    and conrelid='public.workforce_payroll_lines'::regclass) then
    alter table public.workforce_payroll_lines add constraint workforce_payroll_seconds_tuple
      check ((actual_seconds is null and payable_seconds is null and overtime_seconds is null)
        or (actual_seconds is not null and payable_seconds is not null and overtime_seconds is not null
          and actual_seconds > 0 and payable_seconds <= actual_seconds and overtime_seconds <= payable_seconds)) not valid;
  end if;
end
$constraints$;

alter table public.workforce_payroll_lines validate constraint workforce_payroll_actual_seconds_range;
alter table public.workforce_payroll_lines validate constraint workforce_payroll_payable_seconds_range;
alter table public.workforce_payroll_lines validate constraint workforce_payroll_overtime_seconds_range;
alter table public.workforce_payroll_lines validate constraint workforce_payroll_seconds_tuple;

create or replace function public.workforce_rc16_line_guard()
returns trigger language plpgsql set search_path='' as $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_segment public.workforce_actual_segments%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_shift_date date;
  v_duration_seconds numeric;
  v_actual_seconds integer;
  v_computed_gross bigint;
begin
  if tg_op='DELETE' then raise exception 'WORKFORCE_PAYROLL_LINE_DELETE_BLOCKED'; end if;
  if tg_op='UPDATE' then
    perform 1 from public.workforce_payroll_periods
      where id=old.period_id and status='draft' for update;
    if not found then raise exception 'WORKFORCE_PAYROLL_ORIGINAL_PERIOD_LOCKED'; end if;
  end if;
  select * into v_period from public.workforce_payroll_periods
    where id=new.period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;
  select * into v_segment from public.workforce_actual_segments where id=new.segment_id;
  if not found or v_segment.review_status <> 'approved' or v_segment.event_kind <> 'worked'
    or v_segment.staff_id <> new.staff_id or v_segment.operational_role <> new.operational_role then
    raise exception 'WORKFORCE_PAYROLL_SEGMENT_UNVERIFIED';
  end if;
  select date into v_shift_date from public.shifts where id=v_segment.shift_id;
  if v_shift_date is null or v_shift_date < v_period.period_start
    or v_shift_date > v_period.period_end then
    raise exception 'WORKFORCE_PAYROLL_OUTSIDE_PERIOD';
  end if;
  v_duration_seconds := extract(epoch from (
    date_trunc('second',v_segment.actual_end_at)-date_trunc('second',v_segment.actual_start_at)));

  if v_shift_date >= date '2026-11-10' then
    if v_duration_seconds is null or v_duration_seconds <= 0 or v_duration_seconds > 86400
      or v_duration_seconds <> trunc(v_duration_seconds) then
      raise exception 'WORKFORCE_PAYROLL_SECOND_DURATION_INVALID';
    end if;
    v_actual_seconds := v_duration_seconds::integer;
    if tg_op='UPDATE' and old.actual_seconds is null then
      raise exception 'WORKFORCE_PAYROLL_LEGACY_SNAPSHOT_IMMUTABLE';
    end if;
    if tg_op='INSERT' then
      if new.actual_seconds is not null and new.actual_seconds <> v_actual_seconds then
        raise exception 'WORKFORCE_PAYROLL_ACTUAL_SECONDS_MISMATCH';
      end if;
      if new.payable_seconds is null then
        if new.payable_minutes <> floor(v_actual_seconds::numeric/60)::integer or new.overtime_minutes <> 0 then
          raise exception 'WORKFORCE_PAYROLL_SECONDS_REQUIRED';
        end if;
        new.payable_seconds := v_actual_seconds;
      end if;
      new.overtime_seconds := coalesce(new.overtime_seconds,0);
    else
      if new.actual_seconds is distinct from old.actual_seconds
        and new.actual_seconds <> v_actual_seconds then
        raise exception 'WORKFORCE_PAYROLL_ACTUAL_SECONDS_MISMATCH';
      end if;
      if new.payable_seconds is not distinct from old.payable_seconds
        and (new.payable_minutes is distinct from old.payable_minutes
          or new.overtime_minutes is distinct from old.overtime_minutes) then
        raise exception 'WORKFORCE_PAYROLL_SECONDS_REQUIRED';
      end if;
      if new.overtime_seconds is null then new.overtime_seconds := 0; end if;
    end if;
    new.actual_seconds := v_actual_seconds;
    if new.payable_seconds < 0 or new.payable_seconds > v_actual_seconds
      or new.overtime_seconds < 0 or new.overtime_seconds > new.payable_seconds then
      raise exception 'WORKFORCE_PAYROLL_SECONDS_INVALID';
    end if;
    -- Keep legacy columns as minute projections only. Amounts use seconds below.
    new.actual_minutes := floor(v_actual_seconds::numeric/60)::integer;
    new.payable_minutes := floor(new.payable_seconds::numeric/60)::integer;
    new.overtime_minutes := floor(new.overtime_seconds::numeric/60)::integer;
    new.calculation_version := 'rc19-seconds-v1';
    v_computed_gross := round(
      new.rate_vnd_per_hour::numeric *
        ((new.payable_seconds-new.overtime_seconds)::numeric
          + new.overtime_seconds::numeric*new.overtime_multiplier_basis_points::numeric/10000)
        / 3600
    )::bigint;
    new.gross_vnd := v_computed_gross;
  else
    if new.actual_seconds is not null or new.payable_seconds is not null or new.overtime_seconds is not null then
      raise exception 'WORKFORCE_PAYROLL_PRECISION_BEFORE_EFFECTIVE_DATE';
    end if;
    if v_duration_seconds is null or v_duration_seconds <= 0
      or mod(v_duration_seconds,60) <> 0
      or v_duration_seconds/60 <> new.actual_minutes
      or new.payable_minutes > new.actual_minutes then
      raise exception 'WORKFORCE_PAYROLL_UNVERIFIED_MINUTES';
    end if;
    v_computed_gross := round(
      new.rate_vnd_per_hour::numeric *
        ((new.payable_minutes-new.overtime_minutes)::numeric
          + new.overtime_minutes::numeric*new.overtime_multiplier_basis_points::numeric/10000)
        / 60
    )::bigint;
    if v_computed_gross <> new.gross_vnd then
      raise exception 'WORKFORCE_PAYROLL_GROSS_MISMATCH';
    end if;
  end if;

  select * into v_rate from public.workforce_rate_cards where id=new.rate_card_id;
  if not found or v_rate.operational_role <> new.operational_role
    or (v_rate.staff_id is not null and v_rate.staff_id <> new.staff_id)
    or v_shift_date < v_rate.effective_from
    or (v_rate.effective_through is not null and v_shift_date > v_rate.effective_through)
    or v_rate.vnd_per_hour <> new.rate_vnd_per_hour
    or v_rate.overtime_multiplier_basis_points <> new.overtime_multiplier_basis_points then
    raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
  end if;
  return new;
end $$;
