-- RC19 U14.1 | Mandatory Check-in and Check-out Photo Evidence.
-- Both check_in and check_out events require separate photo evidence stored in Google Drive.
-- No binary image data is written to Postgres. Existing CHECK IN/OUT folders are retained.
-- Raw attendance events and evidence remain pending; no automatic Actual/Payroll approval.
begin;

-- 1. Add event_kind column to self_attendance_photo_evidence if not present
alter table public.self_attendance_photo_evidence
  add column if not exists event_kind text not null default 'check_in'
  check (event_kind in ('check_in', 'check_out'));

-- 2. Adjust unique constraint to allow one photo per (shift_id, staff_id, operational_role, event_kind)
do $$
declare
  r record;
begin
  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.self_attendance_photo_evidence'::regclass
      and contype = 'u'
      and conname like '%operational%'
      and conname <> 'self_attendance_photo_evidence_shift_staff_role_event_key'
  ) loop
    execute 'alter table public.self_attendance_photo_evidence drop constraint if exists ' || quote_ident(r.conname);
  end loop;
end $$;

alter table public.self_attendance_photo_evidence
  drop constraint if exists self_attendance_photo_evidence_shift_staff_role_event_key;

alter table public.self_attendance_photo_evidence
  add constraint self_attendance_photo_evidence_shift_staff_role_event_key
  unique (shift_id, staff_id, operational_role, event_kind);

create index if not exists self_attendance_photo_event_kind_idx
  on public.self_attendance_photo_evidence (staff_id, shift_id, event_kind, created_at);

-- 3. Require photo evidence for BOTH check_in and check_out events
create or replace function private.require_self_attendance_photo()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- For check_out, verify that check_in has already occurred
  if new.event_kind = 'check_out' and not exists (
    select 1 from public.self_attendance_events e
    where e.shift_id = new.shift_id
      and e.staff_id = new.staff_id
      and e.operational_role = new.operational_role
      and e.event_kind = 'check_in'
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_CHECKIN_REQUIRED';
  end if;

  -- Both check_in and check_out require verified provider photo evidence
  if new.event_kind in ('check_in', 'check_out') and not exists (
    select 1 from public.self_attendance_photo_evidence p
    where p.request_id = new.request_id
      and p.shift_id = new.shift_id
      and p.staff_id = new.staff_id
      and p.operational_role = new.operational_role
      and p.event_kind = new.event_kind
      and p.provider = 'google_drive'
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_PHOTO_REQUIRED';
  end if;

  return new;
end;
$$;
revoke all on function private.require_self_attendance_photo() from public,anon,authenticated;

-- Ensure trigger is attached
drop trigger if exists self_attendance_checkin_photo_required on public.self_attendance_events;
drop trigger if exists self_attendance_photo_required on public.self_attendance_events;
create trigger self_attendance_photo_required
  before insert on public.self_attendance_events
  for each row execute function private.require_self_attendance_photo();

-- 4. Preflight context supports both check_in and check_out
create or replace function public.get_self_attendance_photo_context(
  p_shift_id text,
  p_operational_role text,
  p_event_kind text default 'check_in'
)
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
  v_kind text;
begin
  v_actor := private.require_shift_actor(false);
  v_kind := coalesce(nullif(btrim(p_event_kind), ''), 'check_in');

  if p_shift_id is null or btrim(p_shift_id) = '' or
     p_operational_role not in ('host', 'support', 'technical') or
     v_kind not in ('check_in', 'check_out') then
    raise exception using errcode = '22023', message = 'ATTENDANCE_PHOTO_CONTEXT_INVALID';
  end if;

  select * into v_shift from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null;

  if not found or v_shift.start_at is null or v_shift.end_at is null or
     v_shift.end_at <= v_shift.start_at or
     v_shift.status not in ('scheduled', 'preparing', 'live', 'paused') or
     v_now < v_shift.start_at - interval '2 hours' or v_now > v_shift.end_at + interval '4 hours' then
    raise exception using errcode = 'P0001', message = 'ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE';
  end if;

  select exists (
    select 1 from public.swap_requests sw
    where sw.status in ('approved', 'completed') and sw.deleted_at is null
      and sw.mode in ('replacement', 'exchange')
      and ((coalesce(sw.source_shift_id, sw.shift_id) = p_shift_id
              and sw.requester_id = v_actor and sw.operational_role = p_operational_role)
        or (sw.mode = 'exchange' and sw.target_shift_id = p_shift_id
              and sw.counterpart_id = v_actor and sw.operational_role = p_operational_role))
  ) into v_surrendered;

  if v_surrendered then
    raise exception using errcode = '42501', message = 'ATTENDANCE_ASSIGNMENT_SURRENDERED';
  end if;

  select (
    (p_operational_role = 'host' and v_shift.host_id = v_actor) or
    (p_operational_role = 'support' and v_shift.support_id = v_actor) or
    (p_operational_role = 'technical' and v_shift.technical_id = v_actor) or
    exists (select 1 from public.shift_registrations sr
      where sr.shift_id = p_shift_id and sr.user_id = v_actor
       and sr.operational_role = p_operational_role and sr.status in ('approved', 'manually_assigned'))
    or exists (select 1 from public.swap_requests sw
      where sw.status in ('approved', 'completed') and sw.deleted_at is null
       and sw.operational_role = p_operational_role
       and ((coalesce(sw.source_shift_id, sw.shift_id) = p_shift_id
             and coalesce(sw.counterpart_id, sw.replacement_staff_id) = v_actor
             and coalesce(sw.counterpart_id, sw.replacement_staff_id) <> sw.requester_id)
         or (sw.mode = 'exchange' and sw.target_shift_id = p_shift_id
             and sw.requester_id = v_actor and sw.requester_id <> sw.counterpart_id)))
  ) into v_assigned;

  if not coalesce(v_assigned, false) then
    raise exception using errcode = '42501', message = 'ATTENDANCE_NOT_ASSIGNED';
  end if;

  if v_kind = 'check_in' then
    if exists (select 1 from public.self_attendance_events e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_in') then
      raise exception using errcode = '23505', message = 'ATTENDANCE_ALREADY_RECORDED';
    end if;

    if exists (select 1 from public.self_attendance_photo_evidence e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_in') then
      raise exception using errcode = '23505', message = 'ATTENDANCE_PHOTO_ALREADY_RESERVED';
    end if;
  elsif v_kind = 'check_out' then
    -- Check-out requires an existing check_in event
    if not exists (select 1 from public.self_attendance_events e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_in') then
      raise exception using errcode = '23514', message = 'ATTENDANCE_CHECKIN_REQUIRED';
    end if;

    if exists (select 1 from public.self_attendance_events e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_out') then
      raise exception using errcode = '23505', message = 'ATTENDANCE_ALREADY_RECORDED';
    end if;

    if exists (select 1 from public.self_attendance_photo_evidence e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_out') then
      raise exception using errcode = '23505', message = 'ATTENDANCE_PHOTO_ALREADY_RESERVED';
    end if;
  end if;

  select full_name into v_staff_name from public.business_users where id = v_actor;
  select name into v_brand_name from public.brands where id = v_shift.brand_id;
  select name into v_platform_name from public.platforms where id = v_shift.platform_id;

  return jsonb_build_object(
    'shift_id', v_shift.id,
    'staff_id', v_actor,
    'staff_name', coalesce(v_staff_name, v_actor),
    'role', p_operational_role,
    'event_kind', v_kind,
    'date', v_shift.date,
    'start_time', v_shift.start_time,
    'end_time', v_shift.end_time,
    'start_at', v_shift.start_at,
    'end_at', v_shift.end_at,
    'brand', coalesce(v_brand_name, v_shift.brand_id),
    'platform', coalesce(v_platform_name, v_shift.platform_id),
    'studio', v_shift.studio,
    'title', v_shift.title
  );
end;
$$;

revoke all on function public.get_self_attendance_photo_context(text, text, text) from public,anon,authenticated;
grant execute on function public.get_self_attendance_photo_context(text, text, text) to authenticated;

-- Rollback plan reference:
-- To rollback, restore unique constraint (shift_id, staff_id, operational_role) and check_in-only trigger.
commit;
