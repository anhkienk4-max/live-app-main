begin;

do $guard$
begin
  if to_regclass('public.shifts') is null
    or to_regclass('public.shift_registrations') is null
    or to_regclass('public.system_settings') is null
    or to_regprocedure('public.create_shift(jsonb)') is null
    or to_regprocedure('public.register_for_shift(text,text)') is null
    or to_regprocedure('private.require_shift_actor(boolean)') is null
    or to_regprocedure('private.assert_shift_role_eligibility(text,text)') is null
    or to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') is null
    or to_regprocedure('private.reg02_reject_surplus(text,text,text)') is null
    or to_regprocedure('private.refresh_shift_registration_lock(text,boolean)') is null
    or to_regprocedure('private.assert_shift_staffing_consistent(public.shifts)') is null
    or to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') is null
    or to_regprocedure('public.rbac01_effective_permission(text)') is null then
    raise exception using errcode='42501', message='C511_STAFFING_BASELINE_PRECONDITION_FAILED';
  end if;
end
$guard$;

do $index_guard$
declare
  index_definition text;
  predicate_definition text;
  is_unique boolean;
begin
  select pg_get_indexdef(i.indexrelid), pg_get_expr(i.indpred, i.indrelid), i.indisunique
    into index_definition, predicate_definition, is_unique
  from pg_index i
  where i.indexrelid = to_regclass('public.shift_registrations_active_role_uidx');
  if not found or not is_unique
    or regexp_replace(index_definition, '\s+', '', 'g') not like '%(shift_id,user_id,operational_role)%'
    or predicate_definition is null
    or not (predicate_definition like '%pending%' and predicate_definition like '%approved%'
      and predicate_definition like '%manually_assigned%') then
    raise exception using errcode='55000', message='C511_ACTIVE_REGISTRATION_INDEX_INCOMPATIBLE';
  end if;
end
$index_guard$;

create table public.shift_staffing_segments (
  id text primary key default gen_random_uuid()::text,
  shift_id text not null references public.shifts(id) on delete restrict,
  segment_index smallint not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  required_host_count smallint not null,
  required_support_count smallint not null,
  required_technical_count smallint not null,
  planned_host_names text[] not null default '{}',
  planned_support_names text[] not null default '{}',
  planned_technical_names text[] not null default '{}',
  created_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint shift_staffing_segments_index_check check (segment_index between 1 and 100),
  constraint shift_staffing_segments_time_check check (end_at > start_at),
  constraint shift_staffing_segments_host_capacity_check check (required_host_count between 0 and 100),
  constraint shift_staffing_segments_support_capacity_check check (required_support_count between 0 and 100),
  constraint shift_staffing_segments_technical_capacity_check check (required_technical_count between 0 and 100),
  constraint shift_staffing_segments_identity_key unique (shift_id, segment_index)
);

create index shift_staffing_segments_shift_time_idx
  on public.shift_staffing_segments (shift_id, start_at, end_at);

alter table public.shift_registrations
  add column staffing_segment_id text null
  references public.shift_staffing_segments(id) on delete restrict;

drop index public.shift_registrations_active_role_uidx;
create unique index shift_registrations_active_role_uidx
  on public.shift_registrations
    (shift_id, user_id, operational_role, coalesce(staffing_segment_id, ''))
  where status in ('pending', 'approved', 'manually_assigned');

alter table public.shift_staffing_segments enable row level security;
revoke all on public.shift_staffing_segments from public, anon, authenticated;
grant select on public.shift_staffing_segments to authenticated;
drop policy if exists shift_staffing_segments_read on public.shift_staffing_segments;
create policy shift_staffing_segments_read on public.shift_staffing_segments
  for select to authenticated
  using (private.can_read_shift(shift_id));

create or replace function private.assert_shift_capacity(
  p_shift public.shifts,
  p_role text,
  p_exclude_registration_id text default null
)
returns void
language plpgsql stable security definer set search_path = '' as $$
declare staffed_count integer;
begin
  if exists (
    select 1 from public.shift_registrations r
    where r.id = p_exclude_registration_id and r.staffing_segment_id is not null
  ) then
    return;
  end if;
  select count(*) into staffed_count
  from public.shift_registrations r
  where r.shift_id = p_shift.id and r.operational_role = p_role
    and r.staffing_segment_id is null
    and r.status in ('approved', 'manually_assigned')
    and (p_exclude_registration_id is null or r.id <> p_exclude_registration_id);
  if staffed_count >= private.shift_required_capacity(p_shift, p_role) then
    raise exception using errcode='P0001', message='SHIFT_FULL';
  end if;
end;
$$;
revoke all on function private.assert_shift_capacity(public.shifts,text,text) from public, anon, authenticated;

create or replace function private.reg02_reject_surplus(p_shift_id text,p_role text,p_actor_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_capacity integer; v_filled integer; v_rejected integer;
begin
  if p_role not in ('host','support','technical') or p_role is null then
    raise exception using errcode='22023', message='OPERATIONAL_ROLE_INVALID';
  end if;
  select private.shift_required_capacity(s,p_role) into v_capacity
    from public.shifts s where s.id=p_shift_id;
  if v_capacity is null then raise exception using errcode='P0001', message='SHIFT_NOT_FOUND'; end if;
  select count(*) into v_filled from public.shift_registrations r
    where r.shift_id=p_shift_id and r.operational_role=p_role and r.staffing_segment_id is null
      and r.status in ('approved','manually_assigned');
  if v_filled<v_capacity then return 0; end if;
  if v_filled>v_capacity then raise exception using errcode='P0001', message='SHIFT_CAPACITY_BELOW_STAFFING'; end if;
  with surplus as (
    select r.id from public.shift_registrations r
    where r.shift_id=p_shift_id and r.operational_role=p_role and r.staffing_segment_id is null
      and r.status='pending' order by r.requested_at,r.id for update
  ), changed as (
    update public.shift_registrations r set status='rejected',reviewed_by=p_actor_id,
      reviewed_at=statement_timestamp(),review_notes='ROLE_CAPACITY_FILLED'
    where r.id in (select id from surplus) and r.status='pending' returning r.id
  ) select count(*) into v_rejected from changed;
  return v_rejected;
end;
$$;
revoke all on function private.reg02_reject_surplus(text,text,text) from public, anon, authenticated;

create or replace function private.refresh_shift_registration_lock(p_shift_id text,p_unlock_when_understaffed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  fully_staffed boolean;
  has_segments boolean;
begin
  select exists(select 1 from public.shift_staffing_segments where shift_id=p_shift_id)
    into has_segments;
  if has_segments then
    select coalesce(bool_and(
      (select count(*) from public.shift_registrations r where r.staffing_segment_id=s.id and r.operational_role='host' and r.status in ('approved','manually_assigned')) >= s.required_host_count
      and (select count(*) from public.shift_registrations r where r.staffing_segment_id=s.id and r.operational_role='support' and r.status in ('approved','manually_assigned')) >= s.required_support_count
      and (select count(*) from public.shift_registrations r where r.staffing_segment_id=s.id and r.operational_role='technical' and r.status in ('approved','manually_assigned')) >= s.required_technical_count
    ), false) into fully_staffed
    from public.shift_staffing_segments s where s.shift_id=p_shift_id;
  else
    select
      (select count(*) from public.shift_registrations r where r.shift_id=s.id and r.staffing_segment_id is null and r.operational_role='host' and r.status in ('approved','manually_assigned')) >= s.required_host_count
      and (select count(*) from public.shift_registrations r where r.shift_id=s.id and r.staffing_segment_id is null and r.operational_role='support' and r.status in ('approved','manually_assigned')) >= s.required_support_count
      and (select count(*) from public.shift_registrations r where r.shift_id=s.id and r.staffing_segment_id is null and r.operational_role='technical' and r.status in ('approved','manually_assigned')) >= s.required_technical_count
    into fully_staffed from public.shifts s where s.id=p_shift_id for update;
  end if;
  if fully_staffed then
    update public.shifts set registration_locked=true where id=p_shift_id;
  elsif p_unlock_when_understaffed then
    update public.shifts set registration_locked=false where id=p_shift_id;
  end if;
end;
$$;
revoke all on function private.refresh_shift_registration_lock(text,boolean) from public, anon, authenticated;

create or replace function private.assert_shift_staffing_consistent(p_shift public.shifts)
returns void language plpgsql security definer set search_path = '' as $$
declare registrant_id text;
begin
  if (select count(*) from public.shift_registrations r where r.shift_id=p_shift.id and r.staffing_segment_id is null and r.operational_role='host' and r.status in ('approved','manually_assigned')) > p_shift.required_host_count
    or (select count(*) from public.shift_registrations r where r.shift_id=p_shift.id and r.staffing_segment_id is null and r.operational_role='support' and r.status in ('approved','manually_assigned')) > p_shift.required_support_count
    or (select count(*) from public.shift_registrations r where r.shift_id=p_shift.id and r.staffing_segment_id is null and r.operational_role='technical' and r.status in ('approved','manually_assigned')) > p_shift.required_technical_count then
    raise exception using errcode='P0001', message='SHIFT_CAPACITY_BELOW_STAFFING';
  end if;
  if not p_shift.allow_multi_role and exists (
    select 1 from public.shift_registrations r where r.shift_id=p_shift.id
      and r.status in ('pending','approved','manually_assigned') group by r.user_id having count(*)>1
  ) then raise exception using errcode='P0001', message='MULTI_ROLE_NOT_ALLOWED'; end if;
  for registrant_id in select distinct r.user_id from public.shift_registrations r
    where r.shift_id=p_shift.id and r.status in ('pending','approved','manually_assigned') order by r.user_id loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(registrant_id,91731));
    if exists (select 1 from public.shift_registrations r join public.shifts other_shift on other_shift.id=r.shift_id
      where r.user_id=registrant_id and r.shift_id<>p_shift.id
        and r.status in ('pending','approved','manually_assigned') and other_shift.deleted_at is null
        and other_shift.archived_at is null and other_shift.status<>'cancelled'
        and other_shift.start_at<p_shift.end_at and other_shift.end_at>p_shift.start_at) then
      raise exception using errcode='P0001', message='SHIFT_CONFLICT';
    end if;
  end loop;
end;
$$;
revoke all on function private.assert_shift_staffing_consistent(public.shifts) from public, anon, authenticated;

create or replace function private.c511_guard_segment_registration()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_segment public.shift_staffing_segments%rowtype; v_filled integer; v_capacity smallint;
begin
  if new.status in ('approved', 'manually_assigned')
    and private.current_system_permission() = 'leader' then
    if not private.rc19_has_any_leader_brand_scope(
      (select s.brand_id from public.shifts s where s.id = new.shift_id),
      array['shifts.manage']::text[]
    ) then
      raise exception using errcode='42501', message='LEADER_BRAND_SCOPE_REQUIRED';
    end if;
  end if;
  if new.staffing_segment_id is null then return new; end if;
  select * into v_segment from public.shift_staffing_segments
  where id = new.staffing_segment_id and shift_id = new.shift_id for update;
  if not found then
    raise exception using errcode='23503', message='STAFFING_SEGMENT_SHIFT_MISMATCH';
  end if;
  if tg_op = 'UPDATE' and old.staffing_segment_id is not null
    and old.staffing_segment_id <> new.staffing_segment_id then
    raise exception using errcode='23514', message='STAFFING_SEGMENT_REGISTRATION_IMMUTABLE';
  end if;
  if new.status in ('approved', 'manually_assigned') then
    v_capacity := case new.operational_role
      when 'host' then v_segment.required_host_count
      when 'support' then v_segment.required_support_count
      when 'technical' then v_segment.required_technical_count
      else null end;
    if v_capacity is null then
      raise exception using errcode='22023', message='OPERATIONAL_ROLE_INVALID';
    end if;
    select count(*) into v_filled from public.shift_registrations r
    where r.staffing_segment_id = v_segment.id
      and r.operational_role = new.operational_role
      and r.status in ('approved', 'manually_assigned')
      and r.id <> new.id;
    if v_filled >= v_capacity then
      raise exception using errcode='P0001', message='STAFFING_SEGMENT_FULL';
    end if;
  end if;
  return new;
end;
$$;
alter function private.c511_guard_segment_registration() owner to postgres;
revoke all on function private.c511_guard_segment_registration() from public, anon, authenticated;
create trigger shift_registrations_c511_segment_capacity
  before insert or update of shift_id, staffing_segment_id, operational_role, status
  on public.shift_registrations for each row
  execute function private.c511_guard_segment_registration();

create or replace function private.c511_replace_shift_segments(p_shift_id text, p_segments jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor_id text := private.require_shift_actor(true);
  target public.shifts%rowtype;
  item jsonb;
  segment_no integer;
  start_time time;
  end_time time;
  start_date date;
  end_date date;
  start_value timestamptz;
  end_value timestamptz;
  host_count smallint;
  support_count smallint;
  technical_count smallint;
  host_names text[];
  support_names text[];
  technical_names text[];
  existing public.shift_staffing_segments%rowtype;
  seen integer[] := '{}';
begin
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) > 100 then
    raise exception using errcode='22023', message='STAFFING_SEGMENTS_INVALID';
  end if;
  select * into target from public.shifts where id=p_shift_id and deleted_at is null for update;
  if not found then raise exception using errcode='P0001', message='SHIFT_NOT_FOUND'; end if;
  if private.current_system_permission() = 'leader' and (
      not public.rbac01_effective_permission('shifts.edit')
      or not private.rc19_has_any_leader_brand_scope(target.brand_id, array['shifts.manage']::text[])
  ) then
    raise exception using errcode='42501', message='OPERATION_NOT_ALLOWED';
  end if;
  if not public.rbac01_effective_permission('shifts.edit') then
    raise exception using errcode='42501', message='OPERATION_NOT_ALLOWED';
  end if;

  for item in select value from jsonb_array_elements(p_segments) loop
    if jsonb_typeof(item) <> 'object'
      or exists (select 1 from jsonb_object_keys(item) k where k not in (
        'segment_index','start_time','end_time','required_host_count','required_support_count',
        'required_technical_count','planned_host_names','planned_support_names','planned_technical_names')) then
      raise exception using errcode='22023', message='STAFFING_SEGMENT_FIELDS_INVALID';
    end if;
    segment_no := (item->>'segment_index')::integer;
    start_time := (item->>'start_time')::time;
    end_time := (item->>'end_time')::time;
    host_count := (item->>'required_host_count')::smallint;
    support_count := (item->>'required_support_count')::smallint;
    technical_count := (item->>'required_technical_count')::smallint;
    if segment_no < 1 or segment_no > 100 or segment_no = any(seen)
      or host_count not between 0 and 100 or support_count not between 0 and 100
      or technical_count not between 0 and 100 then
      raise exception using errcode='22023', message='STAFFING_SEGMENT_VALUE_INVALID';
    end if;
    seen := array_append(seen, segment_no);
    if jsonb_typeof(coalesce(item->'planned_host_names','[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(item->'planned_support_names','[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(item->'planned_technical_names','[]'::jsonb)) <> 'array' then
      raise exception using errcode='22023', message='STAFFING_SEGMENT_NAMES_INVALID';
    end if;
    if jsonb_array_length(coalesce(item->'planned_host_names','[]'::jsonb))>100
      or jsonb_array_length(coalesce(item->'planned_support_names','[]'::jsonb))>100
      or jsonb_array_length(coalesce(item->'planned_technical_names','[]'::jsonb))>100
      or exists (select 1 from jsonb_array_elements(coalesce(item->'planned_host_names','[]'::jsonb)) n
        where jsonb_typeof(n)<>'string' or length(n#>>'{}')>120)
      or exists (select 1 from jsonb_array_elements(coalesce(item->'planned_support_names','[]'::jsonb)) n
        where jsonb_typeof(n)<>'string' or length(n#>>'{}')>120)
      or exists (select 1 from jsonb_array_elements(coalesce(item->'planned_technical_names','[]'::jsonb)) n
        where jsonb_typeof(n)<>'string' or length(n#>>'{}')>120) then
      raise exception using errcode='22023', message='STAFFING_SEGMENT_NAMES_INVALID';
    end if;
    select coalesce(array_agg(value), '{}') into host_names
      from jsonb_array_elements_text(coalesce(item->'planned_host_names','[]'::jsonb));
    select coalesce(array_agg(value), '{}') into support_names
      from jsonb_array_elements_text(coalesce(item->'planned_support_names','[]'::jsonb));
    select coalesce(array_agg(value), '{}') into technical_names
      from jsonb_array_elements_text(coalesce(item->'planned_technical_names','[]'::jsonb));
    start_date := target.date + case when start_time < target.start_time then 1 else 0 end;
    end_date := start_date + case when end_time <= start_time then 1 else 0 end;
    start_value := (start_date + start_time) at time zone 'Asia/Ho_Chi_Minh';
    end_value := (end_date + end_time) at time zone 'Asia/Ho_Chi_Minh';
    if start_value < target.start_at or end_value > target.end_at or end_value <= start_value then
      raise exception using errcode='22023', message='STAFFING_SEGMENT_OUTSIDE_SHIFT';
    end if;
    if exists (select 1 from public.shift_staffing_segments s
      where s.shift_id=p_shift_id and s.segment_index<>segment_no
        and tstzrange(s.start_at,s.end_at,'[)') && tstzrange(start_value,end_value,'[)')) then
      raise exception using errcode='23P01', message='STAFFING_SEGMENTS_OVERLAP';
    end if;
    select * into existing from public.shift_staffing_segments s
      where s.shift_id=p_shift_id and s.segment_index=segment_no for update;
    if found and exists (select 1 from public.shift_registrations r where r.staffing_segment_id=existing.id)
      and (existing.start_at is distinct from start_value or existing.end_at is distinct from end_value
        or existing.required_host_count is distinct from host_count
        or existing.required_support_count is distinct from support_count
        or existing.required_technical_count is distinct from technical_count
        or existing.planned_host_names is distinct from host_names
        or existing.planned_support_names is distinct from support_names
        or existing.planned_technical_names is distinct from technical_names) then
      raise exception using errcode='23514', message='STAFFING_SEGMENT_ALREADY_USED';
    end if;
    insert into public.shift_staffing_segments (
      shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,
      required_technical_count,planned_host_names,planned_support_names,planned_technical_names,created_by
    ) values (p_shift_id,segment_no,start_value,end_value,host_count,support_count,
      technical_count,host_names,support_names,technical_names,actor_id)
    on conflict (shift_id,segment_index) do update set
      start_at=excluded.start_at,end_at=excluded.end_at,
      required_host_count=excluded.required_host_count,
      required_support_count=excluded.required_support_count,
      required_technical_count=excluded.required_technical_count,
      planned_host_names=excluded.planned_host_names,
      planned_support_names=excluded.planned_support_names,
      planned_technical_names=excluded.planned_technical_names,
      updated_at=statement_timestamp();
  end loop;

  if exists (select 1 from public.shift_staffing_segments s where s.shift_id=p_shift_id and not (s.segment_index=any(seen))) then
    if exists (select 1 from public.shift_registrations r join public.shift_staffing_segments s on s.id=r.staffing_segment_id
      where s.shift_id=p_shift_id and not (s.segment_index=any(seen))) then
      raise exception using errcode='23514', message='STAFFING_SEGMENT_ALREADY_USED';
    end if;
    delete from public.shift_staffing_segments s where s.shift_id=p_shift_id and not (s.segment_index=any(seen));
  end if;
end;
$$;
alter function private.c511_replace_shift_segments(text,jsonb) owner to postgres;
revoke all on function private.c511_replace_shift_segments(text,jsonb) from public, anon, authenticated;

create or replace function private.c511_guard_shift_segment_bounds()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.shift_staffing_segments s
    where s.shift_id = old.id and (s.start_at < new.start_at or s.end_at > new.end_at)
  ) then
    raise exception using errcode='23514', message='SHIFT_SEGMENTS_OUTSIDE_PARENT';
  end if;
  return new;
end;
$$;
alter function private.c511_guard_shift_segment_bounds() owner to postgres;
revoke all on function private.c511_guard_shift_segment_bounds() from public, anon, authenticated;
create trigger shifts_c511_segment_bounds
  before update of start_at, end_at on public.shifts
  for each row execute function private.c511_guard_shift_segment_bounds();

create or replace function public.create_shift_with_staffing_segments(p_data jsonb, p_segments jsonb)
returns public.shifts
language plpgsql security definer set search_path = '' as $$
declare result public.shifts;
begin
  result := public.create_shift(p_data);
  perform private.c511_replace_shift_segments(result.id,p_segments);
  return result;
end;
$$;
alter function public.create_shift_with_staffing_segments(jsonb,jsonb) owner to postgres;
revoke all on function public.create_shift_with_staffing_segments(jsonb,jsonb) from public, anon, service_role;
grant execute on function public.create_shift_with_staffing_segments(jsonb,jsonb) to authenticated;

create or replace function public.register_for_staffing_segment(p_segment_id text, p_role text)
returns public.shift_registrations
language plpgsql security definer set search_path = '' as $$
declare
  actor_id text := private.require_shift_actor(false);
  segment public.shift_staffing_segments%rowtype;
  target_shift public.shifts%rowtype;
  settings_row public.system_settings%rowtype;
  result public.shift_registrations%rowtype;
  capacity smallint;
  filled integer;
begin
  select * into segment from public.shift_staffing_segments where id=p_segment_id for update;
  if not found then raise exception using errcode='P0001', message='STAFFING_SEGMENT_NOT_FOUND'; end if;
  select * into target_shift from public.shifts
    where id=segment.shift_id and deleted_at is null and archived_at is null for update;
  if not found or target_shift.status<>'scheduled' or target_shift.registration_locked
    or target_shift.end_at<=statement_timestamp() or target_shift.registration_cutoff_at<=statement_timestamp() then
    raise exception using errcode='P0001', message='REGISTRATION_CLOSED';
  end if;
  select * into settings_row from public.system_settings limit 1;
  if settings_row.id is null then raise exception using errcode='P0001', message='OPERATIONAL_SETTINGS_NOT_CONFIGURED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id,91731));
  perform private.assert_shift_role_eligibility(actor_id,p_role);
  perform private.assert_no_shift_registration_conflict(actor_id,target_shift,p_role,null);
  capacity := case p_role when 'host' then segment.required_host_count
    when 'support' then segment.required_support_count
    when 'technical' then segment.required_technical_count else null end;
  if capacity is null then raise exception using errcode='22023', message='OPERATIONAL_ROLE_INVALID'; end if;
  select count(*) into filled from public.shift_registrations r
    where r.staffing_segment_id=segment.id and r.operational_role=p_role
      and r.status in ('approved','manually_assigned');
  if filled >= capacity then raise exception using errcode='P0001', message='STAFFING_SEGMENT_FULL'; end if;
  insert into public.shift_registrations(shift_id,staffing_segment_id,user_id,operational_role,status,source,reviewed_by,reviewed_at)
  values(target_shift.id,segment.id,actor_id,p_role,
    case when settings_row.require_registration_approval then 'pending' else 'approved' end,
    'self_registration',case when settings_row.require_registration_approval then null else actor_id end,
    case when settings_row.require_registration_approval then null else statement_timestamp() end)
  returning * into result;
  return result;
end;
$$;
alter function public.register_for_staffing_segment(text,text) owner to postgres;
revoke all on function public.register_for_staffing_segment(text,text) from public, anon, service_role;
grant execute on function public.register_for_staffing_segment(text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
