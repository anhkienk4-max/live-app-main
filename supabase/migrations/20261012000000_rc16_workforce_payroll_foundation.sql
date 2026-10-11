-- RC1.6 Workforce & Payroll foundation (STAGED ONLY; no Production auto-apply).
-- Prerequisites: public.shifts(id text), public.business_users(id text).
-- No seed, no historical attendance backfill, no rate defaults, no pay auto-approval.
create table if not exists public.workforce_actual_segments (
  id text primary key default gen_random_uuid()::text,
  shift_id text not null references public.shifts(id) on delete restrict,
  staff_id text not null references public.business_users(id) on delete restrict,
  operational_role text not null check (operational_role in ('host','support','technical')),
  event_kind text not null check (event_kind in ('worked','no_show')),
  coverage_kind text not null default 'planned' check (coverage_kind in ('planned','cover','replacement','extra')),
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  review_status text not null default 'draft' check (review_status in ('draft','approved','rejected')),
  evidence_note text not null check (char_length(trim(evidence_note)) between 8 and 2000),
  created_by text not null references public.business_users(id),
  reviewed_by text references public.business_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version >= 1),
  constraint actual_event_time_consistency check (
    (event_kind='no_show' and actual_start_at is null and actual_end_at is null)
    or (event_kind='worked' and actual_start_at is not null and actual_end_at is not null
      and actual_end_at > actual_start_at and actual_end_at <= actual_start_at + interval '24 hours')
  ),
  constraint reviewed_actor_consistency check (
    (review_status='draft' and reviewed_at is null and reviewed_by is null)
    or (review_status in ('approved','rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);
create index if not exists workforce_actual_by_shift on public.workforce_actual_segments(shift_id, operational_role);
create index if not exists workforce_actual_by_staff on public.workforce_actual_segments(staff_id, actual_start_at);
create unique index if not exists workforce_one_no_show_per_shift_staff_role
  on public.workforce_actual_segments(shift_id, staff_id, operational_role)
  where event_kind='no_show' and review_status <> 'rejected';

create table if not exists public.workforce_rate_cards (
  id text primary key default gen_random_uuid()::text,
  staff_id text references public.business_users(id) on delete restrict,
  operational_role text not null check (operational_role in ('host','support','technical')),
  effective_from date not null,
  effective_through date,
  vnd_per_hour integer not null check (vnd_per_hour >= 0 and vnd_per_hour <= 100000000),
  overtime_multiplier_basis_points integer not null check (
    overtime_multiplier_basis_points between 10000 and 50000
  ),
  approved_by text not null references public.business_users(id),
  approved_at timestamptz not null,
  approval_note text not null check (char_length(trim(approval_note)) between 8 and 1000),
  created_at timestamptz not null default statement_timestamp(),
  constraint workforce_rate_date_order check (effective_through is null or effective_through >= effective_from)
);
create index if not exists workforce_rates_by_scope on public.workforce_rate_cards(
  staff_id, operational_role, effective_from, effective_through
);

create table if not exists public.workforce_payroll_periods (
  id text primary key default gen_random_uuid()::text,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (
    status in ('draft','reviewed','confirmed','payroll_ready','locked')
  ),
  revision integer not null default 1 check (revision >= 1),
  created_by text not null references public.business_users(id),
  reviewed_by text references public.business_users(id),
  confirmed_by text references public.business_users(id),
  locked_by text references public.business_users(id),
  locked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint workforce_period_dates check (period_end >= period_start
    and period_end < period_start + interval '93 days'),
  constraint workforce_lock_fields check (
    (status='locked' and locked_by is not null and locked_at is not null)
    or (status <> 'locked' and locked_by is null and locked_at is null)
  ),
  constraint workforce_period_unique unique (period_start, period_end, revision)
);

create table if not exists public.workforce_payroll_lines (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references public.workforce_payroll_periods(id) on delete restrict,
  segment_id text not null references public.workforce_actual_segments(id) on delete restrict,
  rate_card_id text not null references public.workforce_rate_cards(id) on delete restrict,
  staff_id text not null references public.business_users(id) on delete restrict,
  operational_role text not null check (operational_role in ('host','support','technical')),
  actual_minutes integer not null check (actual_minutes between 0 and 1440),
  payable_minutes integer not null check (payable_minutes between 0 and 1440),
  overtime_minutes integer not null check (overtime_minutes between 0 and payable_minutes),
  rate_vnd_per_hour integer not null check (rate_vnd_per_hour >= 0),
  overtime_multiplier_basis_points integer not null check (
    overtime_multiplier_basis_points between 10000 and 50000
  ),
  gross_vnd bigint not null check (gross_vnd >= 0),
  adjustment_vnd bigint not null default 0,
  net_vnd bigint generated always as (gross_vnd + adjustment_vnd) stored,
  adjustment_reason text,
  calculation_version text not null default 'rc16-v1',
  created_at timestamptz not null default statement_timestamp(),
  constraint workforce_payroll_nonnegative check (gross_vnd + adjustment_vnd >= 0),
  constraint workforce_adjustment_reason check (
    (adjustment_vnd=0 and adjustment_reason is null)
    or (adjustment_vnd<>0 and char_length(trim(coalesce(adjustment_reason,''))) between 8 and 1000)
  ),
  constraint workforce_payroll_one_line_per_segment unique (period_id, segment_id)
);
create index if not exists workforce_payroll_lines_by_staff on public.workforce_payroll_lines(period_id,staff_id);

create table if not exists public.workforce_payroll_audit (
  id bigint generated always as identity primary key,
  period_id text not null references public.workforce_payroll_periods(id) on delete restrict,
  action text not null check (action in ('review','confirm','mark_ready','lock','reopen','adjustment')),
  from_status text,
  to_status text,
  actor_id text not null references public.business_users(id),
  reason text not null check (char_length(trim(reason)) between 8 and 2000),
  created_at timestamptz not null default statement_timestamp()
);
create index if not exists workforce_payroll_audit_by_period on public.workforce_payroll_audit(period_id,created_at);

-- A locked period is immutable even to service-role requests. Reopening requires a
-- separate guarded RPC and audit event in a later, explicitly approved release.
create or replace function public.workforce_rc16_period_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.status <> 'draft' or new.locked_by is not null or new.locked_at is not null then
      raise exception 'WORKFORCE_PERIOD_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'WORKFORCE_PERIOD_DELETE_BLOCKED';
  end if;
  if old.status='locked' then
    raise exception 'WORKFORCE_PERIOD_LOCKED';
  end if;
  if new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end
    or new.revision is distinct from old.revision then
    raise exception 'WORKFORCE_PERIOD_IDENTITY_IMMUTABLE';
  end if;
  if new.status='reviewed' and new.reviewed_by is null then
    raise exception 'WORKFORCE_REVIEW_ACTOR_REQUIRED';
  end if;
  if new.status in ('confirmed','payroll_ready','locked')
    and (new.reviewed_by is null or new.confirmed_by is null) then
    raise exception 'WORKFORCE_CONFIRM_ACTORS_REQUIRED';
  end if;
  if new.status is distinct from old.status
    and not (
      (old.status='draft' and new.status='reviewed')
      or (old.status='reviewed' and new.status='confirmed')
      or (old.status='confirmed' and new.status='payroll_ready')
      or (old.status='payroll_ready' and new.status='locked')
    ) then
    raise exception 'WORKFORCE_PAYROLL_INVALID_TRANSITION';
  end if;
  return new;
end $$;
drop trigger if exists workforce_period_guard on public.workforce_payroll_periods;
create trigger workforce_period_guard before insert or update or delete on public.workforce_payroll_periods
  for each row execute function public.workforce_rc16_period_guard();

create or replace function public.workforce_rc16_line_guard()
returns trigger language plpgsql set search_path='' as $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_segment public.workforce_actual_segments%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_shift_date date;
  v_duration_seconds numeric;
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
  v_duration_seconds := extract(epoch from (v_segment.actual_end_at-v_segment.actual_start_at));
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
drop trigger if exists workforce_line_guard on public.workforce_payroll_lines;
create trigger workforce_line_guard before insert or update on public.workforce_payroll_lines
  for each row execute function public.workforce_rc16_line_guard();

create or replace function public.workforce_rc16_immutable_approved_segment()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and old.review_status='approved' then
    raise exception 'WORKFORCE_APPROVED_SEGMENT_IMMUTABLE';
  end if;
  if tg_op='UPDATE' and old.review_status='approved' then
    raise exception 'WORKFORCE_APPROVED_SEGMENT_IMMUTABLE';
  end if;
  if tg_op='UPDATE' and new.version <> old.version + 1 then
    raise exception 'WORKFORCE_ACTUAL_STALE_VERSION';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists workforce_actual_guard on public.workforce_actual_segments;
create trigger workforce_actual_guard before update or delete on public.workforce_actual_segments
  for each row execute function public.workforce_rc16_immutable_approved_segment();

create or replace function public.workforce_rc16_immutable_payroll_audit()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'WORKFORCE_PAYROLL_AUDIT_IMMUTABLE';
end $$;
drop trigger if exists workforce_payroll_audit_immutable on public.workforce_payroll_audit;
create trigger workforce_payroll_audit_immutable before update or delete on public.workforce_payroll_audit
  for each row execute function public.workforce_rc16_immutable_payroll_audit();

-- Prevent edits to payroll lines outside Draft even during a concurrent lock.
-- Workload and operational performance remain read-only from verified segments.
alter table public.workforce_actual_segments enable row level security;
alter table public.workforce_rate_cards enable row level security;
alter table public.workforce_payroll_periods enable row level security;
alter table public.workforce_payroll_lines enable row level security;
alter table public.workforce_payroll_audit enable row level security;
revoke all on table public.workforce_actual_segments, public.workforce_rate_cards,
  public.workforce_payroll_periods, public.workforce_payroll_lines,
  public.workforce_payroll_audit from public, anon, authenticated;
grant select, insert, update, delete on table public.workforce_actual_segments,
  public.workforce_rate_cards, public.workforce_payroll_periods,
  public.workforce_payroll_lines to service_role;
grant select, insert on table public.workforce_payroll_audit to service_role;
revoke all on function public.workforce_rc16_period_guard(),
  public.workforce_rc16_line_guard(),
  public.workforce_rc16_immutable_approved_segment(),
  public.workforce_rc16_immutable_payroll_audit() from public, anon, authenticated;
