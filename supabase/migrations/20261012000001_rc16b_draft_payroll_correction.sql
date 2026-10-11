-- RC1.6B additive migration, ordered after RC1.6 foundation. Test/UAT only.
-- Voids retain the global segment reservation; no reissue/unvoid in this release.
alter table public.workforce_payroll_lines
  add column version integer not null default 1 check (version >= 1),
  add column updated_at timestamptz not null default statement_timestamp(),
  add column voided_at timestamptz,
  add constraint workforce_payroll_money_bounds check (
    adjustment_vnd between -1000000000000 and 1000000000000
    and net_vnd <= 1000000000000
  );

alter table public.workforce_payroll_audit
  drop constraint workforce_payroll_audit_action_check,
  add constraint workforce_payroll_audit_action_check check (
    action in ('review','confirm','mark_ready','lock','reopen','adjustment','correct_line','void_line')
  ),
  add column line_id text references public.workforce_payroll_lines(id) on delete restrict,
  add column line_version integer,
  add column request_id uuid,
  add column request_payload jsonb,
  add column previous_values jsonb,
  add column updated_values jsonb,
  add constraint workforce_line_audit_fields check (
    action not in ('correct_line','void_line') or (
      line_id is not null and line_version is not null and line_version >= 2
      and request_id is not null and request_payload is not null
      and previous_values is not null and updated_values is not null
    )
  );
create unique index workforce_line_audit_request
  on public.workforce_payroll_audit(actor_id,request_id) where request_id is not null;
create unique index workforce_line_audit_version
  on public.workforce_payroll_audit(line_id,line_version) where line_id is not null;
grant usage, select on sequence public.workforce_payroll_audit_id_seq to service_role;

create function public.workforce_rc16b_line_change_guard()
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
  if coalesce(current_setting('workforce.rc16b_line_call',true),'') <> '1' then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_REQUIRES_RPC';
  end if;
  if old.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;
  if new.version <> old.version+1 then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
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
create trigger workforce_line_change_guard before insert or update or delete
  on public.workforce_payroll_lines for each row
  execute function public.workforce_rc16b_line_change_guard();

create function public.workforce_rc16b_period_review_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('reviewed','payroll_ready','locked') and not exists (
      select 1 from public.workforce_payroll_lines where period_id=old.id and voided_at is null
    ) then raise exception 'WORKFORCE_PAYROLL_EMPTY_PERIOD'; end if;
    if new.status='reviewed' and exists (
      select 1 from public.workforce_payroll_audit where period_id=old.id
        and action in ('correct_line','void_line') and actor_id=new.reviewed_by
    ) then raise exception 'WORKFORCE_PAYROLL_SELF_REVIEW'; end if;
  end if;
  return new;
end $$;
create trigger workforce_period_review_guard before update
  on public.workforce_payroll_periods for each row
  execute function public.workforce_rc16b_period_review_guard();

create function public.workforce_rc16b_correct_payroll_line(
  p_period_id text,p_line_id text,p_expected_version integer,p_request_id uuid,
  p_action text,p_actor_id text,p_reason text,
  p_payable_minutes integer default null,p_overtime_minutes integer default null,
  p_adjustment_vnd bigint default null,p_adjustment_reason text default null,
  p_expected_gross_vnd bigint default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_line public.workforce_payroll_lines%rowtype;
  v_audit public.workforce_payroll_audit%rowtype;
  v_period public.workforce_payroll_periods%rowtype;
  v_previous jsonb;
  v_payload jsonb;
  v_gross bigint;
begin
  if not exists (select 1 from public.business_users where id=p_actor_id
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN' using errcode='42501';
  end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 1
    or p_expected_version >= 2147483647 or p_action is null
    or p_action not in ('correct_line','void_line')
    or char_length(trim(coalesce(p_reason,''))) not between 8 and 2000 then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;
  v_payload := jsonb_build_object(
    'period_id',p_period_id,'line_id',p_line_id,'expected_version',p_expected_version,
    'action',p_action,'reason',p_reason,'payable_minutes',p_payable_minutes,
    'overtime_minutes',p_overtime_minutes,'adjustment_vnd',p_adjustment_vnd,
    'adjustment_reason',p_adjustment_reason,'expected_gross_vnd',p_expected_gross_vnd);
  -- Serialize the request key before period/line locks, including retries.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text,0));
  select * into v_audit from public.workforce_payroll_audit
    where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_audit.request_payload is distinct from v_payload then
      raise exception 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('line',v_audit.updated_values,'audit',to_jsonb(v_audit),'replayed',true);
  end if;
  -- Same lock order as prepare_line and period transitions: period, then line.
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;
  select * into v_line from public.workforce_payroll_lines
    where id=p_line_id and period_id=p_period_id for update;
  if not found then raise exception 'WORKFORCE_PAYROLL_LINE_NOT_FOUND'; end if;
  if v_line.version <> p_expected_version then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
  if v_line.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;
  v_previous := to_jsonb(v_line);
  if p_action='correct_line' then
    if p_payable_minutes is null or p_payable_minutes not between 0 and v_line.actual_minutes
      or p_overtime_minutes is null or p_overtime_minutes not between 0 and p_payable_minutes
      or p_adjustment_vnd is null or p_adjustment_vnd not between -1000000000000 and 1000000000000
      or (p_adjustment_vnd=0 and p_adjustment_reason is not null)
      or (p_adjustment_vnd<>0 and char_length(trim(coalesce(p_adjustment_reason,''))) not between 8 and 1000)
    then raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID'; end if;
    v_gross := round(v_line.rate_vnd_per_hour::numeric *
      ((p_payable_minutes-p_overtime_minutes)::numeric
        + p_overtime_minutes::numeric*v_line.overtime_multiplier_basis_points/10000)/60)::bigint;
    if p_expected_gross_vnd is null or p_expected_gross_vnd <> v_gross then
      raise exception 'WORKFORCE_PAYROLL_GROSS_MISMATCH';
    end if;
    if v_gross+p_adjustment_vnd not between 0 and 1000000000000 then
      raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
    end if;
  elsif p_payable_minutes is not null or p_overtime_minutes is not null
    or p_adjustment_vnd is not null or p_adjustment_reason is not null or p_expected_gross_vnd is not null then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;
  perform set_config('workforce.rc16b_line_call','1',true);
  if p_action='correct_line' then
    update public.workforce_payroll_lines set
      payable_minutes=p_payable_minutes,overtime_minutes=p_overtime_minutes,
      adjustment_vnd=p_adjustment_vnd,adjustment_reason=p_adjustment_reason,gross_vnd=v_gross,
      version=version+1,updated_at=statement_timestamp()
      where id=p_line_id returning * into v_line;
  else
    update public.workforce_payroll_lines set voided_at=statement_timestamp(),
      version=version+1,updated_at=statement_timestamp()
      where id=p_line_id returning * into v_line;
  end if;
  perform set_config('workforce.rc16b_line_call','',true);
  insert into public.workforce_payroll_audit(
    period_id,line_id,line_version,action,from_status,to_status,actor_id,reason,
    request_id,request_payload,previous_values,updated_values
  ) values (
    p_period_id,p_line_id,v_line.version,p_action,'draft','draft',p_actor_id,p_reason,
    p_request_id,v_payload,v_previous,to_jsonb(v_line)
  ) returning * into v_audit;
  return jsonb_build_object('line',to_jsonb(v_line),'audit',to_jsonb(v_audit),'replayed',false);
end $$;

revoke all on function public.workforce_rc16b_line_change_guard(),
  public.workforce_rc16b_period_review_guard(),
  public.workforce_rc16b_correct_payroll_line(text,text,integer,uuid,text,text,text,integer,integer,bigint,text,bigint)
  from public,anon,authenticated;
grant execute on function
  public.workforce_rc16b_correct_payroll_line(text,text,integer,uuid,text,text,text,integer,integer,bigint,text,bigint)
  to service_role;
