-- RC1.6L staged only. Never overwrite reviewed attendance or planned shifts.
alter table public.workforce_actual_segments
  add column supersedes_segment_id text references public.workforce_actual_segments(id) on delete restrict,
  add column amendment_request_id uuid,
  add column amendment_payload jsonb,
  add column amendment_reason text,
  add constraint workforce_actual_amendment_fields check (
    (supersedes_segment_id is null and amendment_request_id is null and amendment_payload is null and amendment_reason is null)
    or (supersedes_segment_id is not null and supersedes_segment_id<>id and amendment_request_id is not null
      and amendment_payload is not null and char_length(trim(amendment_reason)) between 8 and 2000)
  );
create unique index workforce_actual_amendment_request on public.workforce_actual_segments(created_by,amendment_request_id) where amendment_request_id is not null;
create unique index workforce_actual_amendment_leaf on public.workforce_actual_segments(supersedes_segment_id) where supersedes_segment_id is not null and review_status<>'rejected';

create view public.workforce_actual_active_segments with (security_invoker=true) as
  select s.* from public.workforce_actual_segments s
  where not exists(select 1 from public.workforce_actual_segments child
    where child.supersedes_segment_id=s.id and child.review_status='approved');
revoke all on public.workforce_actual_active_segments from public,anon,authenticated;
grant select on public.workforce_actual_active_segments to service_role;

create table public.workforce_actual_audit (
  id bigint generated always as identity primary key,
  shift_id text not null references public.shifts(id) on delete restrict,
  segment_id text not null references public.workforce_actual_segments(id) on delete restrict,
  actor_id text not null references public.business_users(id),
  action text not null check(action in ('record','amend','review')),
  before_values jsonb,
  after_values jsonb not null,
  created_at timestamptz not null default statement_timestamp()
);
create index workforce_actual_audit_shift on public.workforce_actual_audit(shift_id,id);
alter table public.workforce_actual_audit enable row level security;
revoke all on public.workforce_actual_audit from public,anon,authenticated,service_role;
grant select,insert on public.workforce_actual_audit to service_role;
grant usage,select on sequence public.workforce_actual_audit_id_seq to service_role;
create trigger workforce_actual_audit_immutable before update or delete on public.workforce_actual_audit
  for each row execute function public.workforce_rc16_immutable_payroll_audit();

create function public.workforce_rc16l_actual_audit() returns trigger language plpgsql set search_path='' as $$
declare v_before jsonb;
begin
  if tg_op='INSERT' and new.supersedes_segment_id is not null then
    select to_jsonb(s) into v_before from public.workforce_actual_segments s where s.id=new.supersedes_segment_id;
  elsif tg_op='UPDATE' then v_before:=to_jsonb(old); end if;
  insert into public.workforce_actual_audit(shift_id,segment_id,actor_id,action,before_values,after_values)
    values(new.shift_id,new.id,case when tg_op='UPDATE' then new.reviewed_by else new.created_by end,
      case when tg_op='UPDATE' then 'review' when new.supersedes_segment_id is not null then 'amend' else 'record' end,
      v_before,to_jsonb(new));
  return new;
end $$;
create trigger workforce_actual_audit_append after insert or update on public.workforce_actual_segments
  for each row execute function public.workforce_rc16l_actual_audit();

drop index public.workforce_one_no_show_per_shift_staff_role;
create or replace function public.workforce_rc16_immutable_approved_segment()
returns trigger language plpgsql set search_path='' as $$
declare v_source public.workforce_actual_segments%rowtype;
begin
  if tg_op='DELETE' then
    if old.review_status in ('approved','rejected') then raise exception 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE'; end if;
    raise exception 'WORKFORCE_SEGMENT_DELETE_BLOCKED';
  end if;
  if tg_op='INSERT' then
    if new.review_status<>'draft' or new.version<>1 or new.reviewed_by is not null or new.reviewed_at is not null or new.review_note is not null then
      raise exception 'WORKFORCE_SEGMENT_MUST_START_DRAFT';
    end if;
    if not exists(select 1 from public.shifts s where s.id=new.shift_id and s.status='completed' and s.deleted_at is null) then raise exception 'WORKFORCE_SHIFT_NOT_COMPLETED'; end if;
    if not exists(select 1 from public.business_users u where u.id=new.staff_id and u.status='active' and u.deleted_at is null) then raise exception 'WORKFORCE_STAFF_INVALID'; end if;
    if not exists(select 1 from public.business_users u where u.id=new.created_by and u.system_permission in ('admin','leader') and u.status='active' and u.deleted_at is null) then raise exception 'WORKFORCE_ACTOR_DENIED'; end if;
    if new.supersedes_segment_id is not null and coalesce(current_setting('workforce.rc16l_amend_call',true),'')<>'1' then raise exception 'WORKFORCE_AMENDMENT_REQUIRES_RPC'; end if;
  else
    if old.review_status in ('approved','rejected') then raise exception 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE'; end if;
    if new.version<>old.version+1 then raise exception 'WORKFORCE_ACTUAL_STALE_VERSION'; end if;
    if (to_jsonb(new)-array['review_status','review_note','reviewed_by','reviewed_at','version','updated_at']) is distinct from
      (to_jsonb(old)-array['review_status','review_note','reviewed_by','reviewed_at','version','updated_at']) then raise exception 'WORKFORCE_EVIDENCE_REQUIRES_AMENDMENT'; end if;
    if new.review_status='draft' then raise exception 'WORKFORCE_REVIEW_DECISION_REQUIRED'; end if;
    if not exists(select 1 from public.business_users u where u.id=new.reviewed_by and u.system_permission in ('admin','leader') and u.status='active' and u.deleted_at is null) then raise exception 'WORKFORCE_REVIEWER_DENIED'; end if;
    if exists(select 1 from public.workforce_actual_segments c where c.supersedes_segment_id=new.id and c.review_status<>'rejected') then raise exception 'WORKFORCE_ACTUAL_STALE_OR_LOCKED'; end if;
  end if;
  if new.supersedes_segment_id is not null then
    select * into v_source from public.workforce_actual_segments where id=new.supersedes_segment_id for update;
    if not found or v_source.shift_id<>new.shift_id or exists(select 1 from public.workforce_actual_segments c
      where c.supersedes_segment_id=v_source.id and c.id<>new.id and c.review_status<>'rejected') then raise exception 'WORKFORCE_ACTUAL_STALE_OR_LOCKED'; end if;
    if exists(select 1 from public.workforce_payroll_lines l where l.segment_id=v_source.id) then raise exception 'WORKFORCE_SEGMENT_RESERVED_BY_PAYROLL'; end if;
    if tg_op='UPDATE' and new.reviewed_by=v_source.created_by then raise exception 'WORKFORCE_SELF_REVIEW_BLOCKED'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('staff-attendance:'||new.staff_id,0));
  if tg_op='INSERT' and new.event_kind='no_show' and exists(select 1 from public.workforce_actual_active_segments existing
    where existing.shift_id=new.shift_id and existing.staff_id=new.staff_id and existing.operational_role=new.operational_role
      and existing.event_kind='no_show' and existing.review_status<>'rejected' and existing.id<>coalesce(new.supersedes_segment_id,'')) then raise exception 'WORKFORCE_NO_SHOW_CONFLICT'; end if;
  if new.review_status='approved' then
    if not exists(select 1 from public.shifts s where s.id=new.shift_id and s.status='completed' and s.deleted_at is null) then raise exception 'WORKFORCE_SHIFT_NOT_COMPLETED'; end if;
    if new.event_kind='worked' and exists(select 1 from public.workforce_actual_active_segments existing
      where existing.staff_id=new.staff_id and existing.id<>new.id and existing.id<>coalesce(new.supersedes_segment_id,'')
        and existing.review_status='approved' and existing.event_kind='worked'
        and tstzrange(existing.actual_start_at,existing.actual_end_at,'[)') && tstzrange(new.actual_start_at,new.actual_end_at,'[)')) then raise exception 'WORKFORCE_APPROVED_STAFF_OVERLAP'; end if;
    if exists(select 1 from public.workforce_actual_active_segments existing where existing.shift_id=new.shift_id and existing.staff_id=new.staff_id
      and existing.operational_role=new.operational_role and existing.id<>new.id and existing.id<>coalesce(new.supersedes_segment_id,'')
      and existing.review_status='approved' and existing.event_kind<>new.event_kind) then raise exception 'WORKFORCE_APPROVED_NO_SHOW_CONFLICT'; end if;
  end if;
  return new;
end $$;

create function public.workforce_rc16l_amend_actual(p_segment_id text,p_expected_version integer,p_request_id uuid,p_actor_id text,p_patch jsonb,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_source public.workforce_actual_segments%rowtype; v_existing public.workforce_actual_segments%rowtype; v_new public.workforce_actual_segments%rowtype; v_payload jsonb;
begin
  if p_request_id is null or p_expected_version is null or p_expected_version<1 or p_reason is null or char_length(trim(p_reason)) not between 8 and 2000 then raise exception 'WORKFORCE_AMENDMENT_INVALID'; end if;
  if not exists(select 1 from public.business_users u where u.id=p_actor_id and u.system_permission in ('admin','leader') and u.status='active' and u.deleted_at is null) then raise exception 'WORKFORCE_ACTOR_DENIED'; end if;
  v_payload:=jsonb_build_object('segment_id',p_segment_id,'expected_version',p_expected_version,'patch',p_patch,'reason',p_reason);
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text,0));
  select * into v_existing from public.workforce_actual_segments where created_by=p_actor_id and amendment_request_id=p_request_id;
  if found then
    if v_existing.amendment_payload<>v_payload then raise exception 'WORKFORCE_AMENDMENT_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('ok',true,'segment',to_jsonb(v_existing),'replayed',true);
  end if;
  select * into v_source from public.workforce_actual_segments where id=p_segment_id for update;
  if not found or v_source.version<>p_expected_version or exists(select 1 from public.workforce_actual_segments c where c.supersedes_segment_id=p_segment_id and c.review_status<>'rejected') then raise exception 'WORKFORCE_ACTUAL_STALE_OR_LOCKED'; end if;
  if v_source.supersedes_segment_id is not null and v_source.review_status<>'approved' then raise exception 'WORKFORCE_AMENDMENT_REVIEW_REQUIRED'; end if;
  perform set_config('workforce.rc16l_amend_call','1',true);
  insert into public.workforce_actual_segments(shift_id,staff_id,operational_role,event_kind,coverage_kind,actual_start_at,actual_end_at,evidence_note,created_by,
    supersedes_segment_id,amendment_request_id,amendment_payload,amendment_reason)
  values(v_source.shift_id,p_patch->>'staff_id',p_patch->>'operational_role',p_patch->>'event_kind',p_patch->>'coverage_kind',
    (p_patch->>'actual_start_at')::timestamptz,(p_patch->>'actual_end_at')::timestamptz,p_patch->>'evidence_note',p_actor_id,
    p_segment_id,p_request_id,v_payload,p_reason) returning * into v_new;
  perform set_config('workforce.rc16l_amend_call','',true);
  return jsonb_build_object('ok',true,'segment',to_jsonb(v_new),'replayed',false);
end $$;

create function public.workforce_rc16l_payroll_segment_guard() returns trigger language plpgsql set search_path='' as $$
begin
  perform 1 from public.workforce_actual_segments s where s.id=new.segment_id for update;
  if exists(select 1 from public.workforce_actual_segments c where c.supersedes_segment_id=new.segment_id and c.review_status<>'rejected') then raise exception 'WORKFORCE_SEGMENT_HAS_AMENDMENT'; end if;
  return new;
end $$;
create trigger workforce_payroll_segment_amendment_guard before insert on public.workforce_payroll_lines
  for each row execute function public.workforce_rc16l_payroll_segment_guard();
revoke all on function public.workforce_rc16l_amend_actual(text,integer,uuid,text,jsonb,text),public.workforce_rc16l_actual_audit(),public.workforce_rc16l_payroll_segment_guard() from public,anon,authenticated;
grant execute on function public.workforce_rc16l_amend_actual(text,integer,uuid,text,jsonb,text),public.workforce_rc16l_actual_audit(),public.workforce_rc16l_payroll_segment_guard() to service_role;
