-- RC1.7B Payroll Rate Supersession, Draft Recalculation, and Unreconciled Guard
-- Staged only; no Production auto-apply.

-- 1. Extend audit actions to support rate supersession and line recalculation
alter table public.workforce_payroll_audit
  alter column period_id drop not null;

alter table public.workforce_payroll_audit
  add column if not exists rate_card_id text references public.workforce_rate_cards(id) on delete restrict;

alter table public.workforce_payroll_audit
  drop constraint if exists workforce_payroll_audit_action_check,
  add constraint workforce_payroll_audit_action_check check (
    action in ('review','confirm','mark_ready','lock','reopen','adjustment','correct_line','void_line','supersede_rate_card','recalculate_line','recalculate_batch','auto_calculate_batch')
  );

alter table public.workforce_payroll_audit
  drop constraint if exists workforce_line_audit_fields,
  add constraint workforce_line_audit_fields check (
    action not in ('correct_line','void_line','recalculate_line') or (
      line_id is not null and line_version is not null and line_version >= 2
      and request_id is not null and request_payload is not null
      and previous_values is not null and updated_values is not null
    )
  );

-- 2. Update rate card guard to allow closing out open-ended rates while keeping pay amounts strictly immutable
create or replace function public.workforce_rc16_rate_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'WORKFORCE_APPROVED_RATE_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' then
    -- Updates are only permitted via the authorized supersession RPC
    if coalesce(current_setting('workforce.rc17b_supersede_call', true), '') <> '1' then
      raise exception 'WORKFORCE_APPROVED_RATE_IMMUTABLE';
    end if;

    -- Only effective_through is allowed to be closed to a bounded date. All financial, identity, and approval fields are strictly immutable.
    if (new.id, new.staff_id, new.operational_role, new.effective_from, new.vnd_per_hour,
        new.overtime_multiplier_basis_points, new.approved_by, new.approval_note, new.approved_at, new.created_at)
      is distinct from
       (old.id, old.staff_id, old.operational_role, old.effective_from, old.vnd_per_hour,
        old.overtime_multiplier_basis_points, old.approved_by, old.approval_note, old.approved_at, old.created_at) then
      raise exception 'WORKFORCE_APPROVED_RATE_IMMUTABLE';
    end if;
    if new.effective_through is null or new.effective_through < old.effective_from
      or (old.effective_through is not null and new.effective_through > old.effective_through) then
      raise exception 'WORKFORCE_APPROVED_RATE_IMMUTABLE';
    end if;
    return new;
  end if;

  -- INSERT checks
  if new.staff_id is not null and new.staff_id=new.approved_by then
    raise exception 'WORKFORCE_RATE_SELF_APPROVAL_BLOCKED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(new.staff_id,'__ROLE_DEFAULT__')||':'||new.operational_role,0));
  if exists (
    select 1 from public.workforce_rate_cards r
    where r.operational_role=new.operational_role
      and r.staff_id is not distinct from new.staff_id
      and r.effective_from <= coalesce(new.effective_through,'infinity'::date)
      and new.effective_from <= coalesce(r.effective_through,'infinity'::date)
  ) then
    raise exception 'WORKFORCE_APPROVED_RATE_OVERLAP';
  end if;
  return new;
end $$;

-- 3. Atomic RPC to register a new rate card and supersede any open-ended previous rate card
create or replace function public.workforce_rc17b_register_rate_card(
  p_staff_id text,
  p_operational_role text,
  p_effective_from date,
  p_effective_through date,
  p_vnd_per_hour integer,
  p_overtime_multiplier_basis_points integer,
  p_approved_by text,
  p_approval_note text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_old_rate public.workforce_rate_cards%rowtype;
  v_new_rate public.workforce_rate_cards%rowtype;
  v_superseded_id text := null;
begin
  if not exists (select 1 from public.business_users where id=p_approved_by
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_RATE_ACTOR_FORBIDDEN' using errcode='42501';
  end if;
  if p_staff_id is not null and p_staff_id = p_approved_by then
    raise exception 'WORKFORCE_RATE_SELF_APPROVAL_BLOCKED';
  end if;
  if p_effective_through is not null and p_effective_through < p_effective_from then
    raise exception 'WORKFORCE_RATE_DATES_INVALID';
  end if;
  if p_vnd_per_hour < 0 or p_vnd_per_hour > 100000000
    or p_overtime_multiplier_basis_points < 10000 or p_overtime_multiplier_basis_points > 50000
    or char_length(trim(coalesce(p_approval_note,''))) not between 8 and 1000 then
    raise exception 'WORKFORCE_RATE_INVALID';
  end if;

  -- Lock scope to serialize concurrent rate creations
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(p_staff_id,'__ROLE_DEFAULT__')||':'||p_operational_role, 0));

  -- Check if an active rate card starts before p_effective_from and extends into/past p_effective_from
  for v_old_rate in
    select * from public.workforce_rate_cards r
    where r.operational_role = p_operational_role
      and r.staff_id is not distinct from p_staff_id
      and r.effective_from < p_effective_from
      and (r.effective_through is null or r.effective_through >= p_effective_from)
    for update
  loop
    -- Guard: cannot retroactively alter a rate used by a LOCKED period ending >= p_effective_from
    if exists (
      select 1 from public.workforce_payroll_lines l
      join public.workforce_payroll_periods p on p.id = l.period_id
      where l.rate_card_id = v_old_rate.id
        and p.status = 'locked'
        and p.period_end >= p_effective_from
    ) then
      raise exception 'WORKFORCE_RATE_RETROACTIVE_LOCKED_PERIOD';
    end if;

    -- Close out the old rate card to the day before the new rate begins
    perform set_config('workforce.rc17b_supersede_call', '1', true);
    update public.workforce_rate_cards
      set effective_through = (p_effective_from - interval '1 day')::date
      where id = v_old_rate.id;

    v_superseded_id := v_old_rate.id;

    -- Record audit of supersession
    insert into public.workforce_payroll_audit(
      period_id, line_id, rate_card_id, action, actor_id, reason, previous_values, updated_values
    ) values (
      null, null, v_old_rate.id, 'supersede_rate_card', p_approved_by,
      'Khung lương cũ được tự động giới hạn hiệu lực trước đơn giá mới bắt đầu ngày ' || p_effective_from::text,
      jsonb_build_object('rate_card_id', v_old_rate.id, 'effective_from', v_old_rate.effective_from, 'effective_through', v_old_rate.effective_through),
      jsonb_build_object('rate_card_id', v_old_rate.id, 'effective_from', v_old_rate.effective_from, 'effective_through', (p_effective_from - interval '1 day')::date)
    );
  end loop;

  -- Insert new rate card
  insert into public.workforce_rate_cards(
    staff_id, operational_role, effective_from, effective_through,
    vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note
  ) values (
    p_staff_id, p_operational_role, p_effective_from, p_effective_through,
    p_vnd_per_hour, p_overtime_multiplier_basis_points, p_approved_by, statement_timestamp(), p_approval_note
  ) returning * into v_new_rate;

  return jsonb_build_object(
    'rate', to_jsonb(v_new_rate),
    'superseded_rate_id', v_superseded_id
  );
end $$;

-- 4. Update line change guard to support draft line recalculation
create or replace function public.workforce_rc16b_line_change_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'WORKFORCE_PAYROLL_LINE_DELETE_BLOCKED'; end if;
  if tg_op='INSERT' then
    if new.version <> 1 or new.voided_at is not null then
      raise exception 'WORKFORCE_PAYROLL_LINE_MUST_START_ACTIVE';
    end if;
    if exists (
      select 1 from public.workforce_rate_cards selected
      join public.workforce_actual_segments a on a.id=new.segment_id
      join public.shifts s on s.id=a.shift_id
      join public.workforce_rate_cards specific on specific.staff_id=new.staff_id
        and specific.operational_role=new.operational_role
        and specific.effective_from<=s.date
        and (specific.effective_through is null or specific.effective_through>=s.date)
      where selected.id=new.rate_card_id and selected.staff_id is null
    ) then raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED'; end if;
    return new;
  end if;

  if coalesce(current_setting('workforce.rc16b_line_call',true),'') <> '1'
    and coalesce(current_setting('workforce.rc17b_recalc_call',true),'') <> '1' then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_REQUIRES_RPC';
  end if;

  if old.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;
  if new.version <> old.version+1 then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;

  -- In recalculation mode, rate card and amounts can change, but segment and staff identity cannot
  if coalesce(current_setting('workforce.rc17b_recalc_call',true),'') = '1' then
    if (new.id, new.period_id, new.segment_id, new.staff_id, new.operational_role, new.actual_minutes, new.created_at)
      is distinct from
       (old.id, old.period_id, old.segment_id, old.staff_id, old.operational_role, old.actual_minutes, old.created_at) then
      raise exception 'WORKFORCE_PAYROLL_LINE_IDENTITY_IMMUTABLE';
    end if;
    return new;
  end if;

  -- Default rc16b correct_line mode: rate card and identity are strictly immutable
  if (new.id,new.period_id,new.segment_id,new.rate_card_id,new.staff_id,
      new.operational_role,new.actual_minutes,new.rate_vnd_per_hour,
      new.overtime_multiplier_basis_points,new.calculation_version,new.created_at)
    is distinct from
     (old.id,old.period_id,old.segment_id,old.rate_card_id,old.staff_id,
      old.operational_role,old.actual_minutes,old.rate_vnd_per_hour,
      old.overtime_multiplier_basis_points,old.calculation_version,old.created_at) then
    raise exception 'WORKFORCE_PAYROLL_LINE_IDENTITY_IMMUTABLE';
  end if;
  if new.voided_at is not null and
    (new.payable_minutes,new.overtime_minutes,new.gross_vnd,new.adjustment_vnd,new.adjustment_reason)
      is distinct from
    (old.payable_minutes,old.overtime_minutes,old.gross_vnd,old.adjustment_vnd,old.adjustment_reason) then
    raise exception 'WORKFORCE_PAYROLL_VOID_MUST_PRESERVE_EVIDENCE';
  end if;
  return new;
end $$;

-- 5. Atomic RPC to recalculate a draft payroll line with a new rate card while preserving accountant adjustments
create or replace function public.workforce_rc17b_recalculate_draft_line(
  p_period_id text,
  p_line_id text,
  p_expected_version integer,
  p_request_id uuid,
  p_actor_id text,
  p_reason text,
  p_new_rate_card_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_line public.workforce_payroll_lines%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_audit public.workforce_payroll_audit%rowtype;
  v_previous jsonb;
  v_payload jsonb;
  v_new_gross bigint;
  v_new_net bigint;
  v_shift_date date;
begin
  if not exists (select 1 from public.business_users where id=p_actor_id
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN' using errcode='42501';
  end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 1
    or char_length(trim(coalesce(p_reason,''))) not between 8 and 2000 then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;

  v_payload := jsonb_build_object(
    'period_id', p_period_id, 'line_id', p_line_id, 'expected_version', p_expected_version,
    'action', 'recalculate_line', 'reason', p_reason, 'new_rate_card_id', p_new_rate_card_id
  );

  -- Serialize request idempotency
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text, 0));
  select * into v_audit from public.workforce_payroll_audit
    where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_audit.request_payload is distinct from v_payload then
      raise exception 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('line', v_audit.updated_values, 'audit', to_jsonb(v_audit), 'replayed', true);
  end if;

  -- Lock period and verify draft status
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;

  -- Lock line
  select * into v_line from public.workforce_payroll_lines
    where id=p_line_id and period_id=p_period_id for update;
  if not found then raise exception 'WORKFORCE_PAYROLL_LINE_NOT_FOUND'; end if;
  if v_line.version <> p_expected_version then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
  if v_line.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;

  -- Get shift date
  select s.date into v_shift_date from public.workforce_actual_segments a
    join public.shifts s on s.id=a.shift_id where a.id=v_line.segment_id;

  -- Verify new rate card exists and is valid for this staff/role/date
  select * into v_rate from public.workforce_rate_cards where id=p_new_rate_card_id;
  if not found or v_rate.approved_by is null or v_rate.operational_role <> v_line.operational_role
    or (v_rate.staff_id is not null and v_rate.staff_id <> v_line.staff_id)
    or v_rate.effective_from > v_shift_date
    or (v_rate.effective_through is not null and v_rate.effective_through < v_shift_date) then
    raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
  end if;

  -- Staff-specific precedence: cannot use role-default if a valid staff-specific rate exists
  if v_rate.staff_id is null and exists (
    select 1 from public.workforce_rate_cards specific
    where specific.staff_id = v_line.staff_id
      and specific.operational_role = v_line.operational_role
      and specific.approved_by is not null
      and specific.effective_from <= v_shift_date
      and (specific.effective_through is null or specific.effective_through >= v_shift_date)
  ) then
    raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
  end if;

  v_previous := to_jsonb(v_line);

  -- Calculate new gross
  v_new_gross := round(v_rate.vnd_per_hour::numeric *
    ((v_line.payable_minutes - v_line.overtime_minutes)::numeric
      + v_line.overtime_minutes::numeric * v_rate.overtime_multiplier_basis_points / 10000) / 60)::bigint;

  -- Preserve existing adjustment_vnd exactly
  v_new_net := v_new_gross + v_line.adjustment_vnd;
  if v_new_net < 0 or v_new_net > 1000000000000 then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;

  -- Perform line update under rc17b setting
  perform set_config('workforce.rc17b_recalc_call', '1', true);
  update public.workforce_payroll_lines
    set rate_card_id = v_rate.id,
        rate_vnd_per_hour = v_rate.vnd_per_hour,
        overtime_multiplier_basis_points = v_rate.overtime_multiplier_basis_points,
        gross_vnd = v_new_gross,
        version = v_line.version + 1,
        updated_at = statement_timestamp()
    where id = v_line.id
    returning * into v_line;

  insert into public.workforce_payroll_audit(
    period_id, line_id, line_version, action, actor_id, reason,
    request_id, request_payload, previous_values, updated_values
  ) values (
    p_period_id, v_line.id, v_line.version, 'recalculate_line', p_actor_id, p_reason,
    p_request_id, v_payload, v_previous, to_jsonb(v_line)
  ) returning * into v_audit;

  return jsonb_build_object('line', to_jsonb(v_line), 'audit', to_jsonb(v_audit), 'replayed', false);
end $$;

-- 5b. Atomic RPC to recalculate draft payroll lines in bulk batch with all-or-nothing atomicity and idempotency
create or replace function public.workforce_rc17b_recalculate_draft_batch(
  p_period_id text,
  p_request_id uuid,
  p_actor_id text,
  p_reason text,
  p_items jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_line public.workforce_payroll_lines%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_audit public.workforce_payroll_audit%rowtype;
  v_item jsonb;
  v_item_line_id text;
  v_item_version integer;
  v_item_rate_id text;
  v_payload jsonb;
  v_previous_lines jsonb := '[]'::jsonb;
  v_updated_lines jsonb := '[]'::jsonb;
  v_shift_date date;
  v_new_gross bigint;
  v_new_net bigint;
  v_seen_lines text[] := array[]::text[];
begin
  if not exists (select 1 from public.business_users where id=p_actor_id
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN' using errcode='42501';
  end if;
  if p_request_id is null or char_length(trim(coalesce(p_reason,''))) not between 8 and 2000
    or p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;

  v_payload := jsonb_build_object(
    'period_id', p_period_id,
    'action', 'recalculate_batch',
    'reason', p_reason,
    'items', p_items
  );

  -- Serialize request idempotency per actor + request_id
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text, 0));
  select * into v_audit from public.workforce_payroll_audit
    where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_audit.request_payload is distinct from v_payload then
      raise exception 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('lines', v_audit.updated_values, 'audit', to_jsonb(v_audit), 'replayed', true);
  end if;

  -- Lock period for update and ensure it is still draft
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;

  -- Set recalculation config for line_change_guard
  perform set_config('workforce.rc17b_recalc_call', '1', true);

  -- Iterate through items and update each line atomically
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_line_id := v_item->>'line_id';
    v_item_version := (v_item->>'expected_version')::integer;
    v_item_rate_id := v_item->>'new_rate_card_id';

    if v_item_line_id is null or v_item_version is null or v_item_version < 1 or v_item_rate_id is null then
      raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
    end if;

    -- Duplicate line in same batch check
    if v_item_line_id = any(v_seen_lines) then
      raise exception 'WORKFORCE_PAYROLL_DUPLICATE_LINE_IN_BATCH';
    end if;
    v_seen_lines := array_append(v_seen_lines, v_item_line_id);

    -- Lock and verify line
    select * into v_line from public.workforce_payroll_lines
      where id=v_item_line_id and period_id=p_period_id for update;
    if not found then raise exception 'WORKFORCE_PAYROLL_LINE_NOT_FOUND'; end if;
    if v_line.version <> v_item_version then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
    if v_line.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;

    -- Get shift date
    select s.date into v_shift_date from public.workforce_actual_segments a
      join public.shifts s on s.id=a.shift_id where a.id=v_line.segment_id;

    -- Verify new rate card exists and is valid for this staff/role/date
    select * into v_rate from public.workforce_rate_cards where id=v_item_rate_id;
    if not found or v_rate.approved_by is null or v_rate.operational_role <> v_line.operational_role
      or (v_rate.staff_id is not null and v_rate.staff_id <> v_line.staff_id)
      or v_rate.effective_from > v_shift_date
      or (v_rate.effective_through is not null and v_rate.effective_through < v_shift_date) then
      raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
    end if;

    -- Staff-specific precedence: cannot use role-default if a valid staff-specific rate exists
    if v_rate.staff_id is null and exists (
      select 1 from public.workforce_rate_cards specific
      where specific.staff_id = v_line.staff_id
        and specific.operational_role = v_line.operational_role
        and specific.approved_by is not null
        and specific.effective_from <= v_shift_date
        and (specific.effective_through is null or specific.effective_through >= v_shift_date)
    ) then
      raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
    end if;

    v_previous_lines := v_previous_lines || jsonb_build_array(to_jsonb(v_line));

    -- Calculate new gross
    v_new_gross := round(v_rate.vnd_per_hour::numeric *
      ((v_line.payable_minutes - v_line.overtime_minutes)::numeric
        + v_line.overtime_minutes::numeric * v_rate.overtime_multiplier_basis_points / 10000) / 60)::bigint;

    -- Preserve existing adjustment_vnd exactly
    v_new_net := v_new_gross + v_line.adjustment_vnd;
    if v_new_net < 0 or v_new_net > 1000000000000 then
      raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
    end if;

    update public.workforce_payroll_lines
      set rate_card_id = v_rate.id,
          rate_vnd_per_hour = v_rate.vnd_per_hour,
          overtime_multiplier_basis_points = v_rate.overtime_multiplier_basis_points,
          gross_vnd = v_new_gross,
          version = v_line.version + 1,
          updated_at = statement_timestamp()
      where id = v_line.id
      returning * into v_line;

    v_updated_lines := v_updated_lines || jsonb_build_array(to_jsonb(v_line));
  end loop;

  -- Record batch audit
  insert into public.workforce_payroll_audit(
    period_id, line_id, line_version, action, actor_id, reason,
    request_id, request_payload, previous_values, updated_values
  ) values (
    p_period_id, null, null, 'recalculate_batch', p_actor_id, p_reason,
    p_request_id, v_payload, v_previous_lines, v_updated_lines
  ) returning * into v_audit;

  return jsonb_build_object('lines', v_updated_lines, 'audit', to_jsonb(v_audit), 'replayed', false);
end $$;

-- 6. Unreconciled Segment Guard on Period Review/Confirm
-- Ensure no approved worked segments in period range are omitted before period can advance to reviewed/confirmed
create or replace function public.workforce_rc16b_period_review_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('reviewed','payroll_ready','locked') and not exists (
      select 1 from public.workforce_payroll_lines where period_id=old.id and voided_at is null
    ) then raise exception 'WORKFORCE_PAYROLL_EMPTY_PERIOD'; end if;

    if new.status='reviewed' and (
      new.reviewed_by = old.created_by
      or exists (
        select 1 from public.workforce_payroll_audit where period_id=old.id
          and action in ('correct_line','void_line','recalculate_line','recalculate_batch','auto_calculate_batch')
          and actor_id=new.reviewed_by
      )
    ) then raise exception 'WORKFORCE_PAYROLL_SELF_REVIEW'; end if;

    -- Block review/lock if approved worked segments in this period have no line (active or void)
    if new.status in ('reviewed','confirmed') and exists (
      select 1 from public.workforce_actual_segments a
      join public.shifts s on s.id=a.shift_id
      where s.deleted_at is null
        and s.date >= old.period_start and s.date <= old.period_end
        and a.event_kind = 'worked' and a.review_status = 'approved'
        and not exists (
          select 1 from public.workforce_payroll_lines l where l.segment_id = a.id
        )
    ) then
      raise exception 'WORKFORCE_PAYROLL_UNRECONCILED_SEGMENTS_REMAIN';
    end if;
  end if;
  return new;
end $$;

-- 7. Atomic RPC for auto_calculate_draft batch (inserting new lines and recalculating existing lines in a single transaction)
create or replace function public.workforce_rc17b_auto_calculate_draft_batch(
  p_period_id text,
  p_request_id uuid,
  p_actor_id text,
  p_reason text default null,
  p_insert_lines jsonb default '[]'::jsonb,
  p_recalc_items jsonb default '[]'::jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_line public.workforce_payroll_lines%rowtype;
  v_new_line public.workforce_payroll_lines%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_audit public.workforce_payroll_audit%rowtype;
  v_payload jsonb;
  v_previous_lines jsonb := '[]'::jsonb;
  v_inserted_lines jsonb := '[]'::jsonb;
  v_recalculated_lines jsonb := '[]'::jsonb;
  v_updated_result jsonb;
  v_ins jsonb;
  v_item jsonb;
  v_item_line_id text;
  v_item_version integer;
  v_item_rate_id text;
  v_segment_id text;
  v_shift_date date;
  v_new_gross bigint;
  v_new_net bigint;
  v_seen_segments text[] := '{}';
  v_seen_lines text[] := '{}';
begin
  if not exists (select 1 from public.business_users where id=p_actor_id
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN' using errcode='42501';
  end if;

  if p_request_id is null then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;
  if p_reason is not null and char_length(trim(p_reason)) not between 8 and 2000 then
    raise exception 'WORKFORCE_CORRECTION_REASON_REQUIRED';
  end if;

  v_payload := jsonb_build_object(
    'period_id', p_period_id,
    'action', 'auto_calculate_batch',
    'reason', p_reason,
    'insert_lines', coalesce(p_insert_lines, '[]'::jsonb),
    'recalc_items', coalesce(p_recalc_items, '[]'::jsonb)
  );

  -- Serialize request idempotency per actor+request_id
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text, 0));

  select * into v_audit from public.workforce_payroll_audit
    where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_audit.request_payload is distinct from v_payload then
      raise exception 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'inserted_lines', coalesce(v_audit.updated_values->'inserted_lines', '[]'::jsonb),
      'recalculated_lines', coalesce(v_audit.updated_values->'recalculated_lines', '[]'::jsonb),
      'audit', to_jsonb(v_audit),
      'replayed', true
    );
  end if;

  -- Lock period for update and ensure it is still draft
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;

  -- 1. Insert new lines
  if p_insert_lines is not null and jsonb_typeof(p_insert_lines) = 'array' then
    for v_ins in select * from jsonb_array_elements(p_insert_lines) loop
      v_segment_id := v_ins->>'segment_id';
      if v_segment_id is null then
        raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
      end if;

      if v_segment_id = any(v_seen_segments) then
        raise exception 'WORKFORCE_PAYROLL_DUPLICATE_SEGMENT';
      end if;
      v_seen_segments := array_append(v_seen_segments, v_segment_id);

      if exists (select 1 from public.workforce_payroll_lines where segment_id = v_segment_id) then
        raise exception 'WORKFORCE_PAYROLL_DUPLICATE_SEGMENT';
      end if;

      insert into public.workforce_payroll_lines (
        period_id, segment_id, rate_card_id, staff_id, operational_role,
        actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour,
        overtime_multiplier_basis_points, gross_vnd, adjustment_vnd,
        adjustment_reason, calculation_version
      ) values (
        p_period_id,
        v_segment_id,
        v_ins->>'rate_card_id',
        v_ins->>'staff_id',
        v_ins->>'operational_role',
        (v_ins->>'actual_minutes')::integer,
        (v_ins->>'payable_minutes')::integer,
        (v_ins->>'overtime_minutes')::integer,
        (v_ins->>'rate_vnd_per_hour')::integer,
        (v_ins->>'overtime_multiplier_basis_points')::integer,
        (v_ins->>'gross_vnd')::bigint,
        coalesce((v_ins->>'adjustment_vnd')::bigint, 0),
        v_ins->>'adjustment_reason',
        coalesce(v_ins->>'calculation_version', 'rc17b-v1')
      ) returning * into v_new_line;

      v_inserted_lines := v_inserted_lines || jsonb_build_array(to_jsonb(v_new_line));
    end loop;
  end if;

  -- 2. Recalculate existing lines
  if p_recalc_items is not null and jsonb_typeof(p_recalc_items) = 'array' and jsonb_array_length(p_recalc_items) > 0 then
    perform set_config('workforce.rc17b_recalc_call', '1', true);

    for v_item in select * from jsonb_array_elements(p_recalc_items) loop
      v_item_line_id := v_item->>'line_id';
      v_item_version := (v_item->>'expected_version')::integer;
      v_item_rate_id := v_item->>'new_rate_card_id';

      if v_item_line_id is null or v_item_version is null or v_item_version < 1 or v_item_rate_id is null then
        raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
      end if;

      if v_item_line_id = any(v_seen_lines) then
        raise exception 'WORKFORCE_PAYROLL_DUPLICATE_LINE_IN_BATCH';
      end if;
      v_seen_lines := array_append(v_seen_lines, v_item_line_id);

      select * into v_line from public.workforce_payroll_lines
        where id=v_item_line_id and period_id=p_period_id for update;
      if not found then raise exception 'WORKFORCE_PAYROLL_LINE_NOT_FOUND'; end if;
      if v_line.version <> v_item_version then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
      if v_line.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;

      select s.date into v_shift_date from public.workforce_actual_segments a
        join public.shifts s on s.id=a.shift_id where a.id=v_line.segment_id;

      select * into v_rate from public.workforce_rate_cards where id=v_item_rate_id;
      if not found or v_rate.approved_by is null or v_rate.operational_role <> v_line.operational_role
        or (v_rate.staff_id is not null and v_rate.staff_id <> v_line.staff_id)
        or v_rate.effective_from > v_shift_date
        or (v_rate.effective_through is not null and v_rate.effective_through < v_shift_date) then
        raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
      end if;

      if v_rate.staff_id is null and exists (
        select 1 from public.workforce_rate_cards specific
        where specific.staff_id = v_line.staff_id
          and specific.operational_role = v_line.operational_role
          and specific.approved_by is not null
          and specific.effective_from <= v_shift_date
          and (specific.effective_through is null or specific.effective_through >= v_shift_date)
      ) then
        raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
      end if;

      v_previous_lines := v_previous_lines || jsonb_build_array(to_jsonb(v_line));

      v_new_gross := round(v_rate.vnd_per_hour::numeric *
        ((v_line.payable_minutes - v_line.overtime_minutes)::numeric
          + v_line.overtime_minutes::numeric * v_rate.overtime_multiplier_basis_points / 10000) / 60)::bigint;

      v_new_net := v_new_gross + v_line.adjustment_vnd;
      if v_new_net < 0 or v_new_net > 1000000000000 then
        raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
      end if;

      update public.workforce_payroll_lines
        set rate_card_id = v_rate.id,
            rate_vnd_per_hour = v_rate.vnd_per_hour,
            overtime_multiplier_basis_points = v_rate.overtime_multiplier_basis_points,
            gross_vnd = v_new_gross,
            version = v_line.version + 1,
            updated_at = statement_timestamp()
        where id = v_line.id
        returning * into v_line;

      v_recalculated_lines := v_recalculated_lines || jsonb_build_array(to_jsonb(v_line));
    end loop;
  end if;

  v_updated_result := jsonb_build_object(
    'inserted_lines', v_inserted_lines,
    'recalculated_lines', v_recalculated_lines
  );

  insert into public.workforce_payroll_audit(
    period_id, line_id, line_version, action, actor_id, reason,
    request_id, request_payload, previous_values, updated_values
  ) values (
    p_period_id, null, null, 'auto_calculate_batch', p_actor_id, coalesce(p_reason, 'Auto-calculate payroll draft batch'),
    p_request_id, v_payload, v_previous_lines, v_updated_result
  ) returning * into v_audit;

  return jsonb_build_object(
    'inserted_lines', v_inserted_lines,
    'recalculated_lines', v_recalculated_lines,
    'audit', to_jsonb(v_audit),
    'replayed', false
  );
end $$;

grant execute on function public.workforce_rc17b_register_rate_card(text,text,date,date,integer,integer,text,text) to service_role;
grant execute on function public.workforce_rc17b_recalculate_draft_line(text,text,integer,uuid,text,text,text) to service_role;
grant execute on function public.workforce_rc17b_recalculate_draft_batch(text,uuid,text,text,jsonb) to service_role;
grant execute on function public.workforce_rc17b_auto_calculate_draft_batch(text,uuid,text,text,jsonb,jsonb) to service_role;
