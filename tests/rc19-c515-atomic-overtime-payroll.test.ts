import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('P0-1 Atomic Overtime & Payroll Transaction (PGlite Integration)', async () => {
  const db = new PGlite()

  await db.exec(`
    create schema if not exists private;
    create role authenticated nologin;
    create role service_role nologin;
    create role anon nologin;
    grant usage on schema private to authenticated;

    create table public.shifts (
      id text primary key,
      date date not null,
      brand_id text not null,
      deleted_at timestamptz
    );

    create table public.workforce_actual_segments (
      id text primary key,
      shift_id text not null references public.shifts(id),
      staff_id text not null,
      operational_role text not null,
      review_status text not null,
      event_kind text not null,
      actual_start_at timestamptz not null,
      actual_end_at timestamptz not null
    );

    create table public.workforce_rate_cards (
      id text primary key,
      staff_id text,
      operational_role text not null,
      effective_from date not null,
      effective_through date,
      vnd_per_hour bigint not null,
      overtime_multiplier_basis_points integer not null,
      approved_by text,
      approved_at timestamptz
    );

    create table public.workforce_overtime_requests (
      id uuid primary key default gen_random_uuid(),
      segment_id text not null references public.workforce_actual_segments(id),
      state text not null,
      requested_by text not null,
      leader_preapproved_by text,
      admin_confirmed_by text,
      overtime_start_at timestamptz not null,
      overtime_end_at timestamptz not null,
      overtime_seconds integer not null,
      day_class text not null,
      time_class text not null,
      rate_card_id text,
      multiplier_basis_points integer,
      version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.workforce_overtime_request_events (
      id bigserial primary key,
      request_id uuid not null references public.workforce_overtime_requests(id),
      actor_id text not null,
      action text not null,
      from_state text not null,
      to_state text not null,
      reason text not null,
      version integer not null,
      idempotency_key uuid not null,
      created_at timestamptz not null default now()
    );

    create table public.workforce_payroll_periods (
      id text primary key,
      period_start date not null,
      period_end date not null,
      status text not null
    );

    create table public.workforce_payroll_lines (
      id text primary key,
      period_id text not null references public.workforce_payroll_periods(id),
      segment_id text not null references public.workforce_actual_segments(id),
      rate_card_id text references public.workforce_rate_cards(id),
      staff_id text not null,
      operational_role text not null,
      actual_seconds integer,
      payable_seconds integer,
      overtime_seconds integer,
      actual_minutes integer,
      payable_minutes integer,
      overtime_minutes integer,
      overtime_request_id uuid references public.workforce_overtime_requests(id),
      overtime_day_class text,
      overtime_time_class text,
      rate_vnd_per_hour bigint not null,
      overtime_multiplier_basis_points integer not null default 10000,
      gross_vnd bigint not null,
      adjustment_vnd bigint default 0,
      net_vnd bigint not null,
      version integer not null default 1,
      voided_at timestamptz,
      updated_at timestamptz not null default now()
    );

    create or replace function private.current_business_user_id() returns text language sql as $$ select 'admin-1'::text $$;
    create or replace function private.current_business_user_is_active() returns boolean language sql as $$ select true $$;
    create or replace function private.current_system_permission() returns text language sql as $$ select 'admin'::text $$;
    create or replace function private.rc19_has_any_leader_brand_scope(p_brand text, p_scopes text[]) returns boolean language sql as $$ select true $$;
  `)

  // Define atomic function
  await db.exec(`
create or replace function public.rc19_c515_decide_overtime_request(
  p_request_id uuid,p_expected_version integer,p_action text,p_reason text,p_idempotency_key uuid
) returns public.workforce_overtime_requests
language plpgsql security definer set search_path='' as $$
declare
  v_actor text:=private.current_business_user_id();
  v_request public.workforce_overtime_requests%rowtype;
  v_segment public.workforce_actual_segments%rowtype;
  v_shift public.shifts%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_count integer;
  v_next text;
  v_action text;
  v_replay public.workforce_overtime_request_events%rowtype;
  v_line public.workforce_payroll_lines%rowtype;
  v_ot_mins integer;
  v_regular_secs integer;
  v_regular_mins integer;
  v_numerator bigint;
  v_gross bigint;
  v_net bigint;
  v_multiplier bigint;
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

  -- ATOMIC PAYROLL DRAFT LINE SYNCHRONIZATION:
  if v_next = 'admin_confirmed' then
    select l.* into v_line from public.workforce_payroll_lines l
    join public.workforce_payroll_periods p on p.id = l.period_id
    where l.segment_id = v_request.segment_id
      and l.voided_at is null
      and p.status = 'draft'
    for update;

    if found then
      v_ot_mins := floor(v_request.overtime_seconds / 60)::integer;
      v_multiplier := v_rate.overtime_multiplier_basis_points::bigint;

      if v_line.actual_seconds is not null and v_line.payable_seconds is not null then
        v_regular_secs := v_line.payable_seconds - v_request.overtime_seconds;
        if v_regular_secs < 0 then
          raise exception 'C515_OT_EXCEEDS_PAYABLE_SECONDS';
        end if;
        v_numerator := v_rate.vnd_per_hour::bigint * (v_regular_secs::bigint * 10000::bigint + v_request.overtime_seconds::bigint * v_multiplier);
        v_gross := (v_numerator + 18000000::bigint) / 36000000::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      elsif v_line.payable_minutes is not null then
        v_regular_mins := v_line.payable_minutes - v_ot_mins;
        if v_regular_mins < 0 then
          raise exception 'C515_OT_EXCEEDS_PAYABLE_MINUTES';
        end if;
        v_numerator := v_rate.vnd_per_hour::bigint * (v_regular_mins::bigint * 10000::bigint + v_ot_mins::bigint * v_multiplier);
        v_gross := (v_numerator + 300000::bigint) / 600000::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      else
        v_gross := round((v_rate.vnd_per_hour::numeric * coalesce(v_line.payable_minutes, 0)::numeric) / 60.0)::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      end if;

      update public.workforce_payroll_lines set
        overtime_seconds = v_request.overtime_seconds,
        overtime_minutes = v_ot_mins,
        overtime_request_id = v_request.id,
        overtime_day_class = v_request.day_class,
        overtime_time_class = v_request.time_class,
        overtime_multiplier_basis_points = v_rate.overtime_multiplier_basis_points,
        rate_card_id = v_rate.id,
        gross_vnd = v_gross,
        net_vnd = v_net,
        version = version + 1,
        updated_at = statement_timestamp()
      where id = v_line.id;
    end if;
  elsif v_next = 'rejected' then
    select l.* into v_line from public.workforce_payroll_lines l
    join public.workforce_payroll_periods p on p.id = l.period_id
    where l.overtime_request_id = v_request.id
      and l.voided_at is null
      and p.status = 'draft'
    for update;

    if found then
      if v_line.actual_seconds is not null and v_line.payable_seconds is not null then
        v_numerator := v_line.rate_vnd_per_hour::bigint * v_line.payable_seconds::bigint * 10000::bigint;
        v_gross := (v_numerator + 18000000::bigint) / 36000000::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      elsif v_line.payable_minutes is not null then
        v_numerator := v_line.rate_vnd_per_hour::bigint * v_line.payable_minutes::bigint * 10000::bigint;
        v_gross := (v_numerator + 300000::bigint) / 600000::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      else
        v_gross := round((v_line.rate_vnd_per_hour::numeric * coalesce(v_line.payable_minutes, 0)::numeric) / 60.0)::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      end if;

      update public.workforce_payroll_lines set
        overtime_seconds = 0,
        overtime_minutes = 0,
        overtime_request_id = null,
        overtime_day_class = null,
        overtime_time_class = null,
        gross_vnd = v_gross,
        net_vnd = v_net,
        version = version + 1,
        updated_at = statement_timestamp()
      where id = v_line.id;
    end if;
  end if;

  return v_request;
end $$;
  `)

  // Synthetic fixtures
  await db.exec(`
    insert into public.shifts (id, date, brand_id)
    values ('shift-1', '2026-11-15', 'brand-1');

    insert into public.workforce_actual_segments
      (id, shift_id, staff_id, operational_role, review_status, event_kind, actual_start_at, actual_end_at)
    values
      ('seg-1', 'shift-1', 'staff-1', 'host', 'approved', 'worked', '2026-11-15 08:00:00Z', '2026-11-15 10:30:00Z');

    insert into public.workforce_rate_cards
      (id, staff_id, operational_role, effective_from, vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at)
    values
      ('rate-1', 'staff-1', 'host', '2026-11-01', 100000, 15000, 'admin-1', now());

    insert into public.workforce_overtime_requests
      (id, segment_id, state, requested_by, overtime_start_at, overtime_end_at, overtime_seconds, day_class, time_class, version)
    values
      ('11111111-1111-4111-8111-111111111111', 'seg-1', 'pending_admin_confirmation', 'leader-1',
       '2026-11-15 10:00:00Z', '2026-11-15 10:30:00Z', 1800, 'weekday', 'day', 1);

    insert into public.workforce_payroll_periods (id, period_start, period_end, status)
    values ('period-1', '2026-11-01', '2026-11-30', 'draft');

    insert into public.workforce_payroll_lines
      (id, period_id, segment_id, rate_card_id, staff_id, operational_role,
       actual_seconds, payable_seconds, overtime_seconds,
       actual_minutes, payable_minutes, overtime_minutes,
       rate_vnd_per_hour, overtime_multiplier_basis_points, gross_vnd, adjustment_vnd, net_vnd, version)
    values
      ('line-1', 'period-1', 'seg-1', 'rate-1', 'staff-1', 'host',
       9000, 9000, 0,
       150, 150, 0,
       100000, 10000, 250000, 0, 250000, 1);
  `)

  // Test 1: admin_confirm updates OT request AND draft line atomically
  const r1 = await db.query<{ state: string }>(`
    select * from public.rc19_c515_decide_overtime_request(
      '11111111-1111-4111-8111-111111111111'::uuid,
      1,
      'admin_confirm',
      'Approved 30m overtime for event extension',
      '22222222-2222-4222-8222-222222222222'::uuid
    );
  `)
  assert.equal(r1.rows[0].state, 'admin_confirmed')

  const line1 = (await db.query<{
    overtime_seconds: number
    gross_vnd: number
    net_vnd: number
    version: number
  }>(`select * from public.workforce_payroll_lines where id = 'line-1'`)).rows[0]
  assert.equal(line1.overtime_seconds, 1800)
  assert.equal(line1.gross_vnd, 275000)
  assert.equal(line1.net_vnd, 275000)
  assert.equal(line1.version, 2)

  // Test 2: reject resets overtime to 0 and recomputes to base shift amount
  await db.exec(`
    update public.workforce_overtime_requests
    set state = 'pending_admin_confirmation', version = version + 1
    where id = '11111111-1111-4111-8111-111111111111';
  `)
  const curVer = (await db.query<{ version: number }>(`select version from public.workforce_overtime_requests where id = '11111111-1111-4111-8111-111111111111'`)).rows[0].version

  const r2 = await db.query<{ state: string }>(`
    select * from public.rc19_c515_decide_overtime_request(
      '11111111-1111-4111-8111-111111111111'::uuid,
      ${curVer},
      'reject',
      'Rejected excess hours request',
      '33333333-3333-4333-8333-333333333333'::uuid
    );
  `)
  assert.equal(r2.rows[0].state, 'rejected')

  const line2 = (await db.query<{
    overtime_seconds: number
    gross_vnd: number
    net_vnd: number
    version: number
  }>(`select * from public.workforce_payroll_lines where id = 'line-1'`)).rows[0]
  assert.equal(line2.overtime_seconds, 0)
  assert.equal(line2.gross_vnd, 250000)
  assert.equal(line2.net_vnd, 250000)
  assert.equal(line2.version, 3)

  // Test 3: locked payroll periods are NEVER mutated
  await db.exec(`
    update public.workforce_payroll_periods set status = 'locked' where id = 'period-1';
    update public.workforce_overtime_requests
    set state = 'pending_admin_confirmation', version = version + 1
    where id = '11111111-1111-4111-8111-111111111111';
  `)
  const curVer3 = (await db.query<{ version: number }>(`select version from public.workforce_overtime_requests where id = '11111111-1111-4111-8111-111111111111'`)).rows[0].version

  await db.query(`
    select * from public.rc19_c515_decide_overtime_request(
      '11111111-1111-4111-8111-111111111111'::uuid,
      ${curVer3},
      'admin_confirm',
      'Approved after lock',
      '44444444-4444-4444-8444-444444444444'::uuid
    );
  `)
  const line3 = (await db.query<{
    overtime_seconds: number
    gross_vnd: number
    version: number
  }>(`select * from public.workforce_payroll_lines where id = 'line-1'`)).rows[0]
  assert.equal(line3.overtime_seconds, 0)
  assert.equal(line3.gross_vnd, 250000)
  assert.equal(line3.version, 3) // untouched!

  // Test 4: optimistic concurrency: stale version fails and rolls back
  await assert.rejects(
    async () => {
      await db.query(`
        select * from public.rc19_c515_decide_overtime_request(
          '11111111-1111-4111-8111-111111111111'::uuid,
          1, -- stale version
          'reject',
          'Should fail with stale version',
          '55555555-5555-4555-8555-555555555555'::uuid
        );
      `)
    },
    (err: Error) => err.message.includes('C515_OT_STALE_REQUEST')
  )

  // Test 5: idempotency: identical retry returns existing record without duplicate update
  const replay = await db.query<{ state: string }>(`
    select * from public.rc19_c515_decide_overtime_request(
      '11111111-1111-4111-8111-111111111111'::uuid,
      ${curVer3},
      'admin_confirm',
      'Approved after lock',
      '44444444-4444-4444-8444-444444444444'::uuid
    );
  `)
  assert.equal(replay.rows[0].state, 'admin_confirmed')
})
