begin;

create table public.workforce_payroll_segment_decisions (
  segment_id text primary key references public.workforce_actual_segments(id) on delete restrict,
  state text not null check (state in ('payroll_hold','pending_admin_confirmation','admin_confirmed')),
  reviewed_by text references public.business_users(id) on delete restrict,
  preapproved_by text references public.business_users(id) on delete restrict,
  confirmed_by text references public.business_users(id) on delete restrict,
  confirmed_at timestamptz,
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  missing_evidence text[] not null default '{}',
  segment_version integer not null check (segment_version > 0),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default statement_timestamp(),
  check ((state='admin_confirmed' and confirmed_by is not null and confirmed_at is not null)
    or (state<>'admin_confirmed' and confirmed_by is null and confirmed_at is null)),
  check (state<>'pending_admin_confirmation' or preapproved_by is not null)
);

create table public.workforce_payroll_segment_decision_events (
  id uuid primary key default gen_random_uuid(),
  segment_id text not null references public.workforce_actual_segments(id) on delete restrict,
  actor_id text not null references public.business_users(id) on delete restrict,
  actor_role text not null check (actor_role in ('admin','leader')),
  action text not null check (action in ('leader_preapprove','admin_direct_confirm','admin_confirm','payroll_hold')),
  from_state text,
  to_state text not null check (to_state in ('payroll_hold','pending_admin_confirmation','admin_confirmed')),
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  missing_evidence text[] not null default '{}',
  version integer not null check (version > 0),
  idempotency_key uuid unique,
  created_at timestamptz not null default statement_timestamp(),
  unique (segment_id, version)
);
create index workforce_payroll_segment_decision_events_segment_idx
  on public.workforce_payroll_segment_decision_events(segment_id, created_at desc);

alter table public.workforce_payroll_segment_decisions enable row level security;
alter table public.workforce_payroll_segment_decision_events enable row level security;
revoke all on public.workforce_payroll_segment_decisions, public.workforce_payroll_segment_decision_events from public, anon, authenticated;
grant select on public.workforce_payroll_segment_decisions to service_role;
grant select, insert on public.workforce_payroll_segment_decision_events to service_role;

create or replace function private.rc19_c515_required_payroll_evidence(p_segment_id text)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare
  v_segment public.workforce_actual_segments%rowtype;
  v_shift public.shifts%rowtype;
  v_report public.reports%rowtype;
  v_missing text[] := '{}';
  v_kind text;
  v_event public.self_attendance_events%rowtype;
  v_photo_request uuid;
  v_photo_revision integer;
  v_review public.self_attendance_photo_review_events%rowtype;
begin
  select * into v_segment from public.workforce_actual_segments where id=p_segment_id;
  if not found or v_segment.event_kind<>'worked' then return array['approved_worked_segment']; end if;
  select * into v_shift from public.shifts where id=v_segment.shift_id and deleted_at is null;
  if not found then return array['active_shift']; end if;

  select * into v_report from public.reports
    where shift_id=v_segment.shift_id and deleted_at is null and archived_at is null;
  if not found or v_report.status<>'confirmed' or not v_report.metrics_confirmed then
    v_missing:=array_append(v_missing,'final_report');
  end if;
  if not found or not exists (
    select 1 from public.live_report_images image
    where image.report_id=v_report.id and image.category='key_visual'
      and image.provider in ('google_drive','onedrive')
      and nullif(btrim(image.external_file_id),'') is not null
      and nullif(btrim(image.external_parent_id),'') is not null
      and image.checksum_sha256 ~ '^[a-f0-9]{64}$'
  ) then
    v_missing:=array_append(v_missing,'visibility_kv');
  end if;

  if v_segment.operational_role in ('host','support') then
    foreach v_kind in array array['check_in','check_out'] loop
      select * into v_event from public.self_attendance_events
       where shift_id=v_segment.shift_id and staff_id=v_segment.staff_id
         and operational_role=v_segment.operational_role and event_kind=v_kind;
      if not found then
        v_missing:=array_append(v_missing,v_kind||'_photo_review');
        continue;
      end if;
      select request_id into v_photo_request from public.self_attendance_photo_evidence
       where request_id=v_event.request_id and shift_id=v_segment.shift_id
         and staff_id=v_segment.staff_id and operational_role=v_segment.operational_role;
      if not found then
        v_missing:=array_append(v_missing,v_kind||'_photo_receipt');
        continue;
      end if;
      select revision,request_id into v_photo_revision,v_photo_request
        from public.self_attendance_photo_evidence_revisions
       where attendance_event_id=v_event.id order by revision desc limit 1;
      if not found then
        v_photo_revision:=1;
        v_photo_request:=v_event.request_id;
      end if;
      select * into v_review from public.self_attendance_photo_review_events
       where attendance_event_id=v_event.id order by version desc limit 1;
      if not found or v_review.decision<>'approved'
        or v_review.evidence_request_id<>v_photo_request
        or v_review.evidence_revision<>v_photo_revision then
        v_missing:=array_append(v_missing,v_kind||'_photo_review');
      end if;
    end loop;
  end if;
  return v_missing;
end;
$$;
alter function private.rc19_c515_required_payroll_evidence(text) owner to postgres;
revoke all on function private.rc19_c515_required_payroll_evidence(text) from public, anon, authenticated, service_role;

create or replace function public.rc19_c515_record_payroll_review(
  p_segment_id text, p_segment_version integer, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.current_business_user_id();
  v_role text := private.current_system_permission();
  v_segment public.workforce_actual_segments%rowtype;
  v_shift public.shifts%rowtype;
  v_state public.workforce_payroll_segment_decisions%rowtype;
  v_missing text[];
  v_target text;
  v_next_version integer;
begin
  if v_actor is null or not private.current_business_user_is_active()
    or not public.rbac01_effective_permission('shifts.assign_staff')
    or v_role not in ('admin','leader')
    or p_segment_id is null or p_segment_version is null or p_segment_version<1
    or p_reason is null or char_length(btrim(p_reason))<8 or char_length(p_reason)>2000 then
    raise exception using errcode='42501',message='C515_PAYROLL_REVIEW_FORBIDDEN';
  end if;
  select * into v_segment from public.workforce_actual_segments
   where id=p_segment_id for update;
  if not found or v_segment.review_status<>'approved' or v_segment.version<>p_segment_version
    or v_segment.reviewed_by<>v_actor or v_segment.created_by=v_actor then
    raise exception using errcode='42501',message='C515_PAYROLL_REVIEW_ATTESTATION_INVALID';
  end if;
  select * into v_shift from public.shifts where id=v_segment.shift_id and deleted_at is null;
  if not found then raise exception using errcode='42501',message='C515_PAYROLL_SHIFT_UNAVAILABLE'; end if;
  if v_role='leader' and not private.rc19_has_any_leader_brand_scope(
    v_shift.brand_id,array['staff.manage','workforce.read']::text[]
  ) then raise exception using errcode='42501',message='C515_PAYROLL_BRAND_SCOPE_DENIED'; end if;
  if v_role='admin' and not public.rbac01_effective_permission('payroll.manage') then
    raise exception using errcode='42501',message='C515_PAYROLL_ADMIN_PERMISSION_REQUIRED';
  end if;

  select * into v_state from public.workforce_payroll_segment_decisions
    where segment_id=p_segment_id for update;
  if found then
    if v_state.segment_version=p_segment_version and
      v_state.reviewed_by=v_actor then
      return jsonb_build_object('state',v_state.state,'version',v_state.version,
        'missing_evidence',v_state.missing_evidence,'replayed',true);
    end if;
    raise exception using errcode='40001',message='C515_PAYROLL_DECISION_STALE';
  end if;

  v_missing:=private.rc19_c515_required_payroll_evidence(p_segment_id);
  v_target:=case when cardinality(v_missing)>0 then 'payroll_hold'
    when v_role='admin' then 'admin_confirmed' else 'pending_admin_confirmation' end;
  insert into public.workforce_payroll_segment_decisions(
    segment_id,state,reviewed_by,preapproved_by,confirmed_by,confirmed_at,reason,missing_evidence,
    segment_version,version,updated_at
  ) values (
    p_segment_id,v_target,v_actor,case when v_role='leader' then v_actor end,
    case when v_role='admin' and cardinality(v_missing)=0 then v_actor end,
    case when v_role='admin' and cardinality(v_missing)=0 then statement_timestamp() end,
    btrim(p_reason),v_missing,p_segment_version,1,statement_timestamp()
  ) returning * into v_state;
  insert into public.workforce_payroll_segment_decision_events(
    segment_id,actor_id,actor_role,action,from_state,to_state,reason,missing_evidence,version
  ) values (p_segment_id,v_actor,v_role,
    case when cardinality(v_missing)>0 then 'payroll_hold'
      when v_role='admin' then 'admin_direct_confirm' else 'leader_preapprove' end,
    null,v_target,btrim(p_reason),v_missing,1);
  return jsonb_build_object('state',v_state.state,'version',v_state.version,
    'missing_evidence',v_state.missing_evidence,'replayed',false);
end;
$$;
alter function public.rc19_c515_record_payroll_review(text,integer,text) owner to postgres;
revoke all on function public.rc19_c515_record_payroll_review(text,integer,text) from public, anon, service_role;
grant execute on function public.rc19_c515_record_payroll_review(text,integer,text) to authenticated;

create or replace function public.rc19_c515_confirm_payroll_segment(
  p_segment_id text, p_expected_version integer, p_idempotency_key uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.current_business_user_id();
  v_role text := private.current_system_permission();
  v_segment public.workforce_actual_segments%rowtype;
  v_state public.workforce_payroll_segment_decisions%rowtype;
  v_event public.workforce_payroll_segment_decision_events%rowtype;
  v_missing text[];
  v_old_state text;
  v_next_version integer;
begin
  if v_actor is null or not private.current_business_user_is_active() or v_role<>'admin'
    or not public.rbac01_effective_permission('payroll.manage') then
    raise exception using errcode='42501',message='C515_PAYROLL_ADMIN_CONFIRMATION_FORBIDDEN';
  end if;
  if p_segment_id is null or p_expected_version is null or p_expected_version<0
    or p_idempotency_key is null or p_reason is null
    or char_length(btrim(p_reason))<8 or char_length(p_reason)>2000 then
    raise exception using errcode='22023',message='C515_PAYROLL_CONFIRMATION_INVALID';
  end if;
  select * into v_segment from public.workforce_actual_segments where id=p_segment_id for update;
  if not found or v_segment.review_status<>'approved' or v_segment.event_kind<>'worked'
    or v_segment.created_by=v_actor then
    raise exception using errcode='42501',message='C515_PAYROLL_SEGMENT_NOT_CONFIRMABLE';
  end if;
  select * into v_event from public.workforce_payroll_segment_decision_events
    where idempotency_key=p_idempotency_key;
  if found then
    if v_event.segment_id<>p_segment_id or v_event.actor_id<>v_actor
      or v_event.reason<>btrim(p_reason) then
      raise exception using errcode='23505',message='C515_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    select * into v_state from public.workforce_payroll_segment_decisions where segment_id=p_segment_id;
    return jsonb_build_object('state',v_state.state,'version',v_state.version,
      'missing_evidence',v_state.missing_evidence,'replayed',true);
  end if;
  select * into v_state from public.workforce_payroll_segment_decisions
    where segment_id=p_segment_id for update;
  if found and v_state.version<>p_expected_version then
    raise exception using errcode='40001',message='C515_PAYROLL_DECISION_STALE';
  elsif not found and p_expected_version<>0 then
    raise exception using errcode='40001',message='C515_PAYROLL_DECISION_STALE';
  end if;
  if found and v_state.segment_version<>v_segment.version then
    raise exception using errcode='40001',message='C515_PAYROLL_ACTUAL_REVIEW_STALE';
  end if;
  if v_state.preapproved_by=v_actor and v_state.state<>'admin_confirmed' then
    raise exception using errcode='42501',message='C515_PAYROLL_SELF_ESCALATION_BLOCKED';
  end if;
  v_missing:=private.rc19_c515_required_payroll_evidence(p_segment_id);
  v_old_state:=case when v_state.segment_id is null then null else v_state.state end;
  v_next_version:=coalesce(v_state.version,0)+1;
  if cardinality(v_missing)>0 then
    if v_state.segment_id is null then
      insert into public.workforce_payroll_segment_decisions(
        segment_id,state,reviewed_by,reason,missing_evidence,segment_version,version
      ) values (p_segment_id,'payroll_hold',v_segment.reviewed_by,btrim(p_reason),v_missing,v_segment.version,v_next_version)
      returning * into v_state;
    else
      update public.workforce_payroll_segment_decisions set state='payroll_hold',confirmed_by=null,
        confirmed_at=null,reason=btrim(p_reason),missing_evidence=v_missing,
        segment_version=v_segment.version,version=v_next_version,updated_at=statement_timestamp()
       where segment_id=p_segment_id returning * into v_state;
    end if;
    insert into public.workforce_payroll_segment_decision_events(
      segment_id,actor_id,actor_role,action,from_state,to_state,reason,missing_evidence,version,idempotency_key
    ) values (p_segment_id,v_actor,'admin','payroll_hold',v_old_state,'payroll_hold',btrim(p_reason),v_missing,v_next_version,p_idempotency_key);
  else
    if v_state.segment_id is null then
      insert into public.workforce_payroll_segment_decisions(
        segment_id,state,reviewed_by,confirmed_by,confirmed_at,reason,missing_evidence,segment_version,version
      ) values (p_segment_id,'admin_confirmed',v_segment.reviewed_by,v_actor,statement_timestamp(),btrim(p_reason),'{}',v_segment.version,v_next_version)
      returning * into v_state;
    else
      update public.workforce_payroll_segment_decisions set state='admin_confirmed',confirmed_by=v_actor,
        confirmed_at=statement_timestamp(),reason=btrim(p_reason),missing_evidence='{}',
        segment_version=v_segment.version,version=v_next_version,updated_at=statement_timestamp()
       where segment_id=p_segment_id returning * into v_state;
    end if;
    insert into public.workforce_payroll_segment_decision_events(
      segment_id,actor_id,actor_role,action,from_state,to_state,reason,missing_evidence,version,idempotency_key
    ) values (p_segment_id,v_actor,'admin','admin_confirm',v_old_state,'admin_confirmed',btrim(p_reason),'{}',v_next_version,p_idempotency_key);
  end if;
  return jsonb_build_object('state',v_state.state,'version',v_state.version,
    'missing_evidence',v_state.missing_evidence,'replayed',false);
end;
$$;
alter function public.rc19_c515_confirm_payroll_segment(text,integer,uuid,text) owner to postgres;
revoke all on function public.rc19_c515_confirm_payroll_segment(text,integer,uuid,text) from public, anon, service_role;
grant execute on function public.rc19_c515_confirm_payroll_segment(text,integer,uuid,text) to authenticated;

create or replace function public.rc19_c515_refresh_payroll_gates(p_segment_ids text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.current_business_user_id();
  v_id text;
  v_segment public.workforce_actual_segments%rowtype;
  v_state public.workforce_payroll_segment_decisions%rowtype;
  v_missing text[];
  v_result jsonb := '[]'::jsonb;
  v_next_version integer;
  v_old_state text;
begin
  if v_actor is null or not private.current_business_user_is_active()
    or private.current_system_permission()<>'admin'
    or not public.rbac01_effective_permission('payroll.manage') then
    raise exception using errcode='42501',message='C515_PAYROLL_GATE_REFRESH_FORBIDDEN';
  end if;
  if p_segment_ids is null or cardinality(p_segment_ids)>500
    or cardinality(p_segment_ids)<>(select count(distinct id) from unnest(p_segment_ids) as input_ids(id))
    or exists(select 1 from unnest(p_segment_ids) as input_ids(id) where id is null or btrim(id)='') then
    raise exception using errcode='22023',message='C515_PAYROLL_GATE_REFRESH_INVALID';
  end if;
  for v_id in select id from unnest(p_segment_ids) as requested(id) order by id loop
    select * into v_segment from public.workforce_actual_segments where id=v_id for update;
    if not found or v_segment.review_status<>'approved' or v_segment.event_kind<>'worked' then
      raise exception using errcode='23514',message='C515_PAYROLL_SEGMENT_NOT_APPROVED';
    end if;
    select * into v_state from public.workforce_payroll_segment_decisions
      where segment_id=v_id for update;
    v_missing:=private.rc19_c515_required_payroll_evidence(v_id);
    if v_state.segment_id is not null and v_state.segment_version<>v_segment.version then
      v_missing:=array_append(v_missing,'actual_hours_review');
    end if;
    v_old_state:=case when v_state.segment_id is null then null else v_state.state end;
    if cardinality(v_missing)>0 and (v_state.segment_id is null or v_state.state<>'payroll_hold'
      or v_state.missing_evidence is distinct from v_missing) then
      v_next_version:=coalesce(v_state.version,0)+1;
      if v_state.segment_id is null then
        insert into public.workforce_payroll_segment_decisions(
          segment_id,state,reviewed_by,preapproved_by,reason,missing_evidence,segment_version,version
        ) values (v_id,'payroll_hold',v_segment.reviewed_by,null,
          'Required persisted report or evidence is incomplete.',v_missing,v_segment.version,v_next_version)
        returning * into v_state;
      else
        update public.workforce_payroll_segment_decisions set state='payroll_hold',confirmed_by=null,
          confirmed_at=null,reason='Required persisted report or evidence is incomplete.',
          missing_evidence=v_missing,segment_version=v_segment.version,version=v_next_version,
          updated_at=statement_timestamp() where segment_id=v_id returning * into v_state;
      end if;
      insert into public.workforce_payroll_segment_decision_events(
        segment_id,actor_id,actor_role,action,from_state,to_state,reason,missing_evidence,version
      ) values (v_id,v_actor,'admin','payroll_hold',v_old_state,'payroll_hold',
        'Required persisted report or evidence is incomplete.',v_missing,v_next_version);
    elsif v_state.segment_id is null then
      v_missing:=array_append(v_missing,'admin_confirmation');
      insert into public.workforce_payroll_segment_decisions(
        segment_id,state,reviewed_by,reason,missing_evidence,segment_version,version
      ) values (v_id,'payroll_hold',v_segment.reviewed_by,
        'Admin Payroll confirmation is required.',v_missing,v_segment.version,1)
      returning * into v_state;
      insert into public.workforce_payroll_segment_decision_events(
        segment_id,actor_id,actor_role,action,from_state,to_state,reason,missing_evidence,version
      ) values (v_id,v_actor,'admin','payroll_hold',null,'payroll_hold',
        'Admin Payroll confirmation is required.',v_missing,1);
    elsif v_state.state='payroll_hold' then
      v_missing:=array['admin_confirmation'];
      if v_state.missing_evidence is distinct from v_missing then
        v_next_version:=v_state.version+1;
        update public.workforce_payroll_segment_decisions set reason='Evidence is supplied; Admin confirmation is still required.',
          missing_evidence=v_missing,segment_version=v_segment.version,version=v_next_version,
          updated_at=statement_timestamp() where segment_id=v_id returning * into v_state;
        insert into public.workforce_payroll_segment_decision_events(
          segment_id,actor_id,actor_role,action,from_state,to_state,reason,missing_evidence,version
        ) values (v_id,v_actor,'admin','payroll_hold','payroll_hold','payroll_hold',
          'Evidence is supplied; Admin confirmation is still required.',v_missing,v_next_version);
      end if;
    elsif v_state.state<>'admin_confirmed' then
      v_missing:=array_append(v_missing,'admin_confirmation');
    end if;
    v_result:=v_result||jsonb_build_array(jsonb_build_object(
      'segment_id',v_id,'state',v_state.state,'version',v_state.version,
      'missing_evidence',v_missing,
      'verified_complete',(v_state.state='admin_confirmed' and cardinality(v_missing)=0)
    ));
  end loop;
  return v_result;
end;
$$;
alter function public.rc19_c515_refresh_payroll_gates(text[]) owner to postgres;
revoke all on function public.rc19_c515_refresh_payroll_gates(text[]) from public,anon,service_role;
grant execute on function public.rc19_c515_refresh_payroll_gates(text[]) to authenticated;

create or replace function private.rc19_c515_payroll_line_approval_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_date date;
  v_current_segment_version integer;
  v_decision_segment_version integer;
  v_state text;
  v_missing text[];
begin
  if tg_op='UPDATE' and new.segment_id is distinct from old.segment_id then
    raise exception using errcode='23514',message='C515_PAYROLL_SEGMENT_IMMUTABLE';
  end if;
  select s.date,a.version into v_date,v_current_segment_version from public.workforce_actual_segments a
    join public.shifts s on s.id=a.shift_id where a.id=new.segment_id for share of a;
  if v_date>=date '2026-11-10' then
    select state,segment_version into v_state,v_decision_segment_version
      from public.workforce_payroll_segment_decisions where segment_id=new.segment_id;
    if v_state is distinct from 'admin_confirmed' then
      raise exception using errcode='23514',message='C515_PAYROLL_ADMIN_CONFIRMATION_REQUIRED';
    end if;
    if v_decision_segment_version is distinct from v_current_segment_version then
      raise exception using errcode='23514',message='C515_PAYROLL_ACTUAL_REVIEW_STALE';
    end if;
    v_missing:=private.rc19_c515_required_payroll_evidence(new.segment_id);
    if cardinality(v_missing)>0 then
      raise exception using errcode='23514',message='C515_PAYROLL_EVIDENCE_INCOMPLETE';
    end if;
  end if;
  return new;
end;
$$;
alter function private.rc19_c515_payroll_line_approval_guard() owner to postgres;
revoke all on function private.rc19_c515_payroll_line_approval_guard() from public,anon,authenticated,service_role;
create trigger workforce_c515_admin_approval_guard
  before insert or update on public.workforce_payroll_lines
  for each row execute function private.rc19_c515_payroll_line_approval_guard();

commit;
