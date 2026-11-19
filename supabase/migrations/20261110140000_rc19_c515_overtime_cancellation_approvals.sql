begin;

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
begin
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
begin
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
begin
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
begin
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
begin
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
begin
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

commit;
