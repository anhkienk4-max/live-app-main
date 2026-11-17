-- RC19 W4 PRODUCTION CONSOLIDATED MIGRATION MANIFEST (Migrations 118-130)
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Generated at: 2026-11-17T10:51:41.579Z

BEGIN;

/*******************************************************************************
 * Migration: 20261110140000_rc19_c515_overtime_cancellation_approvals.sql
 * Version:   20261110140000
 *******************************************************************************/
-- BEGIN (nested)
create table public.workforce_overtime_requests (
  id uuid primary key default gen_random_uuid(),
  segment_id text not null unique references public.workforce_actual_segments(id) on delete restrict,
  overtime_start_at timestamptz not null,
  overtime_end_at timestamptz not null,
  overtime_seconds integer generated always as
    (extract(epoch from (overtime_end_at-overtime_start_at))::integer) stored,
  day_class text not null check (day_class in ('weekday','weekend','holiday')),
  time_class text not null check (time_class in ('day','night')),
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  evidence_receipt_id text not null check (char_length(btrim(evidence_receipt_id)) between 1 and 200),
  requested_by text not null references public.business_users(id) on delete restrict,
  leader_preapproved_by text references public.business_users(id) on delete restrict,
  admin_confirmed_by text references public.business_users(id) on delete restrict,
  rate_card_id text references public.workforce_rate_cards(id) on delete restrict,
  multiplier_basis_points integer check (multiplier_basis_points between 10000 and 50000),
  state text not null check (state in ('pending_admin_confirmation','admin_confirmed','rejected')),
  version integer not null default 1 check (version > 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (overtime_end_at > overtime_start_at),
  check ((state='admin_confirmed' and admin_confirmed_by is not null and rate_card_id is not null
      and multiplier_basis_points is not null)
    or (state<>'admin_confirmed' and admin_confirmed_by is null)),
  check (leader_preapproved_by is null or leader_preapproved_by<>admin_confirmed_by)
);
create index workforce_overtime_requests_queue_idx on public.workforce_overtime_requests(state,created_at);

create table public.workforce_overtime_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.workforce_overtime_requests(id) on delete restrict,
  actor_id text not null references public.business_users(id) on delete restrict,
  action text not null check (action in ('requested','leader_preapproved','admin_confirmed','rejected')),
  from_state text,
  to_state text not null,
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  version integer not null check (version > 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default statement_timestamp(),
  unique(request_id,version)
);

alter table public.workforce_payroll_lines
  add column overtime_request_id uuid references public.workforce_overtime_requests(id) on delete restrict,
  add column overtime_day_class text,
  add column overtime_time_class text,
  add constraint workforce_payroll_overtime_contract check (
    actual_seconds is null or overtime_seconds=0 or
    (overtime_request_id is not null and overtime_day_class in ('weekday','weekend','holiday')
      and overtime_time_class in ('day','night'))
  );

create table public.workforce_cancellation_compensation_cases (
  id uuid primary key default gen_random_uuid(),
  shift_id text not null references public.shifts(id) on delete restrict,
  staff_id text not null references public.business_users(id) on delete restrict,
  operational_role text not null check (operational_role in ('host','support','technical')),
  actual_seconds integer not null default 0 check (actual_seconds between 0 and 86400),
  actual_earnings_vnd bigint check (actual_earnings_vnd is null or actual_earnings_vnd between 0 and 1000000000000),
  actual_segment_id text references public.workforce_actual_segments(id) on delete restrict,
  registration_id text references public.shift_registrations(id) on delete restrict,
  cancellation_source text not null check (cancellation_source='brand_ada'),
  cancellation_reason text not null check (char_length(btrim(cancellation_reason)) between 8 and 2000),
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  evidence_receipt_id text not null check (char_length(btrim(evidence_receipt_id)) between 1 and 200),
  proposed_amount_vnd bigint not null check (proposed_amount_vnd between 1 and 1000000000000),
  proposed_by text not null references public.business_users(id) on delete restrict,
  leader_preapproved_by text references public.business_users(id) on delete restrict,
  admin_confirmed_by text references public.business_users(id) on delete restrict,
  period_id text not null references public.workforce_payroll_periods(id) on delete restrict,
  state text not null check (state in ('pending_admin_confirmation','admin_confirmed','rejected')),
  version integer not null default 1 check (version > 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check ((actual_segment_id is not null) <> (registration_id is not null)),
  check ((state='admin_confirmed' and admin_confirmed_by is not null)
    or (state<>'admin_confirmed' and admin_confirmed_by is null)),
  check (leader_preapproved_by is null or leader_preapproved_by<>admin_confirmed_by)
);
create index workforce_cancellation_compensation_queue_idx
  on public.workforce_cancellation_compensation_cases(state,period_id,created_at);
create unique index workforce_cancellation_compensation_assignment_active_uq
  on public.workforce_cancellation_compensation_cases((coalesce(actual_segment_id,registration_id)))
  where state in ('pending_admin_confirmation','admin_confirmed');

create table public.workforce_cancellation_compensation_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.workforce_cancellation_compensation_cases(id) on delete restrict,
  actor_id text not null references public.business_users(id) on delete restrict,
  action text not null check (action in ('proposed','leader_preapproved','admin_confirmed','rejected','edited')),
  from_state text,
  to_state text not null,
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  version integer not null check (version > 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default statement_timestamp(),
  unique(case_id,version)
);

create table public.workforce_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  period_id text not null references public.workforce_payroll_periods(id) on delete restrict,
  compensation_case_id uuid not null unique references public.workforce_cancellation_compensation_cases(id) on delete restrict,
  staff_id text not null references public.business_users(id) on delete restrict,
  operational_role text not null check (operational_role in ('host','support','technical')),
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  confirmed_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp()
);
create index workforce_payroll_adjustments_period_idx on public.workforce_payroll_adjustments(period_id,staff_id);

alter table public.workforce_overtime_requests enable row level security;
alter table public.workforce_overtime_request_events enable row level security;
alter table public.workforce_cancellation_compensation_cases enable row level security;
alter table public.workforce_cancellation_compensation_events enable row level security;
alter table public.workforce_payroll_adjustments enable row level security;
revoke all on public.workforce_overtime_requests,
  public.workforce_overtime_request_events, public.workforce_cancellation_compensation_cases,
  public.workforce_cancellation_compensation_events, public.workforce_payroll_adjustments
  from public,anon,authenticated;
grant select on public.workforce_overtime_requests,
  public.workforce_overtime_request_events,public.workforce_cancellation_compensation_cases,
  public.workforce_cancellation_compensation_events,public.workforce_payroll_adjustments to service_role;

create or replace function public.rc19_c515_request_overtime(
  p_segment_id text,p_start_at timestamptz,p_end_at timestamptz,p_day_class text,p_time_class text,
  p_reason text,p_evidence_receipt_id text,p_idempotency_key uuid
) returns public.workforce_overtime_requests
language plpgsql security definer set search_path='' as $$
declare v_actor text:=private.current_business_user_id(); v_segment public.workforce_actual_segments%rowtype;
  v_shift public.shifts%rowtype; v_request public.workforce_overtime_requests%rowtype; v_existing public.workforce_overtime_requests%rowtype;
-- BEGIN (nested)
  if v_actor is null or not private.current_business_user_is_active()
    or private.current_system_permission() not in ('leader','admin') then
    raise exception 'C515_OT_ACTOR_FORBIDDEN' using errcode='42501'; end if;
  if p_idempotency_key is null or p_start_at is null or p_end_at<=p_start_at
    or p_day_class not in ('weekday','weekend','holiday') or p_time_class not in ('day','night')
    or char_length(btrim(coalesce(p_reason,''))) not between 8 and 2000
    or char_length(btrim(coalesce(p_evidence_receipt_id,''))) not between 1 and 200 then
    raise exception 'C515_OT_REQUEST_INVALID'; end if;
  select * into v_segment from public.workforce_actual_segments where id=p_segment_id for update;
  if not found or v_segment.event_kind<>'worked' or v_segment.review_status<>'approved'
    or v_segment.actual_start_at is null or v_segment.actual_end_at is null
    or p_start_at<v_segment.actual_start_at or p_end_at>v_segment.actual_end_at then
    raise exception 'C515_OT_INTERVAL_NOT_APPROVED'; end if;
  select * into v_shift from public.shifts where id=v_segment.shift_id and deleted_at is null;
  if not found then raise exception 'C515_OT_SHIFT_NOT_FOUND'; end if;
  if private.current_system_permission()='leader' and not private.rc19_has_any_leader_brand_scope(
    v_shift.brand_id,array['staff.manage','workforce.read']) then
    raise exception 'C515_OT_BRAND_SCOPE_DENIED' using errcode='42501'; end if;
  if v_actor=v_segment.staff_id then raise exception 'C515_OT_SELF_REVIEW_BLOCKED' using errcode='42501'; end if;
  if not exists(select 1 from public.operational_files f where f.id=btrim(p_evidence_receipt_id)
    and f.shift_id=v_shift.id and f.brand_id=v_shift.brand_id and f.platform_id=v_shift.platform_id
    and f.integrity_status='sha256_verified' and f.checksum_sha256 ~ '^[a-f0-9]{64}$'
    and nullif(btrim(f.external_file_id),'') is not null and nullif(btrim(f.external_parent_id),'') is not null
    and f.deleted_at is null) then raise exception 'C515_OT_EVIDENCE_RECEIPT_UNVERIFIED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('c515_ot:'||p_idempotency_key::text,0));
  select * into v_existing from public.workforce_overtime_requests where idempotency_key=p_idempotency_key;
  if found then
    if (v_existing.segment_id,v_existing.overtime_start_at,v_existing.overtime_end_at,v_existing.day_class,
      v_existing.time_class,v_existing.reason,v_existing.evidence_receipt_id)
      is distinct from (p_segment_id,p_start_at,p_end_at,p_day_class,p_time_class,btrim(p_reason),btrim(p_evidence_receipt_id)) then
      raise exception 'C515_OT_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return v_existing;
  end if;
  if exists(select 1 from public.workforce_overtime_requests where segment_id=p_segment_id) then
    raise exception 'C515_OT_SEGMENT_ALREADY_HAS_REQUEST' using errcode='23505'; end if;
  insert into public.workforce_overtime_requests(segment_id,overtime_start_at,overtime_end_at,day_class,time_class,
    reason,evidence_receipt_id,requested_by,leader_preapproved_by,state,idempotency_key)
  values(p_segment_id,p_start_at,p_end_at,p_day_class,p_time_class,btrim(p_reason),btrim(p_evidence_receipt_id),
    v_actor,case when private.current_system_permission()='leader' then v_actor else null end,
    'pending_admin_confirmation',p_idempotency_key) returning * into v_request;
  insert into public.workforce_overtime_request_events(request_id,actor_id,action,from_state,to_state,reason,version,idempotency_key)
  values(v_request.id,v_actor,case when private.current_system_permission()='leader' then 'leader_preapproved' else 'requested' end,
    null,v_request.state,btrim(p_reason),1,gen_random_uuid());
  return v_request;
end $$;
alter function public.rc19_c515_request_overtime(text,timestamptz,timestamptz,text,text,text,text,uuid) owner to postgres;
revoke all on function public.rc19_c515_request_overtime(text,timestamptz,timestamptz,text,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rc19_c515_request_overtime(text,timestamptz,timestamptz,text,text,text,text,uuid) to authenticated;

create or replace function public.rc19_c515_decide_overtime_request(
  p_request_id uuid,p_expected_version integer,p_action text,p_reason text,p_idempotency_key uuid
) returns public.workforce_overtime_requests
language plpgsql security definer set search_path='' as $$
declare v_actor text:=private.current_business_user_id(); v_request public.workforce_overtime_requests%rowtype;
  v_segment public.workforce_actual_segments%rowtype; v_shift public.shifts%rowtype;
  v_rate public.workforce_rate_cards%rowtype; v_count integer; v_next text; v_action text; v_replay public.workforce_overtime_request_events%rowtype;
-- BEGIN (nested)
  if v_actor is null or not private.current_business_user_is_active()
    or private.current_system_permission() not in ('leader','admin') then
    raise exception 'C515_OT_ACTOR_FORBIDDEN' using errcode='42501'; end if;
  if p_idempotency_key is null or p_expected_version<1 or p_action not in ('leader_preapprove','admin_confirm','reject')
    or char_length(btrim(coalesce(p_reason,''))) not between 8 and 2000 then raise exception 'C515_OT_DECISION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('c515_ot_decide:'||p_idempotency_key::text,0));
  select * into v_replay from public.workforce_overtime_request_events where idempotency_key=p_idempotency_key;
  if found then
    if v_replay.request_id<>p_request_id
      or v_replay.action is distinct from (case p_action when 'admin_confirm' then 'admin_confirmed'
        when 'reject' then 'rejected' else p_action end)
      or v_replay.reason<>btrim(p_reason) then
      raise exception 'C515_OT_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    select * into v_request from public.workforce_overtime_requests where id=p_request_id;
    return v_request;
  end if;
  select * into v_request from public.workforce_overtime_requests where id=p_request_id for update;
  if not found or v_request.version<>p_expected_version then raise exception 'C515_OT_STALE_REQUEST' using errcode='40001'; end if;
  select * into v_segment from public.workforce_actual_segments where id=v_request.segment_id for share;
  select * into v_shift from public.shifts where id=v_segment.shift_id and deleted_at is null;
  if not found or v_segment.review_status<>'approved' or v_segment.event_kind<>'worked'
    or v_request.overtime_start_at<v_segment.actual_start_at or v_request.overtime_end_at>v_segment.actual_end_at then
    raise exception 'C515_OT_ACTUAL_CHANGED'; end if;
  if private.current_system_permission()='leader' then
    if not private.rc19_has_any_leader_brand_scope(v_shift.brand_id,array['staff.manage','workforce.read'])
      then raise exception 'C515_OT_BRAND_SCOPE_DENIED' using errcode='42501'; end if;
    if p_action<>'leader_preapprove' or v_request.state<>'pending_admin_confirmation'
      or v_actor=v_segment.staff_id or v_request.leader_preapproved_by is not null then
      raise exception 'C515_OT_ADMIN_CONFIRM_REQUIRED' using errcode='42501'; end if;
    update public.workforce_overtime_requests set leader_preapproved_by=v_actor,
      version=version+1,updated_at=statement_timestamp() where id=p_request_id returning * into v_request;
    insert into public.workforce_overtime_request_events(request_id,actor_id,action,from_state,to_state,reason,version,idempotency_key)
    values(v_request.id,v_actor,'leader_preapproved','pending_admin_confirmation','pending_admin_confirmation',
      btrim(p_reason),v_request.version,p_idempotency_key);
    return v_request;
  end if;
  if p_action='leader_preapprove' then raise exception 'C515_OT_LEADER_REQUIRED'; end if;
  if v_actor=v_segment.staff_id or (v_actor=v_request.requested_by
      and not (private.current_system_permission()='admin' and v_request.leader_preapproved_by is null)) then
    raise exception 'C515_OT_SELF_CONFIRM_BLOCKED' using errcode='42501'; end if;
  if p_action='reject' then
    v_next:='rejected'; v_action:='rejected';
  else
    if v_request.state<>'pending_admin_confirmation' then raise exception 'C515_OT_INVALID_TRANSITION'; end if;
    select count(*) into v_count from public.workforce_rate_cards r where r.operational_role=v_segment.operational_role
      and r.approved_by is not null and r.approved_at is not null
      and (r.staff_id=v_segment.staff_id or r.staff_id is null)
      and r.effective_from<=v_shift.date and (r.effective_through is null or r.effective_through>=v_shift.date)
      and (r.staff_id=v_segment.staff_id or not exists(select 1 from public.workforce_rate_cards specific
        where specific.staff_id=v_segment.staff_id and specific.operational_role=v_segment.operational_role
          and specific.approved_by is not null and specific.approved_at is not null
          and specific.effective_from<=v_shift.date and (specific.effective_through is null or specific.effective_through>=v_shift.date)));
    if v_count<>1 then raise exception 'C515_OT_RATE_NOT_CONFIGURED'; end if;
    select r.* into v_rate from public.workforce_rate_cards r where r.operational_role=v_segment.operational_role
      and r.approved_by is not null and r.approved_at is not null
      and (r.staff_id=v_segment.staff_id or r.staff_id is null)
      and r.effective_from<=v_shift.date and (r.effective_through is null or r.effective_through>=v_shift.date)
      and (r.staff_id=v_segment.staff_id or not exists(select 1 from public.workforce_rate_cards specific
        where specific.staff_id=v_segment.staff_id and specific.operational_role=v_segment.operational_role
          and specific.approved_by is not null and specific.approved_at is not null
          and specific.effective_from<=v_shift.date and (specific.effective_through is null or specific.effective_through>=v_shift.date)));
    v_next:='admin_confirmed'; v_action:='admin_confirmed';
  end if;
  update public.workforce_overtime_requests set state=v_next,admin_confirmed_by=case when v_next='admin_confirmed' then v_actor else null end,
    rate_card_id=case when v_next='admin_confirmed' then v_rate.id else null end,
    multiplier_basis_points=case when v_next='admin_confirmed' then v_rate.overtime_multiplier_basis_points else null end,
    version=version+1,updated_at=statement_timestamp() where id=p_request_id returning * into v_request;
  insert into public.workforce_overtime_request_events(request_id,actor_id,action,from_state,to_state,reason,version,idempotency_key)
  values(v_request.id,v_actor,v_action,'pending_admin_confirmation',v_next,btrim(p_reason),v_request.version,p_idempotency_key);
  return v_request;
end $$;
alter function public.rc19_c515_decide_overtime_request(uuid,integer,text,text,uuid) owner to postgres;
revoke all on function public.rc19_c515_decide_overtime_request(uuid,integer,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rc19_c515_decide_overtime_request(uuid,integer,text,text,uuid) to authenticated;

create or replace function private.rc19_c515_overtime_line_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_request public.workforce_overtime_requests%rowtype;
  v_segment public.workforce_actual_segments%rowtype; v_shift_date date;
-- BEGIN (nested)
  if tg_op='DELETE' then return old; end if;
  if tg_op='INSERT' then
    select * into v_segment from public.workforce_actual_segments where id=new.segment_id;
    if found then select date into v_shift_date from public.shifts where id=v_segment.shift_id; end if;
    if found and v_shift_date>=date '2026-11-10' then
      select * into v_request from public.workforce_overtime_requests
        where segment_id=new.segment_id and state='admin_confirmed';
      if found then
        if v_request.rate_card_id is null or v_request.multiplier_basis_points is null
          or v_request.overtime_seconds<=0 then raise exception 'C515_OT_APPROVAL_REQUIRED' using errcode='42501'; end if;
        new.overtime_request_id:=v_request.id;
        new.overtime_day_class:=v_request.day_class;
        new.overtime_time_class:=v_request.time_class;
        new.overtime_seconds:=v_request.overtime_seconds;
        new.actual_seconds:=extract(epoch from (date_trunc('second',v_segment.actual_end_at)-date_trunc('second',v_segment.actual_start_at)))::integer;
        new.payable_seconds:=new.actual_seconds;
        new.rate_card_id:=v_request.rate_card_id;
        select r.vnd_per_hour,r.overtime_multiplier_basis_points into new.rate_vnd_per_hour,new.overtime_multiplier_basis_points
          from public.workforce_rate_cards r where r.id=v_request.rate_card_id
            and r.approved_by is not null and r.approved_at is not null;
        if not found then raise exception 'C515_OT_RATE_NOT_CONFIGURED'; end if;
      end if;
    end if;
  end if;
  if new.actual_seconds is not null and coalesce(new.overtime_seconds,0)>0 then
    select * into v_request from public.workforce_overtime_requests where id=new.overtime_request_id;
    if not found or v_request.state<>'admin_confirmed' or v_request.segment_id<>new.segment_id
      or v_request.overtime_seconds<>new.overtime_seconds
      or v_request.day_class is distinct from new.overtime_day_class
      or v_request.time_class is distinct from new.overtime_time_class
      or v_request.rate_card_id is null
      or v_request.multiplier_basis_points is distinct from new.overtime_multiplier_basis_points then
      raise exception 'C515_OT_APPROVAL_REQUIRED' using errcode='42501'; end if;
  elsif new.overtime_request_id is not null then
    raise exception 'C515_OT_SECONDS_REQUIRED';
  end if;
  return new;
end $$;
alter function private.rc19_c515_overtime_line_guard() owner to postgres;
revoke all on function private.rc19_c515_overtime_line_guard() from public,anon,authenticated,service_role;
create trigger workforce_00_c515_overtime_line_guard before insert or update or delete on public.workforce_payroll_lines
  for each row execute function private.rc19_c515_overtime_line_guard();

create or replace function private.rc19_c515_payroll_adjustment_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_case public.workforce_cancellation_compensation_cases%rowtype;
-- BEGIN (nested)
  if tg_op<>'INSERT' then raise exception 'C515_PAYROLL_ADJUSTMENT_IMMUTABLE' using errcode='42501'; end if;
  select * into v_case from public.workforce_cancellation_compensation_cases where id=new.compensation_case_id;
  if not found or v_case.state<>'admin_confirmed' or v_case.period_id<>new.period_id
    or v_case.staff_id<>new.staff_id or v_case.operational_role<>new.operational_role
    or v_case.proposed_amount_vnd<>new.amount_vnd or v_case.admin_confirmed_by<>new.confirmed_by
    or not exists(select 1 from public.workforce_payroll_periods p where p.id=new.period_id and p.status='draft') then
    raise exception 'C515_PAYROLL_ADJUSTMENT_SCOPE_INVALID' using errcode='42501'; end if;
  return new;
end $$;
alter function private.rc19_c515_payroll_adjustment_guard() owner to postgres;
revoke all on function private.rc19_c515_payroll_adjustment_guard() from public,anon,authenticated,service_role;
create trigger workforce_c515_payroll_adjustment_guard before insert or update or delete on public.workforce_payroll_adjustments
  for each row execute function private.rc19_c515_payroll_adjustment_guard();

create or replace function public.rc19_c515_propose_cancellation_compensation(
  p_shift_id text,p_staff_id text,p_operational_role text,p_actual_segment_id text,p_registration_id text,
  p_period_id text,p_cancellation_reason text,p_reason text,p_evidence_receipt_id text,
  p_proposed_amount_vnd bigint,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor text:=private.current_business_user_id(); v_role text:=private.current_system_permission();
  v_shift public.shifts%rowtype; v_period public.workforce_payroll_periods%rowtype;
  v_segment public.workforce_actual_segments%rowtype; v_registration public.shift_registrations%rowtype;
  v_case public.workforce_cancellation_compensation_cases%rowtype; v_adjustment public.workforce_payroll_adjustments%rowtype;
  v_actual_seconds integer:=0; v_earnings bigint;
-- BEGIN (nested)
  if v_actor is null or not private.current_business_user_is_active() or v_role not in ('admin','leader') then
    raise exception 'C515_COMPENSATION_ACTOR_FORBIDDEN' using errcode='42501'; end if;
  if p_idempotency_key is null or p_proposed_amount_vnd not between 1 and 1000000000000
    or p_operational_role not in ('host','support','technical')
    or char_length(btrim(coalesce(p_reason,''))) not between 8 and 2000
    or char_length(btrim(coalesce(p_cancellation_reason,''))) not between 8 and 2000 then
    raise exception 'C515_COMPENSATION_REQUEST_INVALID'; end if;
  if (p_actual_segment_id is null)=(p_registration_id is null) then
    raise exception 'C515_COMPENSATION_ASSIGNMENT_REQUIRED'; end if;
  select * into v_shift from public.shifts where id=p_shift_id and deleted_at is null for share;
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for share;
  if not found or v_shift.id is null or v_shift.status<>'cancelled'
    or v_period.status<>'draft' or v_shift.date<v_period.period_start or v_shift.date>v_period.period_end then
    raise exception 'C515_COMPENSATION_SHIFT_OR_PERIOD_INVALID'; end if;
  if v_role='leader' and not private.rc19_has_any_leader_brand_scope(v_shift.brand_id,array['staff.manage']) then
    raise exception 'C515_COMPENSATION_BRAND_SCOPE_DENIED' using errcode='42501'; end if;
  if v_actor=p_staff_id then raise exception 'C515_COMPENSATION_SELF_APPROVAL_BLOCKED' using errcode='42501'; end if;
  if not exists(select 1 from public.audit_logs a where a.entity_type='shifts' and a.entity_id=v_shift.id
    and a.actor_role in ('admin','leader') and a.actor_business_user_id is not null
    and a.before_data->>'status' is distinct from 'cancelled' and a.after_data->>'status'='cancelled'
    and a.after_data->>'id'=v_shift.id) then raise exception 'C515_COMPENSATION_CANCELLATION_UNVERIFIED'; end if;
  if not exists(select 1 from public.operational_files f where f.id=btrim(p_evidence_receipt_id)
    and f.shift_id=v_shift.id and f.brand_id=v_shift.brand_id and f.platform_id=v_shift.platform_id
    and f.integrity_status='sha256_verified' and f.checksum_sha256 ~ '^[a-f0-9]{64}$'
    and nullif(btrim(f.external_file_id),'') is not null and nullif(btrim(f.external_parent_id),'') is not null
    and f.deleted_at is null) then raise exception 'C515_COMPENSATION_EVIDENCE_UNVERIFIED'; end if;
  if p_actual_segment_id is not null then
    select * into v_segment from public.workforce_actual_segments where id=p_actual_segment_id for share;
    if not found or v_segment.shift_id<>v_shift.id or v_segment.staff_id<>p_staff_id
      or v_segment.operational_role<>p_operational_role or v_segment.event_kind<>'worked'
      or v_segment.review_status<>'approved' or v_segment.actual_start_at is null or v_segment.actual_end_at is null then
      raise exception 'C515_COMPENSATION_ACTUAL_SCOPE_INVALID'; end if;
    v_actual_seconds:=extract(epoch from date_trunc('second',v_segment.actual_end_at)-date_trunc('second',v_segment.actual_start_at))::integer;
    select l.gross_vnd into v_earnings from public.workforce_payroll_lines l
      where l.segment_id=v_segment.id and l.voided_at is null;
  else
    select * into v_registration from public.shift_registrations where id=p_registration_id for share;
    if not found or v_registration.shift_id<>v_shift.id or v_registration.user_id<>p_staff_id
      or v_registration.operational_role<>p_operational_role or v_registration.status<>'cancelled'
      or not exists(select 1 from public.audit_logs a where a.entity_type='shift registrations'
        and a.entity_id=v_registration.id and a.before_data->>'status' in ('approved','manually_assigned')
        and a.after_data->>'status'='cancelled' and a.after_data->>'shift_id'=v_shift.id) then
      raise exception 'C515_COMPENSATION_REGISTRATION_SCOPE_INVALID'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('c515_comp:'||p_idempotency_key::text,0));
  select * into v_case from public.workforce_cancellation_compensation_cases where idempotency_key=p_idempotency_key;
  if found then
    if (v_case.shift_id,v_case.staff_id,v_case.operational_role,v_case.actual_segment_id,v_case.registration_id,
      v_case.period_id,v_case.cancellation_reason,v_case.reason,v_case.evidence_receipt_id,v_case.proposed_amount_vnd)
      is distinct from (p_shift_id,p_staff_id,p_operational_role,p_actual_segment_id,p_registration_id,
      p_period_id,btrim(p_cancellation_reason),btrim(p_reason),btrim(p_evidence_receipt_id),p_proposed_amount_vnd) then
      raise exception 'C515_COMPENSATION_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    select * into v_adjustment from public.workforce_payroll_adjustments where compensation_case_id=v_case.id;
    return jsonb_build_object('case',to_jsonb(v_case),'adjustment',case when found then to_jsonb(v_adjustment) else null end,'replayed',true);
  end if;
  insert into public.workforce_cancellation_compensation_cases(
    shift_id,staff_id,operational_role,actual_seconds,actual_earnings_vnd,actual_segment_id,registration_id,
    cancellation_source,cancellation_reason,reason,evidence_receipt_id,proposed_amount_vnd,proposed_by,
    leader_preapproved_by,admin_confirmed_by,period_id,state,idempotency_key)
  values(p_shift_id,p_staff_id,p_operational_role,v_actual_seconds,v_earnings,p_actual_segment_id,p_registration_id,
    'brand_ada',btrim(p_cancellation_reason),btrim(p_reason),btrim(p_evidence_receipt_id),p_proposed_amount_vnd,
    v_actor,case when v_role='leader' then v_actor else null end,
    case when v_role='admin' then v_actor else null end,p_period_id,
    case when v_role='admin' then 'admin_confirmed' else 'pending_admin_confirmation' end,p_idempotency_key)
  returning * into v_case;
  insert into public.workforce_cancellation_compensation_events(case_id,actor_id,action,from_state,to_state,reason,amount_vnd,version,idempotency_key)
  values(v_case.id,v_actor,case when v_role='admin' then 'admin_confirmed' else 'proposed' end,null,v_case.state,
    btrim(p_reason),p_proposed_amount_vnd,1,p_idempotency_key);
  if v_role='admin' then
    insert into public.workforce_payroll_adjustments(period_id,compensation_case_id,staff_id,operational_role,amount_vnd,reason,confirmed_by)
    values(v_case.period_id,v_case.id,v_case.staff_id,v_case.operational_role,v_case.proposed_amount_vnd,v_case.reason,v_actor)
    returning * into v_adjustment;
  end if;
  return jsonb_build_object('case',to_jsonb(v_case),'adjustment',case when v_adjustment.id is null then null else to_jsonb(v_adjustment) end,'replayed',false);
end $$;
alter function public.rc19_c515_propose_cancellation_compensation(text,text,text,text,text,text,text,text,text,bigint,uuid) owner to postgres;
revoke all on function public.rc19_c515_propose_cancellation_compensation(text,text,text,text,text,text,text,text,text,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rc19_c515_propose_cancellation_compensation(text,text,text,text,text,text,text,text,text,bigint,uuid) to authenticated;

create or replace function public.rc19_c515_decide_cancellation_compensation(
  p_case_id uuid,p_expected_version integer,p_action text,p_reason text,p_new_amount_vnd bigint,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor text:=private.current_business_user_id(); v_role text:=private.current_system_permission();
  v_case public.workforce_cancellation_compensation_cases%rowtype; v_event public.workforce_cancellation_compensation_events%rowtype;
  v_adjustment public.workforce_payroll_adjustments%rowtype; v_shift public.shifts%rowtype; v_period public.workforce_payroll_periods%rowtype;
  v_next text; v_event_action text;
-- BEGIN (nested)
  if v_actor is null or not private.current_business_user_is_active() or v_role not in ('admin','leader') then
    raise exception 'C515_COMPENSATION_ACTOR_FORBIDDEN' using errcode='42501'; end if;
  if p_idempotency_key is null or p_expected_version<1 or p_action not in ('edit','admin_confirm','reject')
    or char_length(btrim(coalesce(p_reason,''))) not between 8 and 2000
    or (p_action='edit' and p_new_amount_vnd not between 1 and 1000000000000) then
    raise exception 'C515_COMPENSATION_DECISION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('c515_comp_decide:'||p_idempotency_key::text,0));
  select * into v_event from public.workforce_cancellation_compensation_events where idempotency_key=p_idempotency_key;
  if found then
    if v_event.case_id<>p_case_id
      or v_event.action is distinct from (case p_action when 'admin_confirm' then 'admin_confirmed'
        when 'reject' then 'rejected' else 'edited' end)
      or v_event.reason<>btrim(p_reason)
      or (p_action='edit' and v_event.amount_vnd is distinct from p_new_amount_vnd) then
      raise exception 'C515_COMPENSATION_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    select * into v_case from public.workforce_cancellation_compensation_cases where id=p_case_id;
    select * into v_adjustment from public.workforce_payroll_adjustments where compensation_case_id=p_case_id;
    return jsonb_build_object('case',to_jsonb(v_case),'adjustment',case when found then to_jsonb(v_adjustment) else null end,'replayed',true);
  end if;
  select * into v_case from public.workforce_cancellation_compensation_cases where id=p_case_id for update;
  if not found or v_case.version<>p_expected_version or v_case.state<>'pending_admin_confirmation' then
    raise exception 'C515_COMPENSATION_STALE_OR_CLOSED' using errcode='40001'; end if;
  select * into v_shift from public.shifts where id=v_case.shift_id and status='cancelled' and deleted_at is null for share;
  select * into v_period from public.workforce_payroll_periods where id=v_case.period_id for update;
  if not found or v_shift.id is null or v_period.status<>'draft' then
    raise exception 'C515_COMPENSATION_PERIOD_LOCKED_OR_SHIFT_CHANGED' using errcode='42501'; end if;
  if v_role='leader' then
    if p_action<>'edit' or not private.rc19_has_any_leader_brand_scope(v_shift.brand_id,array['staff.manage'])
      or v_actor=v_case.staff_id then raise exception 'C515_COMPENSATION_BRAND_SCOPE_DENIED' using errcode='42501'; end if;
    update public.workforce_cancellation_compensation_cases set proposed_amount_vnd=p_new_amount_vnd,
      reason=btrim(p_reason),version=version+1,updated_at=statement_timestamp() where id=p_case_id returning * into v_case;
    v_next:='pending_admin_confirmation'; v_event_action:='edited';
  else
    if p_action='edit' then raise exception 'C515_COMPENSATION_LEADER_EDIT_REQUIRED'; end if;
    if p_action='admin_confirm' then
      if v_actor=v_case.staff_id or v_actor=v_case.proposed_by or v_actor=v_case.leader_preapproved_by then
        raise exception 'C515_COMPENSATION_SELF_CONFIRM_BLOCKED' using errcode='42501'; end if;
      update public.workforce_cancellation_compensation_cases set state='admin_confirmed',admin_confirmed_by=v_actor,
        version=version+1,updated_at=statement_timestamp() where id=p_case_id returning * into v_case;
      insert into public.workforce_payroll_adjustments(period_id,compensation_case_id,staff_id,operational_role,amount_vnd,reason,confirmed_by)
      values(v_case.period_id,v_case.id,v_case.staff_id,v_case.operational_role,v_case.proposed_amount_vnd,v_case.reason,v_actor)
      returning * into v_adjustment;
      v_next:='admin_confirmed'; v_event_action:='admin_confirmed';
    else
      update public.workforce_cancellation_compensation_cases set state='rejected',version=version+1,
        updated_at=statement_timestamp() where id=p_case_id returning * into v_case;
      v_next:='rejected'; v_event_action:='rejected';
    end if;
  end if;
  insert into public.workforce_cancellation_compensation_events(case_id,actor_id,action,from_state,to_state,reason,amount_vnd,version,idempotency_key)
  values(v_case.id,v_actor,v_event_action,'pending_admin_confirmation',v_next,btrim(p_reason),v_case.proposed_amount_vnd,v_case.version,p_idempotency_key);
  return jsonb_build_object('case',to_jsonb(v_case),'adjustment',case when v_adjustment.id is null then null else to_jsonb(v_adjustment) end,'replayed',false);
end $$;
alter function public.rc19_c515_decide_cancellation_compensation(uuid,integer,text,text,bigint,uuid) owner to postgres;
revoke all on function public.rc19_c515_decide_cancellation_compensation(uuid,integer,text,text,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rc19_c515_decide_cancellation_compensation(uuid,integer,text,text,bigint,uuid) to authenticated;
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261110140000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261111000000_rc19_c515_live_cancellation_transition.sql
 * Version:   20261111000000
 *******************************************************************************/
-- BEGIN (nested)
-- Refuse to replace a drifted function body; this forward migration is based on the C4 source contract.
do $preflight$
declare v_definition text;
-- BEGIN (nested)
  select pg_get_functiondef('public.update_shift(text,jsonb,boolean,integer)'::regprocedure)
    into v_definition;
  if v_definition is null
    or position('private.require_shift_actor(true)' in v_definition) = 0
    or position('private.assert_expected_version' in v_definition) = 0
    or position('SHIFT_STATUS_TRANSITION_NOT_ALLOWED' in v_definition) = 0
    or position('existing_shift.status = ''live''' in v_definition) = 0 then
    raise exception 'C515_SHIFT_RPC_DEFINITION_DRIFT';
  end if;
end
$preflight$;

do $preflight$
declare v_definition text;
-- BEGIN (nested)
  select pg_get_functiondef('public.workforce_rc16_immutable_approved_segment()'::regprocedure)
    into v_definition;
  if v_definition is null
    or position('WORKFORCE_APPROVED_STAFF_OVERLAP' in v_definition) = 0
    or position('WORKFORCE_APPROVED_NO_SHOW_CONFLICT' in v_definition) = 0
    or position('WORKFORCE_SHIFT_NOT_COMPLETED' in v_definition) = 0 then
    raise exception 'C515_WORKFORCE_TRIGGER_DEFINITION_DRIFT';
  end if;
end
$preflight$;

CREATE OR REPLACE FUNCTION public.update_shift(p_shift_id text, p_patch jsonb, p_confirm_impact boolean, p_expected_version integer)
 RETURNS shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id text;
  actor_permission text;
  existing_shift public.shifts;
  updated_shift public.shifts;
  input_key text;
  requested_status text;
  effective_agency text;
  effective_source text;
-- BEGIN (nested)
  actor_id := private.require_shift_actor(true);
  actor_permission := private.current_system_permission();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'SHIFT_PAYLOAD_INVALID';
  end if;
  if p_patch ?| array['host_id', 'support_id', 'technical_id'] then
    raise exception using errcode = '22023', message = 'STAFFING_FIELDS_USE_STAFFING_RPC';
  end if;
  for input_key in select jsonb_object_keys(p_patch)
  loop
    if input_key <> all (array[
      'date', 'start_time', 'end_time', 'brand_id', 'platform_id', 'campaign_id',
      'title', 'studio', 'required_host_count', 'required_support_count',
      'required_technical_count', 'status', 'live_link', 'product_notes',
      'registration_cutoff_at', 'allow_multi_role', 'execution_source', 'agency_code', 'supplemental_fields'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
    if actor_permission = 'leader'
      and input_key in ('registration_cutoff_at', 'allow_multi_role')
    then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  end loop;
  if (p_patch ? 'execution_source' and p_patch->>'execution_source' is not null
    and p_patch->>'execution_source' not in ('internal', 'agency')) then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  if (p_patch ? 'agency_code' and p_patch->>'agency_code' is not null
    and p_patch->>'agency_code' not in ('ada', 'snap', 'live_ai')) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_CODE_INVALID';
  end if;
  if p_patch ? 'supplemental_fields' and not private.is_valid_shift_supplemental_fields(p_patch->'supplemental_fields') then
    raise exception using errcode = '22023', message = 'SHIFT_SUPPLEMENTAL_FIELDS_INVALID';
  end if;

  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if existing_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;

  perform private.assert_expected_version('Shift', p_expected_version, existing_shift.version);

  effective_agency := case
    when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
    else existing_shift.agency_code
  end;
  effective_source := case
    when p_patch ? 'execution_source' then nullif(p_patch->>'execution_source', '')
    when p_patch ? 'agency_code' and effective_agency is not null then
      case effective_agency when 'ada' then 'internal' else 'agency' end
    else existing_shift.execution_source
  end;
  if (effective_agency is not null and effective_source is distinct from
    case effective_agency when 'ada' then 'internal' else 'agency' end) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
  end if;

  requested_status := coalesce(nullif(p_patch->>'status', ''), existing_shift.status);
  if actor_permission in ('leader', 'admin')
    and requested_status <> existing_shift.status and not (
      (existing_shift.status = 'scheduled' and requested_status in ('scheduled', 'preparing', 'cancelled'))
      or (existing_shift.status = 'preparing' and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'cancelled'))
      or (existing_shift.status = 'live' and requested_status in ('live', 'paused', 'completed', 'cancelled'))
      or (existing_shift.status = 'paused' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and existing_shift.status_mode = 'auto'
        and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and existing_shift.status_mode = 'manual' and requested_status = 'completed')
      or (existing_shift.status = 'cancelled' and requested_status = 'cancelled')
    ) then
    raise exception using errcode = '42501', message = 'SHIFT_STATUS_TRANSITION_NOT_ALLOWED';
  end if;
  if existing_shift.status = 'live' and p_patch ?| array['date', 'start_time', 'platform_id'] then
    raise exception using errcode = 'P0001', message = 'LIVE_SHIFT_FIELD_LOCKED';
  end if;
  if existing_shift.status = 'completed'
    and p_patch ?| array['date', 'start_time', 'end_time', 'platform_id', 'campaign_id']
    and not p_confirm_impact
  then
    raise exception using errcode = 'P0001', message = 'COMPLETED_SHIFT_IMPACT_CONFIRMATION_REQUIRED';
  end if;
  update public.shifts as shift
  set
    date = case when p_patch ? 'date' then (p_patch->>'date')::date else shift.date end,
    start_time = case when p_patch ? 'start_time' then (p_patch->>'start_time')::time else shift.start_time end,
    end_time = case when p_patch ? 'end_time' then (p_patch->>'end_time')::time else shift.end_time end,
    brand_id = case when p_patch ? 'brand_id' then nullif(p_patch->>'brand_id', '') else shift.brand_id end,
    platform_id = case when p_patch ? 'platform_id' then nullif(p_patch->>'platform_id', '') else shift.platform_id end,
    campaign_id = case when p_patch ? 'campaign_id' then nullif(p_patch->>'campaign_id', '') else shift.campaign_id end,
    title = case when p_patch ? 'title' then nullif(p_patch->>'title', '') else shift.title end,
    studio = case when p_patch ? 'studio' then nullif(p_patch->>'studio', '') else shift.studio end,
    required_host_count = case when p_patch ? 'required_host_count' then private.normalize_shift_capacity(p_patch->>'required_host_count', 1::smallint) else shift.required_host_count end,
    required_support_count = case when p_patch ? 'required_support_count' then private.normalize_shift_capacity(p_patch->>'required_support_count', 1::smallint) else shift.required_support_count end,
    required_technical_count = case when p_patch ? 'required_technical_count' then private.normalize_shift_capacity(p_patch->>'required_technical_count', 1::smallint) else shift.required_technical_count end,
    registration_cutoff_at = case when p_patch ? 'registration_cutoff_at' then nullif(p_patch->>'registration_cutoff_at', '')::timestamptz else shift.registration_cutoff_at end,
    allow_multi_role = case when p_patch ? 'allow_multi_role' then (p_patch->>'allow_multi_role')::boolean else shift.allow_multi_role end,
    status = requested_status,
    live_link = case when p_patch ? 'live_link' then nullif(p_patch->>'live_link', '') else shift.live_link end,
    product_notes = case when p_patch ? 'product_notes' then nullif(p_patch->>'product_notes', '') else shift.product_notes end,
    supplemental_fields = case when p_patch ? 'supplemental_fields' then p_patch->'supplemental_fields' else shift.supplemental_fields end,
    execution_source = case
      when p_patch ? 'execution_source' then p_patch->>'execution_source'
      when p_patch ? 'agency_code' and nullif(p_patch->>'agency_code', '') is not null then
        case nullif(p_patch->>'agency_code', '') when 'ada' then 'internal' else 'agency' end
      else shift.execution_source end,
    agency_code = case
      when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
      else shift.agency_code end,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into updated_shift;
  perform private.assert_shift_staffing_consistent(updated_shift);
  return updated_shift;
end;
$function$;

create or replace function public.workforce_rc16_immutable_approved_segment()
returns trigger language plpgsql set search_path='' as $$
-- BEGIN (nested)
  if tg_op='INSERT' then
    if new.review_status <> 'draft' or new.reviewed_by is not null
      or new.reviewed_at is not null or new.review_note is not null then
      raise exception 'WORKFORCE_SEGMENT_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if tg_op='DELETE' and old.review_status in ('approved','rejected') then
    raise exception 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE';
  end if;
  if tg_op='UPDATE' and old.review_status in ('approved','rejected') then
    raise exception 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE';
  end if;
  if tg_op='UPDATE' and new.version <> old.version + 1 then
    raise exception 'WORKFORCE_ACTUAL_STALE_VERSION';
  end if;
  if new.review_status='approved' then
    if not exists (
      select 1 from public.shifts s
      where s.id=new.shift_id and s.deleted_at is null
        and (
          s.status='completed'
          or (s.status='cancelled' and new.event_kind='worked' and exists (
            select 1 from public.audit_logs a
            where a.entity_type='shifts' and a.entity_id=new.shift_id
              and a.actor_role in ('admin','leader') and a.actor_business_user_id is not null
              and a.before_data->>'status' is distinct from 'cancelled'
              and a.after_data->>'status'='cancelled'
              and a.after_data->>'id'=new.shift_id
              and new.actual_end_at<=a.created_at
          ))
        )
    ) then
      raise exception 'WORKFORCE_SHIFT_NOT_COMPLETED';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('staff-attendance:'||new.staff_id,0));
    if new.event_kind='worked' and exists (
      select 1 from public.workforce_actual_segments existing
      where existing.staff_id=new.staff_id and existing.id<>new.id
        and existing.review_status='approved' and existing.event_kind='worked'
        and tstzrange(existing.actual_start_at,existing.actual_end_at,'[)')
          && tstzrange(new.actual_start_at,new.actual_end_at,'[)')
    ) then
      raise exception 'WORKFORCE_APPROVED_STAFF_OVERLAP';
    end if;
    if exists (
      select 1 from public.workforce_actual_segments existing
      where existing.shift_id=new.shift_id and existing.staff_id=new.staff_id
        and existing.operational_role=new.operational_role
        and existing.id<>new.id and existing.review_status='approved'
        and existing.event_kind<>new.event_kind
    ) then
      raise exception 'WORKFORCE_APPROVED_NO_SHOW_CONFLICT';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

alter function public.update_shift(text, jsonb, boolean, integer) owner to postgres;
revoke all on function public.update_shift(text, jsonb, boolean, integer) from public, anon, authenticated;
grant execute on function public.update_shift(text, jsonb, boolean, integer) to authenticated;
alter function public.workforce_rc16_immutable_approved_segment() owner to postgres;
revoke all on function public.workforce_rc16_immutable_approved_segment() from public, anon, authenticated;
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261111000000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261112000000_rc19_c2_calendar_overlap_range.sql
 * Version:   20261112000000
 *******************************************************************************/
-- BEGIN (nested)
-- Calendar date windows use half-open timestamp overlap while other list consumers keep start-date semantics.
do $guard$
-- BEGIN (nested)
  if to_regclass('public.shifts') is null
    or to_regclass('public.shift_staffing_segments') is null
    or to_regprocedure('private.current_business_user_id()') is null
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='shifts' and column_name='start_at' and data_type='timestamp with time zone')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='shifts' and column_name='end_at' and data_type='timestamp with time zone')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='shift_staffing_segments' and column_name='shift_id') then
    raise exception using errcode='55000', message='RC19_C2_CALENDAR_BASELINE_REQUIRED';
  end if;
end
$guard$;

create or replace function private.filtered_shift_ids(p_scope text, p_filters jsonb)
returns table(id text, date date, start_time time, status text)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  actor text := private.current_business_user_id();
  key text;
  roles text[];
  reg_statuses text[];
  search_text text;
-- BEGIN (nested)
  if actor is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_scope not in ('all', 'open', 'mine') or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text) > 16384 then raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID'; end if;
  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('search','from','to','brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','statuses','descending','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','hasImportedStaffing','shiftIds','eligibleOnly','calendarOverlap') then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
  end loop;
  foreach key in array array['brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','statuses','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','shiftIds'] loop
    if p_filters ? key and (jsonb_typeof(p_filters->key) is distinct from 'array') then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
    if p_filters ? key and jsonb_array_length(p_filters->key) > 50 then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
    if exists(select 1 from jsonb_array_elements(coalesce(p_filters->key, '[]'::jsonb)) value
      where jsonb_typeof(value) <> 'string' or length(value#>>'{}') > 128) then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
  end loop;
  if (p_filters ? 'hasImportedStaffing' and jsonb_typeof(p_filters->'hasImportedStaffing') <> 'boolean')
    or (p_filters ? 'eligibleOnly' and jsonb_typeof(p_filters->'eligibleOnly') <> 'boolean')
    or (p_filters ? 'calendarOverlap' and jsonb_typeof(p_filters->'calendarOverlap') <> 'boolean')
    or (p_filters ? 'search' and jsonb_typeof(p_filters->'search') <> 'string')
    or (p_filters ? 'descending' and jsonb_typeof(p_filters->'descending') <> 'boolean')
    or (p_filters ? 'from' and (jsonb_typeof(p_filters->'from') <> 'string' or p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'to' and (jsonb_typeof(p_filters->'to') <> 'string' or p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'from' and p_filters ? 'to' and (p_filters->>'from')::date > (p_filters->>'to')::date) then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  if coalesce((p_filters->>'calendarOverlap')::boolean, false) and not (p_filters ? 'from' and p_filters ? 'to') then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  if length(coalesce(p_filters->>'search', '')) > 256 then raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID'; end if;
  roles := array(select jsonb_array_elements_text(coalesce(p_filters->'roles', '[]'::jsonb)));
  reg_statuses := array(select jsonb_array_elements_text(coalesce(p_filters->'registrationStatuses', '[]'::jsonb)));
  if exists(select 1 from unnest(roles) value where value not in ('host', 'support', 'technical'))
    or exists(select 1 from unnest(reg_statuses) value where value not in ('pending', 'approved', 'manually_assigned')) then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search', '')), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_');
  return query
    select s.id, s.date, s.start_time, s.status
    from public.shifts s
    left join public.brands b on b.id = s.brand_id
    left join public.platforms p on p.id = s.platform_id
    where s.deleted_at is null and s.archived_at is null
      and (jsonb_array_length(coalesce(p_filters->'shiftIds', '[]')) = 0 or s.id in (select jsonb_array_elements_text(p_filters->'shiftIds')))
      and (
        p_scope <> 'open'
        or (
          s.status = 'scheduled'
          and not coalesce(s.registration_locked, false)
          and s.end_at > statement_timestamp()
          and (s.registration_cutoff_at is null or s.registration_cutoff_at > statement_timestamp())
          and exists (
            select 1
            from (values
              ('host', s.required_host_count),
              ('support', s.required_support_count),
              ('technical', s.required_technical_count)
            ) demand(role, required)
            where demand.required > 0
              and (
                cardinality(roles) = 0
                or demand.role = any(roles)
              )
              and (
                jsonb_array_length(coalesce(p_filters->'operationalRoles', '[]'::jsonb)) = 0
                or demand.role in (select jsonb_array_elements_text(p_filters->'operationalRoles'))
              )
              and (
                not coalesce((p_filters->>'eligibleOnly')::boolean, false)
                or exists (
                  select 1 from public.business_users u
                  where u.id = actor and u.status = 'active' and demand.role = any(u.operational_roles)
                )
              )
              and (
                select count(*)
                from public.shift_registrations r
                where r.shift_id = s.id
                  and r.operational_role = demand.role
                  and r.status in ('approved', 'manually_assigned')
              ) < demand.required
          )
        )
      )
      and (
        (coalesce((p_filters->>'calendarOverlap')::boolean, false)
          and s.start_at < (((p_filters->>'to')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
          and s.end_at > ((p_filters->>'from')::date::timestamp at time zone 'Asia/Ho_Chi_Minh'))
        or (not coalesce((p_filters->>'calendarOverlap')::boolean, false)
          and (not p_filters ? 'from' or s.date >= (p_filters->>'from')::date)
          and (not p_filters ? 'to' or s.date <= (p_filters->>'to')::date))
      )
      and (jsonb_array_length(coalesce(p_filters->'brandIds', '[]')) = 0 or s.brand_id in (select jsonb_array_elements_text(p_filters->'brandIds')))
      and (jsonb_array_length(coalesce(p_filters->'platformIds', '[]')) = 0 or s.platform_id in (select jsonb_array_elements_text(p_filters->'platformIds')))
      and (jsonb_array_length(coalesce(p_filters->'campaignIds', '[]')) = 0 or s.campaign_id in (select jsonb_array_elements_text(p_filters->'campaignIds')))
      and (jsonb_array_length(coalesce(p_filters->'statuses', '[]')) = 0 or s.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
      and (jsonb_array_length(coalesce(p_filters->'studios', '[]')) = 0 or exists(
        select 1 from jsonb_array_elements_text(p_filters->'studios') studio
        where lower(regexp_replace(btrim(coalesce(s.studio, '')), '\s+', ' ', 'g')) = studio
          or (studio = '__unassigned__' and btrim(coalesce(s.studio, '')) = '')
      ))
      and (search_text = '' or lower(concat_ws(' ', b.name, p.name, s.title, s.product_notes, s.studio)) like '%'||search_text||'%' escape E'\\')
      and (jsonb_array_length(coalesce(p_filters->'assignedUserIds', '[]')) = 0 or exists(
        select 1 from jsonb_array_elements_text(p_filters->'assignedUserIds') staff_id
        where staff_id in (s.host_id, s.support_id, s.technical_id) or exists(
          select 1 from public.shift_registrations r where r.shift_id = s.id and r.user_id = staff_id and r.status in ('approved', 'manually_assigned')
        )
      ))
      and (jsonb_array_length(coalesce(p_filters->'hostIds', '[]')) = 0 or s.host_id in (select jsonb_array_elements_text(p_filters->'hostIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.operational_role = 'host' and r.status in ('approved', 'manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'hostIds'))))
      and (jsonb_array_length(coalesce(p_filters->'supportIds', '[]')) = 0 or s.support_id in (select jsonb_array_elements_text(p_filters->'supportIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.operational_role = 'support' and r.status in ('approved', 'manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'supportIds'))))
      and (jsonb_array_length(coalesce(p_filters->'technicalIds', '[]')) = 0 or s.technical_id in (select jsonb_array_elements_text(p_filters->'technicalIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.operational_role = 'technical' and r.status in ('approved', 'manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))))
      and (jsonb_array_length(coalesce(p_filters->'operationalRoles', '[]')) = 0 or exists(
        select 1 from (values ('host', s.required_host_count), ('support', s.required_support_count), ('technical', s.required_technical_count)) demand(role, n)
        where demand.n > 0 and demand.role in (select jsonb_array_elements_text(p_filters->'operationalRoles'))))
      and (jsonb_array_length(coalesce(p_filters->'staffingStates', '[]')) = 0 or exists(
        select 1 from public.get_shift_staffing_summary(array[s.id]) summary
        where (jsonb_array_length(coalesce(p_filters->'operationalRoles', '[]')) = 0
          or summary.role in (select jsonb_array_elements_text(p_filters->'operationalRoles')))
        having (bool_and(summary.approved >= summary.required) and p_filters->'staffingStates' ? 'fully_staffed')
          or (not bool_and(summary.approved >= summary.required) and p_filters->'staffingStates' ? 'missing_staff')))
      and (jsonb_array_length(coalesce(p_filters->'registrationStates', '[]')) = 0 or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.status::text in (select jsonb_array_elements_text(p_filters->'registrationStates'))))
      and (not coalesce((p_filters->>'hasImportedStaffing')::boolean, false) or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and (r.imported_name is not null or r.source = 'legacy_assignment')))
      and (p_scope <> 'mine' or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.user_id = actor
          and r.status in ('pending', 'approved', 'manually_assigned')
          and (cardinality(roles) = 0 or r.operational_role::text = any(roles))
          and (cardinality(reg_statuses) = 0 or r.status::text = any(reg_statuses))
      ));
end;
$$;

revoke all on function private.filtered_shift_ids(text, jsonb) from public, anon, service_role;
grant execute on function private.filtered_shift_ids(text, jsonb) to authenticated;
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261112000000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261112120000_rc19_audit_history_keyset.sql
 * Version:   20261112120000
 *******************************************************************************/
-- Bounded Audit History reads. The invoker keeps the existing audit_logs RLS
-- policy authoritative; this function only changes pagination and query shape.
CREATE INDEX IF NOT EXISTS audit_logs_cursor_created_at_id_idx
  ON public.audit_logs (created_at DESC, id DESC);

DO $$
DECLARE
  v_policy_qual text;
  v_permission_is_stable boolean;
-- BEGIN (nested)
  SELECT qual INTO v_policy_qual FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_read'
    AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[] AND permissive = 'PERMISSIVE';
  IF v_policy_qual IS NULL OR v_policy_qual !~ $re$rbac_has_permission\('audit\.view'.*rbac_has_permission\('audit\.view_team'.*module.*calendar.*imports$re$ THEN
    RAISE EXCEPTION 'C12_AUDIT_POLICY_DEFINITION_DRIFT';
  END IF;
  SELECT provolatile = 's' INTO v_permission_is_stable
  FROM pg_catalog.pg_proc WHERE oid = 'private.rbac_has_permission(text)'::regprocedure;
  IF v_permission_is_stable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'C12_AUDIT_PERMISSION_VOLATILITY_DRIFT';
  END IF;
END;
$$;

-- Scalar subqueries let PostgreSQL cache stable RBAC decisions per statement,
-- instead of rerunning the effective-permission lookup for every audit row.
ALTER POLICY audit_logs_read ON public.audit_logs USING (
  (SELECT private.rbac_has_permission('audit.view'))
  OR ((SELECT private.rbac_has_permission('audit.view_team'))
    AND module IN ('calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports'))
);

CREATE OR REPLACE FUNCTION public.get_audit_history_page(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id text DEFAULT NULL,
  p_snapshot_at timestamptz DEFAULT NULL,
  p_page_size integer DEFAULT 20,
  p_sort text DEFAULT 'newest'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_from date;
  v_to date;
  v_snapshot timestamptz := least(coalesce(p_snapshot_at, statement_timestamp()), statement_timestamp());
  v_rows jsonb;
  v_count integer;
  v_last_created_at timestamptz;
  v_last_id text;
  v_has_more boolean;
  v_key text;
  v_query text;
-- BEGIN (nested)
  IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object'
    OR octet_length(p_filters::text) > 16384
    OR p_page_size IS NULL OR p_page_size NOT IN (10, 20, 50)
    OR p_sort IS NULL OR p_sort NOT IN ('newest', 'oldest')
    OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL))
    OR ((p_cursor_created_at IS NOT NULL) <> (p_snapshot_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_QUERY_INVALID';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_filters) LOOP
    IF v_key NOT IN ('from', 'to', 'actor', 'brand_id', 'role', 'module', 'action', 'status', 'source', 'entity_type', 'entity_id', 'query') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
    END IF;
    IF v_key IN ('actor', 'brand_id', 'role', 'module', 'action', 'status', 'source')
      AND (jsonb_typeof(p_filters->v_key) IS DISTINCT FROM 'array'
        OR jsonb_array_length(p_filters->v_key) > 50
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_filters->v_key) item WHERE jsonb_typeof(item) IS DISTINCT FROM 'string' OR length(item #>> '{}') > 128)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
    END IF;
  END LOOP;

  IF p_filters ? 'from' AND (p_filters->>'from') !~ '^\d{4}-\d{2}-\d{2}$'
    OR p_filters ? 'to' AND (p_filters->>'to') !~ '^\d{4}-\d{2}-\d{2}$'
    OR length(coalesce(p_filters->>'entity_type', '')) > 128
    OR length(coalesce(p_filters->>'entity_id', '')) > 256
    OR length(coalesce(p_filters->>'query', '')) > 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
  END IF;
-- BEGIN (nested)
    v_to := coalesce(nullif(p_filters->>'to', '')::date, (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
    v_from := coalesce(nullif(p_filters->>'from', '')::date, v_to - 29);
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
  END;
  IF v_to < v_from OR v_to - v_from > 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_DATE_RANGE_INVALID';
  END IF;
  v_query := nullif(btrim(p_filters->>'query'), '');

  IF p_sort = 'newest' THEN
    WITH candidates AS MATERIALIZED (
      SELECT a.* FROM public.audit_logs a
      WHERE a.created_at >= (v_from::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at < ((v_to + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at <= v_snapshot
        AND (p_cursor_created_at IS NULL OR (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id))
        AND (NOT (p_filters ? 'actor') OR jsonb_array_length(p_filters->'actor') = 0 OR a.actor_business_user_id IN (SELECT jsonb_array_elements_text(p_filters->'actor')) OR a.actor_auth_user_id::text IN (SELECT jsonb_array_elements_text(p_filters->'actor')))
        AND (NOT (p_filters ? 'brand_id') OR jsonb_array_length(p_filters->'brand_id') = 0 OR a.after_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.before_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.metadata->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')))
        AND (NOT (p_filters ? 'role') OR jsonb_array_length(p_filters->'role') = 0 OR a.actor_role IN (SELECT jsonb_array_elements_text(p_filters->'role')))
        AND (NOT (p_filters ? 'module') OR jsonb_array_length(p_filters->'module') = 0 OR a.module IN (SELECT jsonb_array_elements_text(p_filters->'module')))
        AND (NOT (p_filters ? 'action') OR jsonb_array_length(p_filters->'action') = 0 OR a.action IN (SELECT jsonb_array_elements_text(p_filters->'action')))
        AND (NOT (p_filters ? 'status') OR jsonb_array_length(p_filters->'status') = 0 OR a.status IN (SELECT jsonb_array_elements_text(p_filters->'status')))
        AND (NOT (p_filters ? 'source') OR jsonb_array_length(p_filters->'source') = 0 OR a.source IN (SELECT jsonb_array_elements_text(p_filters->'source')))
        AND (NOT (p_filters ? 'entity_type') OR a.entity_type = p_filters->>'entity_type')
        AND (NOT (p_filters ? 'entity_id') OR a.entity_id = p_filters->>'entity_id')
        AND (v_query IS NULL OR a.entity_name ILIKE '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\')
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT p_page_size + 1
    ), page_rows AS (
      SELECT * FROM candidates ORDER BY created_at DESC, id DESC LIMIT p_page_size
    ), last_row AS (
      SELECT created_at, id FROM page_rows ORDER BY created_at ASC, id ASC LIMIT 1
    )
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY created_at DESC, id DESC) FROM page_rows), '[]'::jsonb),
      (SELECT count(*)::integer FROM candidates), (SELECT created_at FROM last_row), (SELECT id FROM last_row)
    INTO v_rows, v_count, v_last_created_at, v_last_id;
  ELSE
    WITH candidates AS MATERIALIZED (
      SELECT a.* FROM public.audit_logs a
      WHERE a.created_at >= (v_from::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at < ((v_to + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at <= v_snapshot
        AND (p_cursor_created_at IS NULL OR (a.created_at, a.id) > (p_cursor_created_at, p_cursor_id))
        AND (NOT (p_filters ? 'actor') OR jsonb_array_length(p_filters->'actor') = 0 OR a.actor_business_user_id IN (SELECT jsonb_array_elements_text(p_filters->'actor')) OR a.actor_auth_user_id::text IN (SELECT jsonb_array_elements_text(p_filters->'actor')))
        AND (NOT (p_filters ? 'brand_id') OR jsonb_array_length(p_filters->'brand_id') = 0 OR a.after_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.before_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.metadata->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')))
        AND (NOT (p_filters ? 'role') OR jsonb_array_length(p_filters->'role') = 0 OR a.actor_role IN (SELECT jsonb_array_elements_text(p_filters->'role')))
        AND (NOT (p_filters ? 'module') OR jsonb_array_length(p_filters->'module') = 0 OR a.module IN (SELECT jsonb_array_elements_text(p_filters->'module')))
        AND (NOT (p_filters ? 'action') OR jsonb_array_length(p_filters->'action') = 0 OR a.action IN (SELECT jsonb_array_elements_text(p_filters->'action')))
        AND (NOT (p_filters ? 'status') OR jsonb_array_length(p_filters->'status') = 0 OR a.status IN (SELECT jsonb_array_elements_text(p_filters->'status')))
        AND (NOT (p_filters ? 'source') OR jsonb_array_length(p_filters->'source') = 0 OR a.source IN (SELECT jsonb_array_elements_text(p_filters->'source')))
        AND (NOT (p_filters ? 'entity_type') OR a.entity_type = p_filters->>'entity_type')
        AND (NOT (p_filters ? 'entity_id') OR a.entity_id = p_filters->>'entity_id')
        AND (v_query IS NULL OR a.entity_name ILIKE '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\')
      ORDER BY a.created_at ASC, a.id ASC
      LIMIT p_page_size + 1
    ), page_rows AS (
      SELECT * FROM candidates ORDER BY created_at ASC, id ASC LIMIT p_page_size
    ), last_row AS (
      SELECT created_at, id FROM page_rows ORDER BY created_at DESC, id DESC LIMIT 1
    )
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY created_at ASC, id ASC) FROM page_rows), '[]'::jsonb),
      (SELECT count(*)::integer FROM candidates), (SELECT created_at FROM last_row), (SELECT id FROM last_row)
    INTO v_rows, v_count, v_last_created_at, v_last_id;
  END IF;

  v_has_more := v_count > p_page_size;
  RETURN jsonb_build_object(
    'items', v_rows,
    'has_more', v_has_more,
    'next_cursor', CASE WHEN v_has_more THEN jsonb_build_object('created_at', v_last_created_at, 'id', v_last_id, 'snapshot_at', v_snapshot) ELSE NULL END,
    'page_size', p_page_size,
    'range', jsonb_build_object('from', v_from, 'to', v_to)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_history_page(jsonb, timestamptz, text, timestamptz, integer, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_audit_history_page(jsonb, timestamptz, text, timestamptz, integer, text) TO authenticated;


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261112120000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261112130000_rc19_c6_import_source_reconciliation.sql
 * Version:   20261112130000
 *******************************************************************************/
-- Import Confirm is atomic with its row receipt. Changed rows are never used
-- to mutate an existing Shift until an approved reconciliation contract exists.

create or replace function private.c6_import_changed_fields(p_previous jsonb, p_current jsonb)
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  changed text[] := '{}'::text[];
  field_name text;
-- BEGIN (nested)
  for field_name in
    select key
    from jsonb_object_keys(coalesce(p_previous, '{}'::jsonb) || coalesce(p_current, '{}'::jsonb)) as fields(key)
    where key not in ('row_number', 'warnings', 'errors')
      and p_previous->key is distinct from p_current->key
    order by key
  loop
    changed := array_append(changed, field_name);
  end loop;

  if p_previous->'custom_fields' is distinct from p_current->'custom_fields' then
    if exists (
      select 1
      from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
      full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
        using (key)
      where lower(key) like '%external%shift%'
         or lower(key) like '%shift%id%'
         or lower(key) like '%khung nhân sự%'
         or lower(key) like '%staffing slot%'
         or lower(key) like '%staffing segment%'
    ) then
      if exists (
        select 1
        from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
        full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
          using (key)
        where (lower(key) like '%external%shift%'
            or lower(key) like '%shift%id%')
          and old_field.value is distinct from new_field.value
      ) then changed := array_append(changed, 'external_shift_code'); end if;
      if exists (
        select 1
        from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
        full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
          using (key)
        where (lower(key) like '%khung nhân sự%'
            or lower(key) like '%staffing slot%'
            or lower(key) like '%staffing segment%')
          and old_field.value is distinct from new_field.value
      ) then changed := array_append(changed, 'staffing_segments'); end if;
      if not ('external_shift_code' = any(changed) or 'staffing_segments' = any(changed)) then
        changed := array_append(changed, 'source_custom_fields');
      end if;
    else
      changed := array_append(changed, 'source_custom_fields');
    end if;
  end if;

  return changed;
end;
$$;

alter function private.c6_import_changed_fields(jsonb, jsonb) owner to postgres;
revoke all on function private.c6_import_changed_fields(jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function public.create_schedule_import_shift(
  p_batch_id text,
  p_row_number integer,
  p_data jsonb,
  p_segments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text := private.require_shift_actor(true);
  batch_row public.schedule_import_batches%rowtype;
  import_row public.schedule_import_batch_rows%rowtype;
  previous_row public.schedule_import_batch_rows%rowtype;
  previous_shift public.shifts%rowtype;
  existing_shift_id text;
  slot_count integer;
  exact_slot_count integer;
  ambiguous_slot_count integer;
  created_shift public.shifts%rowtype;
  previous_shift_ids text[];
  changed_fields text[];
  failure text;
  requested_outcome text;
  result jsonb;
-- BEGIN (nested)
  if p_row_number is null or p_row_number < 1 then
    raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or p_segments is null or jsonb_typeof(p_segments) <> 'array' then
    raise exception using errcode = '22023', message = 'IMPORT_PAYLOAD_INVALID';
  end if;

  select * into batch_row
  from public.schedule_import_batches
  where id = p_batch_id
  for update;
  if batch_row.id is null or batch_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if batch_row.created_by is distinct from actor_id then
    raise exception using errcode = '42501', message = 'IMPORT_BATCH_ACTOR_MISMATCH';
  end if;
  if batch_row.status not in ('previewed', 'failed', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(batch_row.source, batch_row.source_name, p_row_number)::text, 0
  ));

  select * into import_row
  from public.schedule_import_batch_rows
  where batch_id = p_batch_id and row_number = p_row_number
  for update;
  if import_row.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_NOT_FOUND';
  end if;

  if import_row.outcome in ('imported', 'warning') then
    select * into created_shift from public.shifts where id = import_row.shift_id;
    if created_shift.id is null or created_shift.import_batch_id is distinct from p_batch_id then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_SHIFT_MISMATCH';
    end if;
    return jsonb_build_object('outcome', import_row.outcome, 'shift', to_jsonb(created_shift), 'idempotent', true);
  elsif import_row.outcome = 'duplicate_skipped' then
    return jsonb_build_object('outcome', 'duplicate_skipped', 'idempotent', true);
  elsif import_row.outcome not in ('pending', 'retryable') or batch_row.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
  end if;

  if coalesce(nullif(p_data->>'brand_id', ''), '') = ''
     or coalesce(nullif(p_data->>'platform_id', ''), '') = '' then
    raise exception using errcode = '22023', message = 'IMPORT_BRAND_PLATFORM_REQUIRED';
  end if;
  if private.current_system_permission() = 'leader'
     and not private.rc19_has_any_leader_brand_scope(p_data->>'brand_id', array['shifts.manage']::text[]) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if not exists (
       select 1 from public.brands b
       where b.id = p_data->>'brand_id'
         and lower(btrim(b.name)) = lower(btrim(import_row.source_row->>'brand_name'))
     ) or not exists (
       select 1 from public.platforms p
       where p.id = p_data->>'platform_id'
         and lower(btrim(p.name)) = lower(btrim(import_row.source_row->>'platform_name'))
     ) then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_IDENTITY_MISMATCH';
  end if;
  if p_data->>'date' is distinct from import_row.source_row->>'date'
     or left(p_data->>'start_time', 5) is distinct from import_row.source_row->>'start_time'
     or left(p_data->>'end_time', 5) is distinct from import_row.source_row->>'end_time' then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_IDENTITY_MISMATCH';
  end if;

  select array_agg(distinct prior.shift_id order by prior.shift_id)
    into previous_shift_ids
  from public.schedule_import_batches prior_batch
  join public.schedule_import_batch_rows prior
    on prior.batch_id = prior_batch.id
  join public.shifts prior_shift
    on prior_shift.id = prior.shift_id
  where prior_batch.source = batch_row.source
    and prior_batch.source_name = batch_row.source_name
    and prior_batch.id <> batch_row.id
    and prior.row_number = p_row_number
    and prior.outcome in ('imported', 'warning')
    and prior.shift_id is not null;

  if coalesce(cardinality(previous_shift_ids), 0) > 1 then
    failure := 'IMPORT_SOURCE_HISTORY_AMBIGUOUS_REVIEW_REQUIRED';
  elsif coalesce(cardinality(previous_shift_ids), 0) = 1 then
    select prior.* into previous_row
    from public.schedule_import_batch_rows prior
    join public.schedule_import_batches prior_batch on prior_batch.id = prior.batch_id
    where prior_batch.source = batch_row.source
      and prior_batch.source_name = batch_row.source_name
      and prior_batch.id <> batch_row.id
      and prior.row_number = p_row_number
      and prior.outcome in ('imported', 'warning')
      and prior.shift_id = previous_shift_ids[1]
    order by prior_batch.confirmed_at desc nulls last, prior_batch.created_at desc, prior.updated_at desc
    limit 1;

    select * into previous_shift from public.shifts where id = previous_shift_ids[1];
    if previous_shift.id is null or not private.can_read_shift(previous_shift.id) then
      failure := 'IMPORT_SOURCE_HISTORY_SCOPE_REVIEW_REQUIRED';
    else
      changed_fields := private.c6_import_changed_fields(previous_row.source_row, import_row.source_row);
      if cardinality(changed_fields) = 0 then
        update public.schedule_import_batch_rows
        set outcome = 'duplicate_skipped', shift_id = null, failure_code = null
        where id = import_row.id and outcome in ('pending', 'retryable');
        perform private.sync_schedule_import_batch_counts(p_batch_id);
        return jsonb_build_object('outcome', 'duplicate_skipped', 'shift_id', previous_shift.id, 'idempotent', false);
      end if;
      failure := 'IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED:' || array_to_string(changed_fields, ',');
    end if;
  end if;

  if failure is null then
    select count(*)::integer,
      count(*) filter (
        where coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
          and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
      )::integer,
      count(*) filter (
        where not (
          (nullif(btrim(s.studio), '') is not null
            and nullif(btrim(p_data->>'studio'), '') is not null
            and lower(btrim(s.studio)) <> lower(btrim(p_data->>'studio')))
          or (nullif(btrim(s.campaign_id), '') is not null
            and nullif(btrim(p_data->>'campaign_id'), '') is not null
            and lower(btrim(s.campaign_id)) <> lower(btrim(p_data->>'campaign_id')))
        )
        and not (
          coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
          and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
        )
      )::integer
    into slot_count, exact_slot_count, ambiguous_slot_count
    from public.shifts s
    where s.deleted_at is null and s.archived_at is null
      and s.brand_id = p_data->>'brand_id'
      and s.platform_id = p_data->>'platform_id'
      and s.date = (p_data->>'date')::date
      and left(s.start_time::text, 5) = left(p_data->>'start_time', 5)
      and left(s.end_time::text, 5) = left(p_data->>'end_time', 5);
    if exact_slot_count > 1 then
      failure := 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED';
    elsif exact_slot_count = 1 and ambiguous_slot_count = 0 then
      select s.id into existing_shift_id from public.shifts s
      where s.deleted_at is null and s.archived_at is null
        and s.brand_id = p_data->>'brand_id'
        and s.platform_id = p_data->>'platform_id'
        and s.date = (p_data->>'date')::date
        and left(s.start_time::text, 5) = left(p_data->>'start_time', 5)
        and left(s.end_time::text, 5) = left(p_data->>'end_time', 5)
        and coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
        and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
      order by s.id limit 1;
      update public.schedule_import_batch_rows
      set outcome = 'duplicate_skipped', shift_id = null, failure_code = null
      where id = import_row.id and outcome in ('pending', 'retryable');
      perform private.sync_schedule_import_batch_counts(p_batch_id);
      return jsonb_build_object('outcome', 'duplicate_skipped', 'shift_id', existing_shift_id, 'idempotent', false);
    elsif ambiguous_slot_count > 0 then
      failure := 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED';
    end if;
  end if;

  if failure is not null then
    update public.schedule_import_batch_rows
    set outcome = 'retryable', shift_id = null, failure_code = left(failure, 200)
    where id = import_row.id and outcome in ('pending', 'retryable');
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
    end if;
    perform private.sync_schedule_import_batch_counts(p_batch_id);
    return jsonb_build_object('outcome', 'retryable', 'failure_code', left(failure, 200), 'changed_fields', to_jsonb(changed_fields));
  end if;

  requested_outcome := case
    when jsonb_typeof(import_row.source_row->'warnings') = 'array'
      and jsonb_array_length(import_row.source_row->'warnings') > 0 then 'warning'
    else 'imported'
  end;
  result := coalesce(p_data, '{}'::jsonb) || jsonb_build_object('import_batch_id', p_batch_id);
  if jsonb_array_length(p_segments) > 0 then
    created_shift := public.create_shift_with_staffing_segments(result, p_segments);
  else
    created_shift := public.create_shift(result);
  end if;

  update public.schedule_import_batch_rows
  set outcome = requested_outcome, shift_id = created_shift.id, failure_code = null
  where id = import_row.id and outcome in ('pending', 'retryable');
  if not found then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
  end if;
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  return jsonb_build_object('outcome', requested_outcome, 'shift', to_jsonb(created_shift), 'idempotent', false);
end;
$$;

alter function public.create_schedule_import_shift(text, integer, jsonb, jsonb) owner to postgres;
revoke all on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) to authenticated;

comment on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) is
  'Atomically creates an imported shift with segments and its row receipt; identical source replays are skipped and changed source rows are held for authorized manual review without mutating operational history.';


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261112130000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261113083000_rc19_c4_audit_dependency.sql
 * Version:   20261113083000
 *******************************************************************************/
-- BEGIN (nested)
DO $migration$
-- BEGIN (nested)
  IF to_regprocedure('private.log_shift_audit(text,text,text,text,text,jsonb,text[])') IS NULL THEN
    EXECUTE $definition$
      CREATE FUNCTION private.log_shift_audit(
        p_module text, p_action text, p_entity_type text, p_entity_id text,
        p_reason text, p_metadata jsonb, p_shift_ids text[]
      ) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
      AS $function$
      DECLARE
        v_actor_id text := private.current_business_user_id();
        v_actor_name text;
        v_actor_role text := private.current_system_permission();
-- BEGIN (nested)
        SELECT full_name INTO v_actor_name FROM public.business_users WHERE id = v_actor_id;
        INSERT INTO public.audit_logs (
          actor_auth_user_id, actor_business_user_id, actor_name, actor_role,
          module, action, entity_type, entity_id, entity_name, after_data,
          reason, metadata, related_records
        ) VALUES (
          auth.uid(), v_actor_id, v_actor_name, v_actor_role,
          p_module, p_action, p_entity_type, p_entity_id, coalesce(p_entity_id, 'unknown'), p_metadata,
          p_reason, coalesce(p_metadata, '{}'::jsonb),
          coalesce((SELECT jsonb_agg(jsonb_build_object('entity_type', 'shift', 'entity_id', shift_id))
            FROM unnest(coalesce(p_shift_ids, ARRAY[]::text[])) shift_id), '[]'::jsonb)
        );
      END;
      $function$
    $definition$;
    REVOKE ALL ON FUNCTION private.log_shift_audit(text,text,text,text,text,jsonb,text[])
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$migration$;
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261113083000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261113084154_rc19_c4_atomic_staffing_replacement.sql
 * Version:   20261113084154
 *******************************************************************************/
-- BEGIN (nested)
DO $guard$
-- BEGIN (nested)
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regclass('public.business_users') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.current_business_user_is_active()') IS NULL
    OR to_regprocedure('private.current_system_permission()') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL
    OR to_regprocedure('public.rbac01_effective_permission(text)') IS NULL
    OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
    OR to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') IS NULL
    OR to_regprocedure('private.log_shift_audit(text,text,text,text,text,jsonb,text[])') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.shift_registrations'::regclass
        AND a.attname = 'staffing_segment_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.oid = 'public.shift_registrations'::regclass AND c.relrowsecurity
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'C4_REPLACEMENT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE TABLE public.rc19_shift_assignment_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_business_user_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL,
  shift_id text NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  staffing_segment_id text NOT NULL REFERENCES public.shift_staffing_segments(id) ON DELETE RESTRICT,
  old_registration_id text NOT NULL REFERENCES public.shift_registrations(id) ON DELETE RESTRICT,
  new_registration_id text NOT NULL UNIQUE REFERENCES public.shift_registrations(id) ON DELETE RESTRICT,
  old_user_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  replacement_user_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  operational_role text NOT NULL CHECK (operational_role IN ('host', 'support', 'technical')),
  old_assignment_snapshot jsonb NOT NULL,
  expected_shift_version integer NOT NULL CHECK (expected_shift_version > 0),
  expected_registration_version integer NOT NULL CHECK (expected_registration_version > 0),
  effective_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  is_emergency boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT rc19_shift_assignment_replacement_actor_key UNIQUE (actor_business_user_id, idempotency_key),
  CONSTRAINT rc19_shift_assignment_replacement_distinct_staff CHECK (old_user_id <> replacement_user_id)
);

CREATE INDEX rc19_shift_assignment_replacements_shift_created_idx
  ON public.rc19_shift_assignment_replacements (shift_id, created_at DESC, id DESC);

ALTER TABLE public.rc19_shift_assignment_replacements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rc19_shift_assignment_replacements FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.replace_shift_assignment(
  p_shift_id text,
  p_staffing_segment_id text,
  p_registration_id text,
  p_replacement_user_id text,
  p_role text,
  p_expected_shift_version integer,
  p_expected_registration_version integer,
  p_effective_at timestamptz,
  p_reason text,
  p_is_emergency boolean,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text;
  v_permission text;
  v_now timestamptz := statement_timestamp();
  v_effective_at timestamptz;
  v_shift public.shifts%ROWTYPE;
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_old public.shift_registrations%ROWTYPE;
  v_old_assignment_snapshot jsonb;
  v_new public.shift_registrations%ROWTYPE;
  v_receipt public.rc19_shift_assignment_replacements%ROWTYPE;
  v_request jsonb;
  v_replacement_id uuid := gen_random_uuid();
  v_active_count integer;
  v_roster jsonb;
  v_replayed boolean := false;
-- BEGIN (nested)
  v_actor_id := private.require_shift_actor(true);
  v_permission := private.current_system_permission();

  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active()
    OR v_permission NOT IN ('admin', 'leader') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTOR_NOT_AUTHORIZED';
  END IF;
  IF NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STAFFING_PERMISSION_REQUIRED';
  END IF;
  IF p_is_emergency IS NULL OR (p_is_emergency AND v_permission <> 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EMERGENCY_REPLACEMENT_ADMIN_ONLY';
  END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = ''
    OR p_staffing_segment_id IS NULL OR btrim(p_staffing_segment_id) = ''
    OR p_registration_id IS NULL OR btrim(p_registration_id) = ''
    OR p_replacement_user_id IS NULL OR btrim(p_replacement_user_id) = ''
    OR p_role IS NULL OR p_role NOT IN ('host', 'support', 'technical')
    OR p_expected_shift_version IS NULL OR p_expected_shift_version < 1
    OR p_expected_registration_version IS NULL OR p_expected_registration_version < 1
    OR p_effective_at IS NULL
    OR p_idempotency_key IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_REQUEST_INVALID';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  IF v_permission = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(v_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;

  SELECT * INTO v_segment
  FROM public.shift_staffing_segments
  WHERE id = p_staffing_segment_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_SHIFT_MISMATCH';
  END IF;

  v_request := jsonb_build_object(
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'registration_id', p_registration_id,
    'replacement_user_id', p_replacement_user_id,
    'role', p_role,
    'expected_shift_version', p_expected_shift_version,
    'expected_registration_version', p_expected_registration_version,
    'effective_at_epoch', extract(epoch FROM p_effective_at)::numeric,
    'reason', btrim(p_reason),
    'is_emergency', p_is_emergency
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id || ':' || p_idempotency_key::text, 91732)
  );
  SELECT * INTO v_receipt
  FROM public.rc19_shift_assignment_replacements
  WHERE actor_business_user_id = v_actor_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_payload IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT * INTO v_new FROM public.shift_registrations WHERE id = v_receipt.new_registration_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'registration_id', r.id,
      'user_id', r.user_id,
      'role', r.operational_role,
      'status', r.status,
      'version', r.version
    ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
    INTO v_roster
    FROM public.shift_registrations r
    WHERE r.staffing_segment_id = p_staffing_segment_id
      AND r.status IN ('approved', 'manually_assigned');
    SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;
    v_replayed := true;
    RETURN jsonb_build_object(
      'replacement_id', v_receipt.id,
      'shift_id', p_shift_id,
      'staffing_segment_id', p_staffing_segment_id,
      'old_registration_id', v_receipt.old_registration_id,
      'registration', jsonb_build_object(
        'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
        'operational_role', v_new.operational_role, 'status', v_new.status,
        'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
        'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
        'review_notes', v_new.review_notes, 'version', v_new.version
      ),
      'effective_at', v_receipt.effective_at,
      'shift_version', v_shift.version,
      'roster', v_roster,
      'replayed', v_replayed
    );
  END IF;

  IF v_shift.version <> p_expected_shift_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SHIFT_VERSION_CONFLICT';
  END IF;
  IF v_shift.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_REPLACEABLE';
  END IF;
  IF NOT p_is_emergency AND v_shift.status NOT IN ('scheduled', 'preparing') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMERGENCY_REPLACEMENT_REQUIRED';
  END IF;

  IF p_is_emergency THEN
    IF p_effective_at > v_now OR p_effective_at < v_segment.start_at OR p_effective_at >= v_segment.end_at THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT';
    END IF;
    v_effective_at := p_effective_at;
  ELSE
    IF p_effective_at < v_now - interval '30 seconds'
      OR p_effective_at > v_now + interval '30 seconds' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_EFFECTIVE_TIME_INVALID';
    END IF;
    v_effective_at := v_now;
  END IF;

  SELECT * INTO v_old
  FROM public.shift_registrations
  WHERE id = p_registration_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_FOUND';
  END IF;
  IF v_old.version <> p_expected_registration_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_VERSION_CONFLICT';
  END IF;
  IF v_old.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_ACTIVE';
  END IF;
  IF v_old.staffing_segment_id IS DISTINCT FROM p_staffing_segment_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_SEGMENT_MISMATCH';
  END IF;
  IF v_old.operational_role IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_ROLE_MISMATCH';
  END IF;
  IF v_old.user_id = p_replacement_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_TARGET_IS_CURRENT_STAFF';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_user_id, 91731));
  PERFORM private.assert_shift_role_eligibility(p_replacement_user_id, p_role);
  PERFORM private.assert_no_shift_registration_conflict(p_replacement_user_id, v_shift, p_role, p_registration_id);

  SELECT count(*) INTO v_active_count
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.operational_role = p_role
    AND r.status IN ('approved', 'manually_assigned')
    AND r.id <> p_registration_id;
  IF v_active_count + 1 > (CASE p_role
    WHEN 'host' THEN v_segment.required_host_count
    WHEN 'support' THEN v_segment.required_support_count
    ELSE v_segment.required_technical_count
  END) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_CAPACITY_EXCEEDED';
  END IF;

  v_old_assignment_snapshot := jsonb_build_object(
    'id', v_old.id, 'user_id', v_old.user_id, 'status', v_old.status,
    'operational_role', v_old.operational_role, 'source', v_old.source,
    'staffing_segment_id', v_old.staffing_segment_id, 'version', v_old.version,
    'reviewed_by', v_old.reviewed_by, 'reviewed_at', v_old.reviewed_at,
    'review_notes', v_old.review_notes, 'cancelled_at', v_old.cancelled_at
  );

  UPDATE public.shift_registrations
  SET status = 'removed',
      reviewed_by = v_actor_id,
      reviewed_at = v_now,
      review_notes = concat_ws(E'\n', nullif(btrim(review_notes), ''), 'REPLACED: ' || btrim(p_reason)),
      cancelled_at = v_now
  WHERE id = v_old.id
  RETURNING * INTO v_old;

  INSERT INTO public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    requested_at, reviewed_by, reviewed_at, review_notes, staffing_segment_id
  ) VALUES (
    p_shift_id, p_replacement_user_id, p_role, 'manually_assigned', 'manual_assignment',
    v_now, v_actor_id, v_now, btrim(p_reason), p_staffing_segment_id
  ) RETURNING * INTO v_new;

  UPDATE public.shifts SET updated_at = v_now, updated_by = v_actor_id WHERE id = p_shift_id;
  SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;

  INSERT INTO public.rc19_shift_assignment_replacements (
    id, actor_business_user_id, idempotency_key, request_payload,
    shift_id, staffing_segment_id, old_registration_id, new_registration_id,
    old_user_id, replacement_user_id, operational_role, old_assignment_snapshot,
    expected_shift_version, expected_registration_version, effective_at, reason, is_emergency
  ) VALUES (
    v_replacement_id, v_actor_id, p_idempotency_key, v_request,
    p_shift_id, p_staffing_segment_id, v_old.id, v_new.id,
    v_old.user_id, p_replacement_user_id, p_role,
    v_old_assignment_snapshot,
    p_expected_shift_version, p_expected_registration_version, v_effective_at,
    btrim(p_reason), p_is_emergency
  ) RETURNING * INTO v_receipt;

  PERFORM private.log_shift_audit(
    'staffing', 'assignment_replaced', 'shift_registration', v_new.id,
    btrim(p_reason),
    jsonb_build_object(
      'replacement_id', v_receipt.id,
      'old_registration_id', v_old.id,
      'new_registration_id', v_new.id,
      'staffing_segment_id', p_staffing_segment_id,
      'operational_role', p_role,
      'effective_at', v_effective_at,
      'is_emergency', p_is_emergency,
      'expected_shift_version', p_expected_shift_version,
      'expected_registration_version', p_expected_registration_version
    ),
    ARRAY[p_shift_id]::text[]
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'registration_id', r.id,
    'user_id', r.user_id,
    'role', r.operational_role,
    'status', r.status,
    'version', r.version
  ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
  INTO v_roster
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.status IN ('approved', 'manually_assigned');

  RETURN jsonb_build_object(
    'replacement_id', v_receipt.id,
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'old_registration_id', v_old.id,
    'registration', jsonb_build_object(
      'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
      'operational_role', v_new.operational_role, 'status', v_new.status,
      'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
      'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
      'review_notes', v_new.review_notes, 'version', v_new.version
    ),
    'effective_at', v_effective_at,
    'shift_version', v_shift.version,
    'roster', v_roster,
    'replayed', false
  );
END;
$$;

ALTER FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) TO authenticated;

COMMENT ON TABLE public.rc19_shift_assignment_replacements IS
  'Private idempotency and immutable history receipt for atomic C4 shift staffing replacement.';
COMMENT ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) IS
  'Atomically replaces one active staffing-segment registration; derives actor and scope from the authenticated request.';
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261113084154') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261115120000_rc19_w4_legacy_segment_compatibility.sql
 * Version:   20261115120000
 *******************************************************************************/
-- BEGIN (nested)
DO $guard$
-- BEGIN (nested)
  IF to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('private.c511_guard_segment_registration()') IS NULL
    OR to_regprocedure('public.replace_shift_assignment(text,text,text,text,text,integer,integer,timestamp with time zone,text,boolean,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_LEGACY_SEGMENT_COMPATIBILITY_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION private.c511_guard_segment_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_segment_count integer;
  v_role_segment_count integer;
  v_filled integer;
  v_capacity smallint;
-- BEGIN (nested)
  IF NEW.status IN ('approved', 'manually_assigned')
    AND private.current_system_permission() = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(
      (SELECT s.brand_id FROM public.shifts s WHERE s.id = NEW.shift_id),
      ARRAY['shifts.manage']::text[]
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;

  IF NEW.staffing_segment_id IS NULL THEN
    IF TG_OP <> 'INSERT' THEN
      RETURN NEW;
    END IF;

    SELECT s.* INTO v_shift
    FROM public.shifts s
    WHERE s.id = NEW.shift_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    SELECT count(*), count(*) FILTER (WHERE CASE NEW.operational_role
      WHEN 'host' THEN s.required_host_count
      WHEN 'support' THEN s.required_support_count
      WHEN 'technical' THEN s.required_technical_count
      ELSE 0
    END > 0)
    INTO v_segment_count, v_role_segment_count
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = NEW.shift_id;

    IF v_segment_count = 0 THEN
      RETURN NEW;
    END IF;
    IF v_role_segment_count = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_ROLE_INCOMPATIBLE';
    END IF;
    IF v_role_segment_count > 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STAFFING_SEGMENT_SELECTION_REQUIRED';
    END IF;

    SELECT s.* INTO v_segment
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = NEW.shift_id
      AND CASE NEW.operational_role
        WHEN 'host' THEN s.required_host_count
        WHEN 'support' THEN s.required_support_count
        WHEN 'technical' THEN s.required_technical_count
        ELSE 0
      END > 0;
    NEW.staffing_segment_id := v_segment.id;
  ELSE
    SELECT s.* INTO v_segment
    FROM public.shift_staffing_segments s
    WHERE s.id = NEW.staffing_segment_id AND s.shift_id = NEW.shift_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'STAFFING_SEGMENT_SHIFT_MISMATCH';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.staffing_segment_id IS NOT NULL
    AND OLD.staffing_segment_id <> NEW.staffing_segment_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_REGISTRATION_IMMUTABLE';
  END IF;

  IF NEW.status IN ('approved', 'manually_assigned') THEN
    v_capacity := CASE NEW.operational_role
      WHEN 'host' THEN v_segment.required_host_count
      WHEN 'support' THEN v_segment.required_support_count
      WHEN 'technical' THEN v_segment.required_technical_count
      ELSE NULL
    END;
    IF v_capacity IS NULL OR v_capacity <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_ROLE_INCOMPATIBLE';
    END IF;
    SELECT count(*) INTO v_filled
    FROM public.shift_registrations r
    WHERE r.staffing_segment_id = v_segment.id
      AND r.operational_role = NEW.operational_role
      AND r.status IN ('approved', 'manually_assigned')
      AND r.id <> NEW.id;
    IF v_filled >= v_capacity THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_FULL';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION private.c511_guard_segment_registration() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.c511_guard_segment_registration() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.replace_shift_assignment(
  p_shift_id text,
  p_staffing_segment_id text,
  p_registration_id text,
  p_replacement_user_id text,
  p_role text,
  p_expected_shift_version integer,
  p_expected_registration_version integer,
  p_effective_at timestamptz,
  p_reason text,
  p_is_emergency boolean,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text;
  v_permission text;
  v_now timestamptz := statement_timestamp();
  v_effective_at timestamptz;
  v_shift public.shifts%ROWTYPE;
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_old public.shift_registrations%ROWTYPE;
  v_old_assignment_snapshot jsonb;
  v_new public.shift_registrations%ROWTYPE;
  v_receipt public.rc19_shift_assignment_replacements%ROWTYPE;
  v_request jsonb;
  v_replacement_id uuid := gen_random_uuid();
  v_active_count integer;
  v_roster jsonb;
  v_replayed boolean := false;
-- BEGIN (nested)
  v_actor_id := private.require_shift_actor(true);
  v_permission := private.current_system_permission();

  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active()
    OR v_permission NOT IN ('admin', 'leader') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTOR_NOT_AUTHORIZED';
  END IF;
  IF NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STAFFING_PERMISSION_REQUIRED';
  END IF;
  IF p_is_emergency IS NULL OR (p_is_emergency AND v_permission <> 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EMERGENCY_REPLACEMENT_ADMIN_ONLY';
  END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = ''
    OR p_staffing_segment_id IS NULL OR btrim(p_staffing_segment_id) = ''
    OR p_registration_id IS NULL OR btrim(p_registration_id) = ''
    OR p_replacement_user_id IS NULL OR btrim(p_replacement_user_id) = ''
    OR p_role IS NULL OR p_role NOT IN ('host', 'support', 'technical')
    OR p_expected_shift_version IS NULL OR p_expected_shift_version < 1
    OR p_expected_registration_version IS NULL OR p_expected_registration_version < 1
    OR p_effective_at IS NULL
    OR p_idempotency_key IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_REQUEST_INVALID';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  IF v_permission = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(v_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;

  SELECT * INTO v_segment
  FROM public.shift_staffing_segments
  WHERE id = p_staffing_segment_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_SHIFT_MISMATCH';
  END IF;

  v_request := jsonb_build_object(
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'registration_id', p_registration_id,
    'replacement_user_id', p_replacement_user_id,
    'role', p_role,
    'expected_shift_version', p_expected_shift_version,
    'expected_registration_version', p_expected_registration_version,
    'effective_at_epoch', extract(epoch FROM p_effective_at)::numeric,
    'reason', btrim(p_reason),
    'is_emergency', p_is_emergency
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id || ':' || p_idempotency_key::text, 91732)
  );
  SELECT * INTO v_receipt
  FROM public.rc19_shift_assignment_replacements
  WHERE actor_business_user_id = v_actor_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_payload IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT * INTO v_new FROM public.shift_registrations WHERE id = v_receipt.new_registration_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'registration_id', r.id,
      'user_id', r.user_id,
      'role', r.operational_role,
      'status', r.status,
      'version', r.version
    ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
    INTO v_roster
    FROM public.shift_registrations r
    WHERE r.staffing_segment_id = p_staffing_segment_id
      AND r.status IN ('approved', 'manually_assigned');
    SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;
    v_replayed := true;
    RETURN jsonb_build_object(
      'replacement_id', v_receipt.id,
      'shift_id', p_shift_id,
      'staffing_segment_id', p_staffing_segment_id,
      'old_registration_id', v_receipt.old_registration_id,
      'registration', jsonb_build_object(
        'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
        'operational_role', v_new.operational_role, 'status', v_new.status,
        'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
        'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
        'review_notes', v_new.review_notes, 'version', v_new.version
      ),
      'effective_at', v_receipt.effective_at,
      'shift_version', v_shift.version,
      'roster', v_roster,
      'replayed', v_replayed
    );
  END IF;

  IF v_shift.version <> p_expected_shift_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SHIFT_VERSION_CONFLICT';
  END IF;
  IF v_shift.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_REPLACEABLE';
  END IF;
  IF NOT p_is_emergency AND v_shift.status NOT IN ('scheduled', 'preparing') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMERGENCY_REPLACEMENT_REQUIRED';
  END IF;

  IF p_is_emergency THEN
    IF p_effective_at > v_now OR p_effective_at < v_segment.start_at OR p_effective_at >= v_segment.end_at THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT';
    END IF;
    v_effective_at := p_effective_at;
  ELSE
    IF p_effective_at < v_now - interval '30 seconds'
      OR p_effective_at > v_now + interval '30 seconds' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_EFFECTIVE_TIME_INVALID';
    END IF;
    v_effective_at := v_now;
  END IF;

  SELECT * INTO v_old
  FROM public.shift_registrations
  WHERE id = p_registration_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_FOUND';
  END IF;
  IF v_old.version <> p_expected_registration_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_VERSION_CONFLICT';
  END IF;
  IF v_old.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_ACTIVE';
  END IF;
  IF v_old.staffing_segment_id IS NOT NULL
    AND v_old.staffing_segment_id IS DISTINCT FROM p_staffing_segment_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_SEGMENT_MISMATCH';
  END IF;
  IF v_old.staffing_segment_id IS NULL AND (CASE p_role
    WHEN 'host' THEN v_segment.required_host_count
    WHEN 'support' THEN v_segment.required_support_count
    ELSE v_segment.required_technical_count
  END) <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_SEGMENT_ROLE_INCOMPATIBLE';
  END IF;
  IF v_old.operational_role IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_ROLE_MISMATCH';
  END IF;
  IF v_old.user_id = p_replacement_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_TARGET_IS_CURRENT_STAFF';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_user_id, 91731));
  PERFORM private.assert_shift_role_eligibility(p_replacement_user_id, p_role);
  PERFORM private.assert_no_shift_registration_conflict(p_replacement_user_id, v_shift, p_role, p_registration_id);

  SELECT count(*) INTO v_active_count
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.operational_role = p_role
    AND r.status IN ('approved', 'manually_assigned')
    AND r.id <> p_registration_id;
  IF v_active_count + 1 > (CASE p_role
    WHEN 'host' THEN v_segment.required_host_count
    WHEN 'support' THEN v_segment.required_support_count
    ELSE v_segment.required_technical_count
  END) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_CAPACITY_EXCEEDED';
  END IF;

  v_old_assignment_snapshot := jsonb_build_object(
    'id', v_old.id, 'user_id', v_old.user_id, 'status', v_old.status,
    'operational_role', v_old.operational_role, 'source', v_old.source,
    'staffing_segment_id', v_old.staffing_segment_id, 'version', v_old.version,
    'reviewed_by', v_old.reviewed_by, 'reviewed_at', v_old.reviewed_at,
    'review_notes', v_old.review_notes, 'cancelled_at', v_old.cancelled_at
  );

  UPDATE public.shift_registrations
  SET status = 'removed',
      reviewed_by = v_actor_id,
      reviewed_at = v_now,
      review_notes = concat_ws(E'\n', nullif(btrim(review_notes), ''), 'REPLACED: ' || btrim(p_reason)),
      cancelled_at = v_now
  WHERE id = v_old.id
  RETURNING * INTO v_old;

  INSERT INTO public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    requested_at, reviewed_by, reviewed_at, review_notes, staffing_segment_id
  ) VALUES (
    p_shift_id, p_replacement_user_id, p_role, 'manually_assigned', 'manual_assignment',
    v_now, v_actor_id, v_now, btrim(p_reason), p_staffing_segment_id
  ) RETURNING * INTO v_new;

  UPDATE public.shifts SET updated_at = v_now, updated_by = v_actor_id WHERE id = p_shift_id;
  SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;

  INSERT INTO public.rc19_shift_assignment_replacements (
    id, actor_business_user_id, idempotency_key, request_payload,
    shift_id, staffing_segment_id, old_registration_id, new_registration_id,
    old_user_id, replacement_user_id, operational_role, old_assignment_snapshot,
    expected_shift_version, expected_registration_version, effective_at, reason, is_emergency
  ) VALUES (
    v_replacement_id, v_actor_id, p_idempotency_key, v_request,
    p_shift_id, p_staffing_segment_id, v_old.id, v_new.id,
    v_old.user_id, p_replacement_user_id, p_role,
    v_old_assignment_snapshot,
    p_expected_shift_version, p_expected_registration_version, v_effective_at,
    btrim(p_reason), p_is_emergency
  ) RETURNING * INTO v_receipt;

  PERFORM private.log_shift_audit(
    'staffing', 'assignment_replaced', 'shift_registration', v_new.id,
    btrim(p_reason),
    jsonb_build_object(
      'replacement_id', v_receipt.id,
      'old_registration_id', v_old.id,
      'new_registration_id', v_new.id,
      'staffing_segment_id', p_staffing_segment_id,
      'operational_role', p_role,
      'effective_at', v_effective_at,
      'is_emergency', p_is_emergency,
      'legacy_parent_assignment_mapped', v_old.staffing_segment_id IS NULL,
      'expected_shift_version', p_expected_shift_version,
      'expected_registration_version', p_expected_registration_version
    ),
    ARRAY[p_shift_id]::text[]
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'registration_id', r.id,
    'user_id', r.user_id,
    'role', r.operational_role,
    'status', r.status,
    'version', r.version
  ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
  INTO v_roster
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.status IN ('approved', 'manually_assigned');

  RETURN jsonb_build_object(
    'replacement_id', v_receipt.id,
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'old_registration_id', v_old.id,
    'registration', jsonb_build_object(
      'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
      'operational_role', v_new.operational_role, 'status', v_new.status,
      'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
      'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
      'review_notes', v_new.review_notes, 'version', v_new.version
    ),
    'effective_at', v_effective_at,
    'shift_version', v_shift.version,
    'roster', v_roster,
    'replayed', false
  );
END;
$$;
ALTER FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) TO authenticated;
COMMENT ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) IS 'Atomically replaces segment-linked assignments and permits an authorized explicit segment choice for legacy parent-level assignments without rewriting the original row.';
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261115120000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261115130000_rc19_w4_segmented_manual_assignment.sql
 * Version:   20261115130000
 *******************************************************************************/
-- BEGIN (nested)
DO $guard$
-- BEGIN (nested)
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
    OR to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') IS NULL
    OR to_regprocedure('public.rbac01_effective_permission(text)') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL
    OR to_regprocedure('private.refresh_shift_registration_lock(text,boolean)') IS NULL
    OR to_regprocedure('private.assert_expected_version(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SEGMENT_ASSIGNMENT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION private.insert_manual_shift_assignment_to_segment(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_actor_id text,
  p_notes text,
  p_staffing_segment_id text
)
RETURNS public.shift_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_shift public.shifts;
  created_registration public.shift_registrations;
-- BEGIN (nested)
  SELECT * INTO target_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF target_shift.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;
  IF target_shift.status <> 'scheduled' OR target_shift.registration_locked THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_OPEN';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id, 91731));
  PERFORM private.assert_shift_role_eligibility(p_user_id, p_role);
  PERFORM private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, NULL);

  INSERT INTO public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    reviewed_by, reviewed_at, review_notes, staffing_segment_id
  ) VALUES (
    p_shift_id, p_user_id, p_role, 'manually_assigned', 'manual_assignment',
    p_actor_id, statement_timestamp(), p_notes, p_staffing_segment_id
  ) RETURNING * INTO created_registration;

  PERFORM private.refresh_shift_registration_lock(p_shift_id, false);
  RETURN created_registration;
END;
$$;
ALTER FUNCTION private.insert_manual_shift_assignment_to_segment(text,text,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.insert_manual_shift_assignment_to_segment(text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manual_assign_shift_staff_to_segment(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_notes text,
  p_expected_version integer,
  p_staffing_segment_id text
)
RETURNS public.shift_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text;
  target_shift public.shifts;
  current_version integer;
-- BEGIN (nested)
  actor_id := private.require_shift_actor(true);
  IF NOT private.current_business_user_is_active()
    OR NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STAFFING_PERMISSION_REQUIRED';
  END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = '' OR p_user_id IS NULL OR btrim(p_user_id) = ''
    OR p_staffing_segment_id IS NULL OR btrim(p_staffing_segment_id) = ''
    OR p_role IS NULL OR p_role NOT IN ('host','support','technical') OR p_expected_version IS NULL
    OR p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SEGMENT_ASSIGNMENT_REQUEST_INVALID';
  END IF;

  SELECT * INTO target_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;
  IF private.current_system_permission() = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(target_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;
  current_version := target_shift.version;
  PERFORM private.assert_expected_version('Shift', p_expected_version, current_version);

  RETURN private.insert_manual_shift_assignment_to_segment(
    p_shift_id, p_user_id, p_role, actor_id, p_notes, p_staffing_segment_id
  );
END;
$$;
ALTER FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text)
  TO authenticated;
COMMENT ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text) IS
  'Assigns staff to an explicitly selected persisted staffing segment with actor, permission, Brand, version, qualification, availability and segment-capacity checks.';
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261115130000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261115140000_rc19_w4_pass_swap_segment_preservation.sql
 * Version:   20261115140000
 *******************************************************************************/
-- BEGIN (nested)
DO $guard$
-- BEGIN (nested)
  IF to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('public.approve_shift_swap_request(text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='W4_PASS_SWAP_SEGMENT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;
create or replace function public.approve_shift_swap_request(p_request_id text, p_notes text default null)
returns public.swap_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  request_row public.swap_requests;
  source_registration public.shift_registrations;
  counterpart_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  requester public.business_users;
  participant public.business_users;
  approved_history jsonb;
  completed_history jsonb;
  now_at timestamptz := statement_timestamp();
  new_target_reg_id text := gen_random_uuid()::text;
  new_source_reg_id text := gen_random_uuid()::text;
  new_replacement_reg_id text := gen_random_uuid()::text;
-- BEGIN (nested)
  actor_id := private.require_shift_actor(true);
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY'; end if;
  if request_row.status <> 'accepted' then raise exception using errcode = 'P0001', message = 'SWAP_NOT_ACCEPTED'; end if;

  perform private.lock_swap_registrations(array_remove(array[
    request_row.source_registration_id,
    request_row.counterpart_registration_id
  ]::text[], null));
  perform private.lock_swap_shifts(array_remove(array[
    request_row.source_shift_id,
    coalesce(request_row.target_shift_id, request_row.source_shift_id)
  ]::text[], null));
  perform private.lock_swap_rows(array_remove(array[
    'user:' || request_row.requester_id,
    'user:' || request_row.counterpart_id,
    'user:' || request_row.replacement_staff_id
  ]::text[], null));
  perform private.lock_swap_users(array_remove(array[
    request_row.requester_id,
    request_row.counterpart_id,
    request_row.replacement_staff_id
  ]::text[], null));

  select * into source_registration from public.shift_registrations where id = request_row.source_registration_id;
  if source_registration.id is null or source_registration.status not in ('approved', 'manually_assigned') then
    raise exception using errcode = 'P0001', message = 'SOURCE_STALE';
  end if;
  if source_registration.user_id <> request_row.requester_id
     or source_registration.shift_id <> request_row.source_shift_id
     or source_registration.operational_role <> request_row.operational_role then
    raise exception using errcode = 'P0001', message = 'SOURCE_OWNER_MISMATCH';
  end if;
  select * into source_shift from public.shifts where id = request_row.source_shift_id;
  select * into target_shift from public.shifts where id = coalesce(request_row.target_shift_id, request_row.source_shift_id);
  if source_shift.id is null or target_shift.id is null
     or source_shift.deleted_at is not null or source_shift.archived_at is not null
     or target_shift.deleted_at is not null or target_shift.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'SHIFT_STALE';
  end if;
  if source_shift.status <> 'scheduled' or target_shift.status <> 'scheduled' then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_SCHEDULED';
  end if;

  -- Issue #93: Validation on Approval Timing
  if request_row.mode = 'replacement' then
    -- Ordinary PASS cannot be approved during or after live
    if now_at >= source_shift.start_at then
      raise exception using errcode = 'P0001', message = 'PASS_DURING_LIVE_NOT_ALLOWED';
    end if;

    -- Campaign PASS MUST be approved at least 24 hours (1440 minutes) before live start
    -- QUY TẮC: Ca có campaign_id luôn là ca Campaign, kể cả khi campaign đã archived.
    -- Campaign archived KHÔNG BAO GIỜ hạ cấp thành ca Daily!
    if source_shift.campaign_id is not null
       and btrim(source_shift.campaign_id) <> ''
       and lower(btrim(source_shift.campaign_id)) <> 'none' then
      if now_at > (source_shift.start_at - interval '24 hours') then
        raise exception using errcode = 'P0001', message = 'CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED';
      end if;
    end if;
  else
    -- Exchange cannot be approved during live
    if now_at >= source_shift.start_at or now_at >= target_shift.start_at then
      raise exception using errcode = 'P0001', message = 'EXCHANGE_DURING_LIVE_NOT_ALLOWED';
    end if;
  end if;

  select * into requester from public.business_users where id = request_row.requester_id;
  if requester.id is null or requester.status <> 'active' or requester.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'REQUESTER_INACTIVE';
  end if;
  perform private.assert_shift_role_eligibility(requester.id, request_row.operational_role);

  if request_row.mode = 'replacement' then
    if request_row.replacement_staff_id is null or request_row.replacement_staff_id = requester.id then
      raise exception using errcode = '22023', message = 'REPLACEMENT_MISSING';
    end if;
    select * into participant from public.business_users where id = request_row.replacement_staff_id;
    if participant.id is null or participant.status <> 'active' or participant.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_INACTIVE';
    end if;
    if request_row.responded_by <> participant.id then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_ACCEPTANCE_STALE';
    end if;
    perform private.assert_shift_role_eligibility(participant.id, request_row.operational_role);
    if exists (
      select 1 from public.shift_registrations
      where shift_id = source_shift.id and user_id = participant.id
        and status in ('approved', 'manually_assigned')
    ) then
      raise exception using errcode = '23505', message = 'REPLACEMENT_ALREADY_ASSIGNED';
    end if;
    perform private.assert_shift_capacity(source_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(participant.id, source_shift, request_row.operational_role, null);

    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id = source_registration.id;

    insert into public.shift_registrations (
      id, shift_id, user_id, operational_role, status, source,
      requested_at, reviewed_by, reviewed_at, created_at, updated_at, staffing_segment_id
    ) values (
      new_replacement_reg_id, source_shift.id, participant.id, request_row.operational_role,
      'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, source_registration.staffing_segment_id
    );
  else
    select * into counterpart_registration
    from public.shift_registrations
    where id = request_row.counterpart_registration_id;
    if counterpart_registration.id is null or counterpart_registration.status not in ('approved', 'manually_assigned') then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_STALE';
    end if;
    if counterpart_registration.shift_id <> target_shift.id
       or counterpart_registration.operational_role <> request_row.operational_role
       or counterpart_registration.user_id <> request_row.counterpart_id
       or counterpart_registration.user_id = requester.id then
      raise exception using errcode = '22023', message = 'COUNTERPART_MISMATCH';
    end if;
    select * into participant from public.business_users where id = request_row.counterpart_id;
    if participant.id is null or participant.status <> 'active' or participant.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_INACTIVE';
    end if;
    if request_row.responded_by <> participant.id then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_ACCEPTANCE_STALE';
    end if;
    perform private.assert_shift_role_eligibility(participant.id, request_row.operational_role);
    if exists (
      select 1 from public.swap_requests
      where counterpart_registration_id = counterpart_registration.id
        and id <> request_row.id
        and status in ('pending', 'accepted', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'DUPLICATE_COUNTERPART_SWAP';
    end if;
    perform private.assert_shift_capacity(target_shift, request_row.operational_role, counterpart_registration.id);
    perform private.assert_shift_capacity(source_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(requester.id, target_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(participant.id, source_shift, request_row.operational_role, counterpart_registration.id);

    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id in (source_registration.id, counterpart_registration.id);

    insert into public.shift_registrations (
      id, shift_id, user_id, operational_role, status, source,
      requested_at, reviewed_by, reviewed_at, created_at, updated_at, staffing_segment_id
    ) values
      (new_target_reg_id, target_shift.id, requester.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, counterpart_registration.staffing_segment_id),
      (new_source_reg_id, source_shift.id, participant.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, source_registration.staffing_segment_id);
  end if;

  approved_history := jsonb_build_object(
    'action', 'approved',
    'actor_id', actor_id,
    'at', to_char(now_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'mode', request_row.mode,
    'from_status', 'accepted',
    'to_status', 'approved',
    'notes', p_notes,
    'source_shift_id', source_shift.id,
    'target_shift_id', case when request_row.mode = 'exchange' then target_shift.id else null end
  );
  completed_history := jsonb_build_object(
    'action', 'completed',
    'actor_id', actor_id,
    'at', to_char(now_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'mode', request_row.mode,
    'from_status', 'approved',
    'to_status', 'completed',
    'notes', p_notes,
    'source_shift_id', source_shift.id,
    'target_shift_id', case when request_row.mode = 'exchange' then target_shift.id else null end
  );

  update public.swap_requests
  set status = 'approved',
      approved_by = actor_id,
      approved_at = now_at,
      updated_at = now_at,
      version = coalesce(version, 1) + 1,
      approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(approved_history)
  where id = request_row.id
  returning * into request_row;

  update public.swap_requests
  set status = 'completed',
      completed_at = now_at,
      updated_at = now_at,
      version = coalesce(version, 1) + 1,
      approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(completed_history)
  where id = request_row.id
  returning * into request_row;

  perform private.log_shift_audit(
    'swaps', 'approve', 'swap_request', request_row.id,
    'Swap approved & completed: ' || request_row.mode,
    jsonb_build_object('request_id', request_row.id, 'mode', request_row.mode),
    array_remove(array[source_shift.id, case when request_row.mode = 'exchange' then target_shift.id end], null)
  );

  return request_row;
end;
$$;
ALTER FUNCTION public.approve_shift_swap_request(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_shift_swap_request(text,text) TO authenticated;
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261115140000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261115174231_rc19_w4_retire_unguarded_swap_approval.sql
 * Version:   20261115174231
 *******************************************************************************/
-- BEGIN (nested)
DO $guard$
-- BEGIN (nested)
  IF to_regprocedure('public.approve_shift_swap_request(text,text)') IS NULL
    OR to_regprocedure('public.approve_shift_swap_request(text,text,integer)') IS NULL
    OR to_regprocedure('private.assert_expected_version(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_APPROVAL_VERSION_GUARD_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.approve_shift_swap_request(
  p_request_id text,
  p_notes text,
  p_expected_version integer
)
RETURNS public.swap_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_version integer;
-- BEGIN (nested)
  SELECT version INTO current_version
  FROM public.swap_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF current_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_NOT_FOUND';
  END IF;

  PERFORM private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  RETURN public.approve_shift_swap_request(p_request_id, p_notes);
END;
$$;

ALTER FUNCTION public.approve_shift_swap_request(text, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text, text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_shift_swap_request(text, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text, text) FROM PUBLIC, anon, authenticated, service_role;

DO $verify$
-- BEGIN (nested)
  IF NOT has_function_privilege('authenticated', 'public.approve_shift_swap_request(text,text,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.approve_shift_swap_request(text,text,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.approve_shift_swap_request(text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.approve_shift_swap_request(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_APPROVAL_VERSION_GUARD_PRIVILEGE_CHECK_FAILED';
  END IF;
END;
$verify$;
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261115174231') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261116120000_rc19_w4_swap_preflight_and_segment_capacity.sql
 * Version:   20261116120000
 *******************************************************************************/
-- BEGIN (nested)
DO $guard$
-- BEGIN (nested)
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regclass('public.swap_requests') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
    OR to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') IS NULL
    OR to_regprocedure('private.assert_shift_capacity(public.shifts,text,text)') IS NULL
    OR to_regprocedure('private.can_read_shift(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_PREFLIGHT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

-- Serialize capacity checks on the segment row; the authoritative write path
-- still validates the same invariant in its transaction.
CREATE OR REPLACE FUNCTION private.enforce_staffing_segment_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  segment public.shift_staffing_segments%ROWTYPE;
  capacity integer;
  active_count integer;
-- BEGIN (nested)
  IF NEW.status NOT IN ('approved', 'manually_assigned') OR NEW.staffing_segment_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.staffing_segment_id IS NOT DISTINCT FROM OLD.staffing_segment_id
    AND NEW.operational_role IS NOT DISTINCT FROM OLD.operational_role
    AND NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO segment
  FROM public.shift_staffing_segments
  WHERE id = NEW.staffing_segment_id AND shift_id = NEW.shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_SEGMENT_MISMATCH';
  END IF;

  capacity := CASE NEW.operational_role::text
    WHEN 'host' THEN segment.required_host_count
    WHEN 'support' THEN segment.required_support_count
    WHEN 'technical' THEN segment.required_technical_count
    ELSE 0
  END;
  IF capacity <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_SEGMENT_ROLE_INCOMPATIBLE';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.shift_registrations
  WHERE staffing_segment_id = NEW.staffing_segment_id
    AND operational_role = NEW.operational_role
    AND status IN ('approved', 'manually_assigned')
    AND id IS DISTINCT FROM NEW.id;
  IF active_count + 1 > capacity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_CAPACITY_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.enforce_staffing_segment_capacity() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_staffing_segment_capacity() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS shift_registrations_enforce_segment_capacity ON public.shift_registrations;
CREATE TRIGGER shift_registrations_enforce_segment_capacity
BEFORE INSERT OR UPDATE OF shift_id, staffing_segment_id, operational_role, status
ON public.shift_registrations
FOR EACH ROW EXECUTE FUNCTION private.enforce_staffing_segment_capacity();

CREATE OR REPLACE FUNCTION private.swap_conflict_exists(
  p_user_id text,
  p_shift_id text,
  p_role text,
  p_exclude_registration_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target_shift public.shifts;
  error_message text;
-- BEGIN (nested)
  SELECT * INTO target_shift FROM public.shifts WHERE id = p_shift_id;
  IF target_shift.id IS NULL THEN RETURN true; END IF;
-- BEGIN (nested)
    PERFORM private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, p_exclude_registration_id);
    RETURN false;
  EXCEPTION
    WHEN unique_violation THEN RETURN true;
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
      IF error_message IN ('SHIFT_CONFLICT', 'MULTI_ROLE_NOT_ALLOWED') THEN RETURN true; END IF;
      RAISE;
  END;
END;
$$;
REVOKE ALL ON FUNCTION private.swap_conflict_exists(text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_shift_swap_conflict(
  p_source_registration_id text,
  p_mode text,
  p_replacement_staff_id text DEFAULT NULL,
  p_target_shift_id text DEFAULT NULL,
  p_counterpart_registration_id text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text := private.require_shift_actor(false);
  source_registration public.shift_registrations;
  counterpart_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  source_segment public.shift_staffing_segments;
  target_segment public.shift_staffing_segments;
  candidate public.business_users;
  role_name text;
  source_capacity integer;
  target_capacity integer;
  active_count integer;
-- BEGIN (nested)
  IF p_source_registration_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('replacement', 'exchange') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_PREFLIGHT_PAYLOAD_INVALID';
  END IF;

  SELECT * INTO source_registration
  FROM public.shift_registrations
  WHERE id = p_source_registration_id
  FOR UPDATE;
  IF source_registration.id IS NULL OR source_registration.user_id <> actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_NOT_OWNER';
  END IF;
  IF source_registration.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_NOT_ACTIVE';
  END IF;

  SELECT * INTO source_shift
  FROM public.shifts
  WHERE id = source_registration.shift_id
  FOR SHARE;
  IF source_shift.id IS NULL OR source_shift.deleted_at IS NOT NULL OR source_shift.archived_at IS NOT NULL
    OR source_shift.status <> 'scheduled' OR NOT private.can_read_shift(source_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SHIFT_NOT_SCHEDULED';
  END IF;
  role_name := source_registration.operational_role::text;
  PERFORM private.assert_shift_role_eligibility(actor_id, role_name);

  IF p_mode = 'replacement' THEN
    IF p_replacement_staff_id IS NULL OR p_target_shift_id IS NOT NULL
      OR p_counterpart_registration_id IS NOT NULL OR p_replacement_staff_id = actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_REPLACEMENT_PAYLOAD_INVALID';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_staff_id, 91731));
    SELECT * INTO candidate FROM public.business_users
    WHERE id = p_replacement_staff_id AND status = 'active' AND account_status = 'active'
      AND archived_at IS NULL AND deleted_at IS NULL;
    IF candidate.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REPLACEMENT_INACTIVE'; END IF;
    PERFORM private.assert_shift_role_eligibility(candidate.id, role_name);
    IF EXISTS (SELECT 1 FROM public.shift_registrations
      WHERE shift_id = source_shift.id AND user_id = candidate.id
        AND status IN ('approved', 'manually_assigned')) THEN RETURN 'CONFLICT'; END IF;

    IF source_registration.staffing_segment_id IS NULL THEN
      PERFORM private.assert_shift_capacity(source_shift, role_name, source_registration.id);
    ELSE
      SELECT * INTO source_segment FROM public.shift_staffing_segments
      WHERE id = source_registration.staffing_segment_id AND shift_id = source_shift.id FOR SHARE;
      IF source_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SEGMENT_INVALID'; END IF;
      source_capacity := CASE role_name WHEN 'host' THEN source_segment.required_host_count
        WHEN 'support' THEN source_segment.required_support_count ELSE source_segment.required_technical_count END;
      SELECT count(*) INTO active_count FROM public.shift_registrations
      WHERE staffing_segment_id = source_segment.id AND operational_role::text = role_name
        AND status IN ('approved', 'manually_assigned') AND id <> source_registration.id;
      IF source_capacity <= 0 OR active_count + 1 > source_capacity THEN RETURN 'CONFLICT'; END IF;
    END IF;
    IF private.swap_conflict_exists(candidate.id, source_shift.id, role_name, NULL) THEN RETURN 'CONFLICT'; END IF;
    RETURN 'VERIFIED_CLEAR';
  END IF;

  IF p_replacement_staff_id IS NOT NULL OR p_target_shift_id IS NULL
    OR p_counterpart_registration_id IS NULL OR p_target_shift_id = source_shift.id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_EXCHANGE_PAYLOAD_INVALID';
  END IF;
  SELECT * INTO target_shift FROM public.shifts WHERE id = p_target_shift_id FOR SHARE;
  IF target_shift.id IS NULL OR target_shift.deleted_at IS NOT NULL OR target_shift.archived_at IS NOT NULL
    OR target_shift.status <> 'scheduled' OR NOT private.can_read_shift(target_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_SHIFT_NOT_ELIGIBLE';
  END IF;
  SELECT * INTO counterpart_registration FROM public.shift_registrations
  WHERE id = p_counterpart_registration_id AND shift_id = target_shift.id FOR UPDATE;
  IF counterpart_registration.id IS NULL OR counterpart_registration.operational_role::text <> role_name
    OR counterpart_registration.status NOT IN ('approved', 'manually_assigned')
    OR counterpart_registration.user_id = actor_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COUNTERPART_NOT_ELIGIBLE';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(counterpart_registration.user_id, 91731));
  SELECT * INTO candidate FROM public.business_users
  WHERE id = counterpart_registration.user_id AND status = 'active' AND account_status = 'active'
    AND archived_at IS NULL AND deleted_at IS NULL;
  IF candidate.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COUNTERPART_INACTIVE'; END IF;
  PERFORM private.assert_shift_role_eligibility(candidate.id, role_name);

  IF source_registration.staffing_segment_id IS NULL THEN
    PERFORM private.assert_shift_capacity(target_shift, role_name, counterpart_registration.id);
  ELSE
    SELECT * INTO target_segment FROM public.shift_staffing_segments
    WHERE id = counterpart_registration.staffing_segment_id AND shift_id = target_shift.id FOR SHARE;
    IF target_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_SEGMENT_INVALID'; END IF;
    target_capacity := CASE role_name WHEN 'host' THEN target_segment.required_host_count
      WHEN 'support' THEN target_segment.required_support_count ELSE target_segment.required_technical_count END;
    SELECT count(*) INTO active_count FROM public.shift_registrations
    WHERE staffing_segment_id = target_segment.id AND operational_role::text = role_name
      AND status IN ('approved', 'manually_assigned') AND id <> counterpart_registration.id;
    IF target_capacity <= 0 OR active_count + 1 > target_capacity THEN RETURN 'CONFLICT'; END IF;
  END IF;

  IF counterpart_registration.staffing_segment_id IS NULL THEN
    PERFORM private.assert_shift_capacity(source_shift, role_name, source_registration.id);
  ELSE
    SELECT * INTO source_segment FROM public.shift_staffing_segments
    WHERE id = source_registration.staffing_segment_id AND shift_id = source_shift.id FOR SHARE;
    IF source_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SEGMENT_INVALID'; END IF;
    source_capacity := CASE role_name WHEN 'host' THEN source_segment.required_host_count
      WHEN 'support' THEN source_segment.required_support_count ELSE source_segment.required_technical_count END;
    SELECT count(*) INTO active_count FROM public.shift_registrations
    WHERE staffing_segment_id = source_segment.id AND operational_role::text = role_name
      AND status IN ('approved', 'manually_assigned') AND id <> source_registration.id;
    IF source_capacity <= 0 OR active_count + 1 > source_capacity THEN RETURN 'CONFLICT'; END IF;
  END IF;

  IF private.swap_conflict_exists(actor_id, target_shift.id, role_name, source_registration.id)
    OR private.swap_conflict_exists(candidate.id, source_shift.id, role_name, counterpart_registration.id) THEN
    RETURN 'CONFLICT';
  END IF;
  RETURN 'VERIFIED_CLEAR';
END;
$$;
ALTER FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) TO authenticated;

DO $verify$
-- BEGIN (nested)
  IF has_function_privilege('anon', 'public.check_shift_swap_conflict(text,text,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.check_shift_swap_conflict(text,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'private.enforce_staffing_segment_capacity()', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_PREFLIGHT_PRIVILEGE_CHECK_FAILED';
  END IF;
END;
$verify$;
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261116120000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261117160000_rc19_w4_pass_recipient_visibility.sql
 * Version:   20261117160000
 *******************************************************************************/
-- BEGIN (nested)
DO $guard$
-- BEGIN (nested)
  IF to_regclass('public.swap_requests') IS NULL
    OR to_regclass('public.shifts') IS NULL
    OR to_regprocedure('private.can_read_shift(text)') IS NULL
    OR to_regprocedure('public.get_swap_list_page(integer,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_PASS_RECIPIENT_VISIBILITY_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

-- 1. Extend RLS on swap_requests to allow the replacement staff (PASS recipient)
-- to view their pending, accepted, and completed swap requests.
DROP POLICY IF EXISTS swap_requests_select ON public.swap_requests;
CREATE POLICY swap_requests_select ON public.swap_requests FOR SELECT TO authenticated USING (
  (SELECT private.current_business_user_is_active()) AND (
    requester_id = (SELECT private.current_business_user_id())
    OR counterpart_id = (SELECT private.current_business_user_id())
    OR replacement_staff_id = (SELECT private.current_business_user_id())
    OR new_host_id = (SELECT private.current_business_user_id())
    OR new_support_id = (SELECT private.current_business_user_id())
    OR new_technical_id = (SELECT private.current_business_user_id())
    OR ((SELECT private.current_system_permission()) = 'admin')
    OR (
      (SELECT private.current_system_permission()) = 'leader'
      AND EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE (s.id = coalesce(nullif(swap_requests.shift_id, ''), swap_requests.source_shift_id)
               OR s.id = swap_requests.target_shift_id)
          AND private.can_read_shift(s.id)
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.shift_registrations sr
      WHERE sr.shift_id = source_shift_id
        AND sr.user_id = (SELECT private.current_business_user_id())
        AND sr.status IN ('approved','manually_assigned')
    )
  )
);

-- 2. Update can_read_shift so that:
-- a) Members can read future scheduled shifts (end_at > statement_timestamp())
--    even if filled/locked, allowing exchange candidate browsing.
-- b) Members involved in a swap request (as requester, counterpart, or replacement staff)
--    can read the shift even if it has ended or was locked.
CREATE OR REPLACE FUNCTION private.can_read_shift(p_shift_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT CASE
      WHEN private.current_system_permission() = 'admin' THEN true
      WHEN shift.deleted_at IS NOT NULL OR shift.archived_at IS NOT NULL THEN false
      WHEN private.current_system_permission() = 'leader' THEN
        private.rc19_has_any_leader_brand_scope(shift.brand_id, ARRAY[
          'shifts.read', 'shifts.manage'
        ]::text[])
      ELSE (
        (shift.status = 'scheduled' AND shift.end_at > statement_timestamp())
        OR private.current_business_user_id() IN (shift.host_id, shift.support_id, shift.technical_id)
        OR EXISTS (
          SELECT 1 FROM public.shift_registrations AS registration
          WHERE registration.shift_id = shift.id
            AND registration.user_id = private.current_business_user_id()
            AND registration.status IN ('pending', 'approved', 'manually_assigned')
        )
        OR EXISTS (
          SELECT 1 FROM public.swap_requests AS sw
          WHERE (sw.shift_id = shift.id OR sw.source_shift_id = shift.id OR sw.target_shift_id = shift.id)
            AND (
              sw.requester_id = private.current_business_user_id()
              OR sw.counterpart_id = private.current_business_user_id()
              OR sw.replacement_staff_id = private.current_business_user_id()
              OR sw.new_host_id = private.current_business_user_id()
              OR sw.new_support_id = private.current_business_user_id()
              OR sw.new_technical_id = private.current_business_user_id()
            )
            AND sw.deleted_at IS NULL
        )
      )
    END
    FROM public.shifts AS shift
    WHERE shift.id = p_shift_id AND private.current_business_user_is_active()
  ), false);
$$;
ALTER FUNCTION private.can_read_shift(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_read_shift(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_read_shift(text) TO authenticated;

-- 3. Update get_swap_list_page:
-- Support scope='forMe' for both replacement_staff_id and counterpart_id.
-- Ensure counts and matching rows respect the caller's brand and shift scope.
CREATE OR REPLACE FUNCTION public.get_swap_list_page(p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}')
RETURNS jsonb language plpgsql stable security invoker set search_path=''
AS $$
DECLARE
  actor text := private.current_business_user_id();
  result jsonb;
  search_text text;
-- BEGIN (nested)
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED'; END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000 OR p_page_size IS NULL OR p_page_size NOT IN (10, 20, 50)
    OR jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text) > 16384
    OR coalesce(p_filters->>'scope', 'all') NOT IN ('all', 'mine', 'forMe')
    OR length(coalesce(p_filters->>'search', '')) > 256 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LIST_QUERY_INVALID';
  END IF;
  IF (p_filters ? 'statuses' AND (jsonb_typeof(p_filters->'statuses') <> 'array' OR jsonb_array_length(p_filters->'statuses') > 50))
    OR (p_filters ? 'roles' AND (jsonb_typeof(p_filters->'roles') <> 'array' OR jsonb_array_length(p_filters->'roles') > 3))
    OR (p_filters ? 'requesterIds' AND (jsonb_typeof(p_filters->'requesterIds') <> 'array' OR jsonb_array_length(p_filters->'requesterIds') > 50)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LIST_FILTER_INVALID';
  END IF;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search', '')), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_');

  WITH shift_ids AS MATERIALIZED (
    SELECT * FROM private.filtered_shift_ids('all', p_filters - 'scope' - 'roles' - 'statuses' - 'requesterIds' - 'search')
  ), directory AS MATERIALIZED (
    SELECT id, full_name FROM public.get_staff_directory() WHERE search_text <> ''
    UNION SELECT id, full_name FROM public.business_users WHERE search_text <> ''
  ), all_rows AS MATERIALIZED (
    SELECT sw.* FROM public.swap_requests sw
    JOIN shift_ids ids ON ids.id = coalesce(nullif(sw.shift_id, ''), sw.source_shift_id)
    WHERE sw.deleted_at IS NULL
  ), matching AS MATERIALIZED (
    SELECT sw.* FROM all_rows sw
    JOIN public.shifts s ON s.id = coalesce(nullif(sw.shift_id, ''), sw.source_shift_id)
    WHERE (
      coalesce(p_filters->>'scope', 'all') = 'all'
      OR (p_filters->>'scope' = 'mine' AND sw.requester_id = actor)
      OR (p_filters->>'scope' = 'forMe' AND (
        sw.counterpart_id = actor
        OR sw.replacement_staff_id = actor
        OR sw.new_host_id = actor
        OR sw.new_support_id = actor
        OR sw.new_technical_id = actor
      ))
    )
    AND (jsonb_array_length(coalesce(p_filters->'requesterIds', '[]')) = 0 OR sw.requester_id IN (SELECT jsonb_array_elements_text(p_filters->'requesterIds')))
    AND (jsonb_array_length(coalesce(p_filters->'roles', '[]')) = 0 OR coalesce(sw.operational_role, CASE WHEN sw.new_support_id IS NOT NULL THEN 'support' WHEN sw.new_technical_id IS NOT NULL THEN 'technical' ELSE 'host' END) IN (SELECT jsonb_array_elements_text(p_filters->'roles')))
    AND (jsonb_array_length(coalesce(p_filters->'statuses', '[]')) = 0 OR sw.status::text IN (SELECT jsonb_array_elements_text(p_filters->'statuses')))
    AND (search_text = '' OR lower(concat_ws(' ', sw.id, s.title, sw.reason,
      (SELECT full_name FROM directory WHERE id = sw.requester_id LIMIT 1),
      (SELECT full_name FROM directory WHERE id = coalesce(sw.replacement_staff_id, sw.new_host_id, sw.new_support_id, sw.new_technical_id, sw.counterpart_id) LIMIT 1))) LIKE '%'||search_text||'%' ESCAPE E'\\')
  ), stats AS (
    SELECT count(*) total, least(p_page, greatest(1, ceil(count(*)::numeric / p_page_size)::integer)) page FROM matching
  ), selected AS (
    SELECT * FROM matching ORDER BY created_at DESC, id LIMIT p_page_size OFFSET ((SELECT page FROM stats) - 1) * p_page_size
  ), counts AS (
    SELECT jsonb_build_object(
      'all', count(*),
      'mine', count(*) FILTER (WHERE requester_id = actor),
      'forMe', count(*) FILTER (WHERE counterpart_id = actor OR replacement_staff_id = actor OR new_host_id = actor OR new_support_id = actor OR new_technical_id = actor),
      'pending', count(*) FILTER (WHERE status = 'pending'),
      'accepted', count(*) FILTER (WHERE status IN ('accepted', 'approved')),
      'completed', count(*) FILTER (WHERE status = 'completed'),
      'rejected', count(*) FILTER (WHERE status = 'rejected'),
      'cancelled', count(*) FILTER (WHERE status = 'cancelled')
    ) value FROM all_rows
  )
  SELECT jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(selected) ORDER BY created_at DESC, id), '[]'::jsonb),
    'total', (SELECT total FROM stats),
    'page', (SELECT page FROM stats),
    'pageSize', p_page_size,
    'counts', (SELECT value FROM counts)
  ) INTO result FROM selected;
  RETURN result;
END;
$$;
ALTER FUNCTION public.get_swap_list_page(integer, integer, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_swap_list_page(integer, integer, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_swap_list_page(integer, integer, jsonb) TO authenticated;
-- COMMIT (nested)

-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261117160000') ON CONFLICT (version) DO NOTHING;

COMMIT;
