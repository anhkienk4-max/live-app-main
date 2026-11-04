-- RC19 P2-04B | Drive-only check-in camera evidence.
-- The photo bytes NEVER enter Postgres. Existing CHECK IN/OUT folders are retained.
-- Raw check-ins and evidence remain pending; no automatic Actual/Payroll approval.
begin;

create table if not exists public.self_attendance_photo_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  shift_id text not null references public.shifts(id),
  staff_id text not null references public.business_users(id),
  operational_role text not null check (operational_role in ('host','support','technical')),
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  external_file_id text not null unique check (char_length(external_file_id) between 8 and 512),
  external_parent_id text not null check (char_length(external_parent_id) between 8 and 512),
  file_name text not null check (char_length(file_name) between 16 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  shift_context jsonb not null check (jsonb_typeof(shift_context)='object'),
  capture_source text not null check (capture_source in ('camera','file_picker')),
  created_at timestamptz not null default now(),
  unique (shift_id,staff_id,operational_role)
);
create index if not exists self_attendance_photo_owner_idx
  on public.self_attendance_photo_evidence (staff_id,shift_id,created_at);
alter table public.self_attendance_photo_evidence enable row level security;
revoke all on public.self_attendance_photo_evidence from public,anon,authenticated;
grant select,insert on public.self_attendance_photo_evidence to service_role;

-- Proof metadata is immutable just like the raw check-in. No edits or deletion
-- through regular SQL calls, including service role. Corrections need separate audit.
drop trigger if exists self_attendance_photo_immutable on public.self_attendance_photo_evidence;
create trigger self_attendance_photo_immutable
  before update or delete on public.self_attendance_photo_evidence
  for each row execute function private.reject_self_attendance_mutation();

-- The same existing self_attendance_record RPC remains the only check-in writer.
-- A check-in cannot be created until an authenticated server upload has committed
-- a matching provider-evidence row (request UUID + exact actor + shift + role).
create or replace function private.require_self_attendance_photo()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.event_kind='check_in' and not exists (
    select 1 from public.self_attendance_photo_evidence p
    where p.request_id=new.request_id and p.shift_id=new.shift_id
      and p.staff_id=new.staff_id and p.operational_role=new.operational_role
      and p.provider='google_drive'
  ) then
    raise exception using errcode='23514',message='ATTENDANCE_PHOTO_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function private.require_self_attendance_photo() from public,anon,authenticated;
drop trigger if exists self_attendance_checkin_photo_required on public.self_attendance_events;
create trigger self_attendance_checkin_photo_required
  before insert on public.self_attendance_events
  for each row execute function private.require_self_attendance_photo();

-- Preflight is read only. Assignment/time are ALWAYS checked again in
-- self_attendance_record after upload, to close the check-in TOCTOU window.
create or replace function public.get_self_attendance_photo_context(p_shift_id text, p_operational_role text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor text;
  v_shift public.shifts;
  v_assigned boolean;
  v_surrendered boolean;
  v_now timestamptz := statement_timestamp();
  v_staff_name text;
  v_brand_name text;
  v_platform_name text;
begin
  v_actor := private.require_shift_actor(false);
  if p_shift_id is null or btrim(p_shift_id)='' or
     p_operational_role not in ('host','support','technical') then
    raise exception using errcode='22023',message='ATTENDANCE_PHOTO_CONTEXT_INVALID';
  end if;

  select * into v_shift from public.shifts
  where id=p_shift_id and deleted_at is null and archived_at is null;
  if not found or v_shift.start_at is null or v_shift.end_at is null or
     v_shift.end_at <= v_shift.start_at or
     v_shift.status not in ('scheduled','preparing','live','paused') or
     v_now < v_shift.start_at - interval '2 hours' or v_now > v_shift.end_at then
    raise exception using errcode='P0001',message='ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE';
  end if;

  select exists (
    select 1 from public.swap_requests sw
    where sw.status in ('approved','completed') and sw.deleted_at is null
      and sw.mode in ('replacement','exchange')
      and ((coalesce(sw.source_shift_id,sw.shift_id)=p_shift_id
              and sw.requester_id=v_actor and sw.operational_role=p_operational_role)
        or (sw.mode='exchange' and sw.target_shift_id=p_shift_id
              and sw.counterpart_id=v_actor and sw.operational_role=p_operational_role))
  ) into v_surrendered;
  if v_surrendered then
    raise exception using errcode='42501',message='ATTENDANCE_ASSIGNMENT_SURRENDERED';
  end if;

  select (
    (p_operational_role='host' and v_shift.host_id=v_actor) or
    (p_operational_role='support' and v_shift.support_id=v_actor) or
    (p_operational_role='technical' and v_shift.technical_id=v_actor) or
    exists (select 1 from public.shift_registrations sr
      where sr.shift_id=p_shift_id and sr.user_id=v_actor
       and sr.operational_role=p_operational_role and sr.status in ('approved','manually_assigned'))
    or exists (select 1 from public.swap_requests sw
      where sw.status in ('approved','completed') and sw.deleted_at is null
       and sw.operational_role=p_operational_role
       and ((coalesce(sw.source_shift_id,sw.shift_id)=p_shift_id
             and coalesce(sw.counterpart_id,sw.replacement_staff_id)=v_actor
             and coalesce(sw.counterpart_id,sw.replacement_staff_id)<>sw.requester_id)
         or (sw.mode='exchange' and sw.target_shift_id=p_shift_id
             and sw.requester_id=v_actor and sw.requester_id<>sw.counterpart_id)))
  ) into v_assigned;
  if not coalesce(v_assigned,false) then
    raise exception using errcode='42501',message='ATTENDANCE_NOT_ASSIGNED';
  end if;
  if exists(select 1 from public.self_attendance_events e
    where e.shift_id=p_shift_id and e.staff_id=v_actor and
          e.operational_role=p_operational_role and e.event_kind='check_in') then
    raise exception using errcode='23505',message='ATTENDANCE_ALREADY_RECORDED';
  end if;
  if exists(select 1 from public.self_attendance_photo_evidence e
    where e.shift_id=p_shift_id and e.staff_id=v_actor and e.operational_role=p_operational_role) then
    raise exception using errcode='23505',message='ATTENDANCE_PHOTO_ALREADY_RESERVED';
  end if;
  select full_name into v_staff_name from public.business_users where id=v_actor;
  select name into v_brand_name from public.brands where id=v_shift.brand_id;
  select name into v_platform_name from public.platforms where id=v_shift.platform_id;
  return jsonb_build_object(
    'shift_id',v_shift.id,'staff_id',v_actor,'staff_name',coalesce(v_staff_name,v_actor),
    'role',p_operational_role,'date',v_shift.date,
    'start_time',v_shift.start_time,'end_time',v_shift.end_time,
    'start_at',v_shift.start_at,'end_at',v_shift.end_at,
    'brand',coalesce(v_brand_name,v_shift.brand_id),
    'platform',coalesce(v_platform_name,v_shift.platform_id),
    'studio',v_shift.studio,'title',v_shift.title
  );
end;
$$;
revoke all on function public.get_self_attendance_photo_context(text,text) from public,anon,authenticated;
grant execute on function public.get_self_attendance_photo_context(text,text) to authenticated;

-- Owner-facing history does not reveal raw provider IDs or unapproved image URLs.
create or replace function public.get_my_self_attendance(p_shift_id text default null::text,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_actor text; v_events jsonb;
begin
  v_actor:=private.require_shift_actor(false);
  if p_limit is null or p_limit<1 or p_limit>100 then
    raise exception using errcode='22023',message='ATTENDANCE_PAGE_INVALID';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',ev.id,'shift_id',ev.shift_id,'staff_id',ev.staff_id,
    'role',ev.operational_role,'event',ev.event_kind,'recorded_at',ev.recorded_at,
    'verification_status',ev.verification_status,
    'photo_available',exists(select 1 from public.self_attendance_photo_evidence p where p.request_id=ev.request_id)
  ) order by ev.recorded_at desc,ev.id),'[]'::jsonb) into v_events
  from (select * from public.self_attendance_events where staff_id=v_actor
    and (p_shift_id is null or shift_id=p_shift_id)
    order by recorded_at desc,id limit p_limit) ev;
  return v_events;
end;
$$;
revoke all on function public.get_my_self_attendance(text,integer) from public,anon,authenticated;
grant execute on function public.get_my_self_attendance(text,integer) to authenticated;
commit;
