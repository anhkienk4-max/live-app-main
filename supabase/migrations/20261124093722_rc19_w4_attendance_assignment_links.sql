BEGIN;

-- Historical attendance has no proven assignment mapping; leave those rows NULL.
ALTER TABLE public.self_attendance_events
  ADD COLUMN assignment_id text REFERENCES public.shift_registrations(id) ON DELETE RESTRICT;

ALTER TABLE public.self_attendance_photo_evidence
  ADD COLUMN assignment_id text REFERENCES public.shift_registrations(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.self_attendance_events.assignment_id IS
  'Approved staffing assignment; NULL identifies legacy attendance without a proven assignment link.';
COMMENT ON COLUMN public.self_attendance_photo_evidence.assignment_id IS
  'Staffing assignment associated with the photo; NULL identifies legacy evidence without a proven link.';

-- Resolve the interval server-side; callers must not supply times or staff identity.
CREATE OR REPLACE FUNCTION private.attendance_assignment_interval(
  p_shift_id text, p_operational_role text, p_assignment_id text
)
RETURNS TABLE(assignment_id text, segment_id text, starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor text := private.require_shift_actor(false);
  v_shift public.shifts%ROWTYPE;
BEGIN
  SELECT * INTO v_shift FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL;
  IF NOT FOUND OR NOT private.current_business_user_is_active() OR NOT private.can_read_shift(p_shift_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_NOT_AUTHORIZED';
  END IF;
  IF p_operational_role NOT IN ('host', 'support', 'technical') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_REQUEST_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shift_staffing_segments s WHERE s.shift_id = p_shift_id) THEN
    RETURN QUERY
      SELECT r.id, s.id, s.start_at, s.end_at
      FROM public.shift_registrations r
      JOIN public.shift_staffing_segments s ON s.id = r.staffing_segment_id AND s.shift_id = r.shift_id
      WHERE r.id = p_assignment_id AND r.shift_id = p_shift_id AND r.user_id = v_actor
        AND r.operational_role = p_operational_role AND r.status IN ('approved', 'manually_assigned')
        AND s.start_at >= v_shift.start_at AND s.end_at <= v_shift.end_at AND s.end_at > s.start_at;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_ASSIGNMENT_NOT_AUTHORIZED';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_LEGACY_INTERVAL_REQUIRED';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.attendance_assignment_interval(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_self_attendance_assignment_context(
  p_shift_id text, p_operational_role text, p_event_kind text, p_assignment_id text
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor text := private.require_shift_actor(false);
  v_interval record;
  v_shift public.shifts%ROWTYPE;
  v_staff_name text;
  v_brand text;
  v_platform text;
BEGIN
  IF p_event_kind NOT IN ('check_in', 'check_out') OR p_assignment_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_REQUEST_INVALID';
  END IF;
  SELECT * INTO v_interval FROM private.attendance_assignment_interval(p_shift_id, p_operational_role, p_assignment_id);
  SELECT * INTO STRICT v_shift FROM public.shifts WHERE id = p_shift_id;
  IF statement_timestamp() < v_interval.starts_at - interval '2 hours'
    OR (p_event_kind = 'check_in' AND (v_shift.status NOT IN ('scheduled','preparing','live','paused') OR statement_timestamp() > v_interval.ends_at))
    OR (p_event_kind = 'check_out' AND (v_shift.status NOT IN ('scheduled','preparing','live','paused','completed') OR statement_timestamp() > v_interval.ends_at + interval '2 hours')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_OUTSIDE_WINDOW';
  END IF;
  IF p_event_kind = 'check_out' AND NOT EXISTS (
    SELECT 1 FROM public.self_attendance_events e WHERE e.assignment_id = p_assignment_id AND e.event_kind = 'check_in'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ATTENDANCE_CHECKIN_REQUIRED';
  END IF;
  SELECT full_name INTO v_staff_name FROM public.business_users WHERE id = v_actor;
  SELECT name INTO v_brand FROM public.brands WHERE id = v_shift.brand_id;
  SELECT name INTO v_platform FROM public.platforms WHERE id = v_shift.platform_id;
  RETURN jsonb_build_object('shift_id', p_shift_id, 'staff_id', v_actor, 'staff_name', coalesce(v_staff_name,v_actor),
    'role', p_operational_role, 'date', (v_interval.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    'start_time', to_char(v_interval.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh','HH24:MI:SS'),
    'end_time', to_char(v_interval.ends_at AT TIME ZONE 'Asia/Ho_Chi_Minh','HH24:MI:SS'),
    'start_at', v_interval.starts_at, 'end_at', v_interval.ends_at,
    'brand', coalesce(v_brand,v_shift.brand_id), 'platform', coalesce(v_platform,v_shift.platform_id),
    'studio', v_shift.studio, 'title', v_shift.title, 'assignment_id', p_assignment_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_self_attendance_assignment_context(text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_self_attendance_assignment_context(text,text,text,text) TO authenticated;

-- A committed request may be reconciled after the submission window has closed.
CREATE OR REPLACE FUNCTION public.can_replay_self_attendance_assignment(
  p_shift_id text, p_operational_role text, p_event_kind text, p_assignment_id text, p_request_id uuid
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_actor text := private.require_shift_actor(false);
BEGIN
  PERFORM * FROM private.attendance_assignment_interval(p_shift_id,p_operational_role,p_assignment_id);
  RETURN EXISTS (
    SELECT 1 FROM public.self_attendance_events e
    JOIN public.self_attendance_photo_evidence p ON p.request_id=e.request_id
      AND p.assignment_id=e.assignment_id AND p.shift_id=e.shift_id AND p.staff_id=e.staff_id
      AND p.operational_role=e.operational_role AND p.event_kind=e.event_kind
    WHERE e.request_id=p_request_id AND e.assignment_id=p_assignment_id AND e.shift_id=p_shift_id
      AND e.staff_id=v_actor AND e.operational_role=p_operational_role AND e.event_kind=p_event_kind
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.can_replay_self_attendance_assignment(text,text,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_replay_self_attendance_assignment(text,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_self_attendance_legacy_context(
  p_shift_id text, p_operational_role text, p_event_kind text
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  PERFORM private.require_shift_actor(false);
  IF EXISTS (SELECT 1 FROM public.shift_staffing_segments s WHERE s.shift_id = p_shift_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_ASSIGNMENT_REQUIRED';
  END IF;
  RETURN public.get_self_attendance_photo_context(p_shift_id, p_operational_role, p_event_kind);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_self_attendance_legacy_context(text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_self_attendance_legacy_context(text,text,text) TO authenticated;

-- Keep the legacy key for NULL assignment IDs and scope new records to an assignment.
CREATE UNIQUE INDEX self_attendance_events_legacy_event_uidx
  ON public.self_attendance_events (shift_id, staff_id, operational_role, event_kind)
  WHERE assignment_id IS NULL;
CREATE UNIQUE INDEX self_attendance_events_assignment_event_uidx
  ON public.self_attendance_events (assignment_id, event_kind)
  WHERE assignment_id IS NOT NULL;
CREATE UNIQUE INDEX self_attendance_photo_legacy_event_uidx
  ON public.self_attendance_photo_evidence (shift_id, staff_id, operational_role, event_kind)
  WHERE assignment_id IS NULL;
CREATE UNIQUE INDEX self_attendance_photo_assignment_event_uidx
  ON public.self_attendance_photo_evidence (assignment_id, event_kind)
  WHERE assignment_id IS NOT NULL;
ALTER TABLE public.self_attendance_events
  DROP CONSTRAINT self_attendance_events_shift_id_staff_id_operational_role_e_key;
ALTER TABLE public.self_attendance_photo_evidence
  DROP CONSTRAINT self_attendance_photo_evidence_shift_staff_role_event_key;

CREATE OR REPLACE FUNCTION private.require_self_attendance_photo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NEW.assignment_id IS NULL AND EXISTS (
    SELECT 1 FROM public.shift_staffing_segments s WHERE s.shift_id = NEW.shift_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_ASSIGNMENT_REQUIRED';
  END IF;
  IF NEW.event_kind = 'check_out' AND NOT EXISTS (
    SELECT 1 FROM public.self_attendance_events e
    WHERE e.shift_id = NEW.shift_id AND e.staff_id = NEW.staff_id
      AND e.operational_role = NEW.operational_role AND e.event_kind = 'check_in'
      AND e.assignment_id IS NOT DISTINCT FROM NEW.assignment_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ATTENDANCE_CHECKIN_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.self_attendance_photo_evidence p
    WHERE p.request_id = NEW.request_id AND p.shift_id = NEW.shift_id
      AND p.staff_id = NEW.staff_id AND p.operational_role = NEW.operational_role
      AND p.event_kind = NEW.event_kind AND p.provider = 'google_drive'
      AND p.assignment_id IS NOT DISTINCT FROM NEW.assignment_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ATTENDANCE_PHOTO_REQUIRED';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.require_self_attendance_photo() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.self_attendance_record_assignment(
  p_shift_id text, p_operational_role text, p_event_kind text,
  p_request_id uuid, p_assignment_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor text := private.require_shift_actor(false);
  v_interval record;
  v_existing public.self_attendance_events%ROWTYPE;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF p_request_id IS NULL OR p_assignment_id IS NULL OR p_event_kind NOT IN ('check_in', 'check_out') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_REQUEST_INVALID';
  END IF;
  SELECT * INTO v_existing FROM public.self_attendance_events WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.staff_id <> v_actor OR v_existing.shift_id <> p_shift_id
      OR v_existing.operational_role <> p_operational_role OR v_existing.event_kind <> p_event_kind
      OR v_existing.assignment_id IS DISTINCT FROM p_assignment_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ATTENDANCE_REQUEST_ID_REUSED';
    END IF;
    RETURN jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,'staff_id',v_existing.staff_id,'role',v_existing.operational_role,'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,'verification_status',v_existing.verification_status,'assignment_id',v_existing.assignment_id,'replayed',true);
  END IF;
  PERFORM 1 FROM public.shifts WHERE id = p_shift_id AND
    ((p_event_kind = 'check_in' AND status IN ('scheduled','preparing','live','paused')) OR
     (p_event_kind = 'check_out' AND status IN ('scheduled','preparing','live','paused','completed'))) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_SHIFT_NOT_ELIGIBLE';
  END IF;
  PERFORM 1 FROM public.shift_registrations WHERE id = p_assignment_id FOR SHARE;
  SELECT * INTO v_interval FROM private.attendance_assignment_interval(p_shift_id, p_operational_role, p_assignment_id);
  IF v_now < v_interval.starts_at - interval '2 hours'
     OR (p_event_kind = 'check_in' AND v_now > v_interval.ends_at)
     OR (p_event_kind = 'check_out' AND v_now > v_interval.ends_at + interval '2 hours') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_OUTSIDE_WINDOW';
  END IF;
  INSERT INTO public.self_attendance_events(request_id, shift_id, staff_id, operational_role, event_kind, assignment_id)
  VALUES (p_request_id, p_shift_id, v_actor, p_operational_role, p_event_kind, p_assignment_id)
  ON CONFLICT DO NOTHING RETURNING * INTO v_existing;
  IF NOT FOUND THEN
    SELECT * INTO v_existing FROM public.self_attendance_events WHERE request_id = p_request_id;
    IF NOT FOUND OR v_existing.staff_id <> v_actor OR v_existing.assignment_id IS DISTINCT FROM p_assignment_id
      OR v_existing.shift_id <> p_shift_id OR v_existing.operational_role <> p_operational_role
      OR v_existing.event_kind <> p_event_kind THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ATTENDANCE_ALREADY_RECORDED';
    END IF;
    RETURN jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,'staff_id',v_existing.staff_id,'role',v_existing.operational_role,'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,'verification_status',v_existing.verification_status,'assignment_id',v_existing.assignment_id,'replayed',true);
  END IF;
  RETURN jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,'staff_id',v_existing.staff_id,'role',v_existing.operational_role,'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,'verification_status',v_existing.verification_status,'assignment_id',v_existing.assignment_id,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.self_attendance_record_assignment(text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_attendance_record_assignment(text, text, text, uuid, text) TO authenticated;

-- Preserve legacy RPC contracts while applying the approved two-hour checkout limit.
CREATE OR REPLACE FUNCTION public.self_attendance_record(p_shift_id text, p_operational_role text, p_event_kind text, p_request_id uuid, p_evidence_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor text;
 v_shift public.shifts;
 v_existing public.self_attendance_events;
 v_now timestamptz := statement_timestamp();
 v_assigned boolean;
 v_surrendered boolean;
begin
 v_actor := private.require_shift_actor(false);
 if p_shift_id is null or btrim(p_shift_id)='' or p_request_id is null or
    p_operational_role not in ('host','support','technical') or
    p_event_kind not in ('check_in','check_out') or
    (p_evidence_note is not null and char_length(p_evidence_note)>2000) then
   raise exception using errcode='22023', message='ATTENDANCE_REQUEST_INVALID';
 end if;

 -- Idempotent retry, scoped to exact actor + request payload.
 select * into v_existing from public.self_attendance_events where request_id=p_request_id;
 if found then
   if v_existing.staff_id<>v_actor or v_existing.shift_id<>p_shift_id or
      v_existing.operational_role<>p_operational_role or v_existing.event_kind<>p_event_kind or
      v_existing.evidence_note is distinct from nullif(btrim(p_evidence_note),'') then
       raise exception using errcode='23505', message='ATTENDANCE_REQUEST_ID_REUSED';
   end if;
   return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
       'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
       'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
       'verification_status',v_existing.verification_status,'replayed',true);
 end if;

 -- Hold the shift lock to serialize against swap/assignment changes.
 select * into v_shift from public.shifts
 where id=p_shift_id and deleted_at is null and archived_at is null for share;
 if not found or v_shift.start_at is null or v_shift.end_at is null or
    v_shift.end_at <= v_shift.start_at or
    v_shift.status not in ('scheduled','preparing','live','paused','completed') then
   raise exception using errcode='P0001', message='ATTENDANCE_SHIFT_NOT_ELIGIBLE';
 end if;

 -- An approved exchange/replacement surrenders the old person's source shift.
 select exists (
   select 1 from public.swap_requests sw
   where sw.status in ('approved','completed') and sw.deleted_at is null
     and sw.mode in ('replacement','exchange')
     and (
       (coalesce(sw.source_shift_id,sw.shift_id)=p_shift_id and sw.requester_id=v_actor and sw.operational_role=p_operational_role)
       or (sw.mode='exchange' and sw.target_shift_id=p_shift_id and sw.counterpart_id=v_actor and sw.operational_role=p_operational_role)
     )
 ) into v_surrendered;
 if v_surrendered then
   raise exception using errcode='42501', message='ATTENDANCE_ASSIGNMENT_SURRENDERED';
 end if;

 select (
   (p_operational_role='host' and v_shift.host_id=v_actor) or
   (p_operational_role='support' and v_shift.support_id=v_actor) or
   (p_operational_role='technical' and v_shift.technical_id=v_actor) or
   exists (select 1 from public.shift_registrations sr
      where sr.shift_id=p_shift_id and sr.user_id=v_actor
        and sr.operational_role=p_operational_role
        and sr.status in ('approved','manually_assigned')) or
   exists (select 1 from public.swap_requests sw
      where sw.status in ('approved','completed') and sw.deleted_at is null
        and sw.operational_role=p_operational_role
        and (
          (coalesce(sw.source_shift_id,sw.shift_id)=p_shift_id and
            coalesce(sw.counterpart_id,sw.replacement_staff_id)=v_actor
            and coalesce(sw.counterpart_id,sw.replacement_staff_id)<>sw.requester_id)
          or (sw.mode='exchange' and sw.target_shift_id=p_shift_id and sw.requester_id=v_actor and
              sw.requester_id<>sw.counterpart_id)
        ))
 ) into v_assigned;
 if not coalesce(v_assigned,false) then
   raise exception using errcode='42501', message='ATTENDANCE_NOT_ASSIGNED';
 end if;

 if p_event_kind='check_in' then
   if v_shift.status='completed' or v_now < v_shift.start_at-interval '2 hours' or v_now>v_shift.end_at then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKIN_OUTSIDE_WINDOW';
   end if;
 else
   if v_now < v_shift.start_at-interval '2 hours' or v_now>v_shift.end_at+interval '2 hours' then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKOUT_OUTSIDE_WINDOW';
   end if;
   if not exists (
     select 1 from public.self_attendance_events ev where ev.shift_id=p_shift_id
     and ev.staff_id=v_actor and ev.operational_role=p_operational_role
     and ev.event_kind='check_in' and ev.recorded_at<=v_now
   ) then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKOUT_REQUIRES_CHECKIN';
   end if;
 end if;

 insert into public.self_attendance_events
  (request_id,shift_id,staff_id,operational_role,event_kind,evidence_note)
 values
  (p_request_id,p_shift_id,v_actor,p_operational_role,p_event_kind,nullif(btrim(p_evidence_note),''))
 on conflict do nothing returning * into v_existing;
 if not found then
   -- Concurrent idempotent retry is the ONLY acceptable duplicate.
   select * into v_existing from public.self_attendance_events where request_id=p_request_id;
   if not found or v_existing.staff_id<>v_actor or v_existing.shift_id<>p_shift_id or
      v_existing.operational_role<>p_operational_role or v_existing.event_kind<>p_event_kind or
      v_existing.evidence_note is distinct from nullif(btrim(p_evidence_note),'') then
     raise exception using errcode='23505',message='ATTENDANCE_ALREADY_RECORDED';
   end if;
   return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
       'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
       'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
       'verification_status',v_existing.verification_status,'replayed',true);
 end if;

 return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
     'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
     'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
     'verification_status',v_existing.verification_status,'replayed',false);
end $function$;

CREATE OR REPLACE FUNCTION public.get_self_attendance_photo_context(p_shift_id text, p_operational_role text, p_event_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     v_shift.end_at <= v_shift.start_at then
    raise exception using errcode = 'P0001', message = 'ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE';
  end if;

  -- P0-2: Check-in and Check-out have separate, isolated time boundary & status rules
  if v_kind = 'check_in' then
    -- Check-in retains canonical window: shift cannot be completed,
    -- must be within [start_at - 2 hours, end_at].
    if v_shift.status not in ('scheduled', 'preparing', 'live', 'paused') or
       v_now < v_shift.start_at - interval '2 hours' or
       v_now > v_shift.end_at then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE';
    end if;
  else -- 'check_out'
    -- Check-out allows completed shifts, with dedicated grace period [start_at - 2 hours, end_at + 2 hours].
    if v_shift.status not in ('scheduled', 'preparing', 'live', 'paused', 'completed') or
       v_now < v_shift.start_at - interval '2 hours' or
       v_now > v_shift.end_at + interval '2 hours' then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE';
    end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_my_self_attendance(p_shift_id text DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_actor text; v_events jsonb;
BEGIN
  v_actor := private.require_shift_actor(false);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_PAGE_INVALID';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'event_id',ev.id,'shift_id',ev.shift_id,'staff_id',ev.staff_id,
    'role',ev.operational_role,'event',ev.event_kind,'recorded_at',ev.recorded_at,
    'verification_status',ev.verification_status,'assignment_id',ev.assignment_id,
    'photo_available',EXISTS(SELECT 1 FROM public.self_attendance_photo_evidence p
      WHERE p.request_id=ev.request_id AND p.assignment_id IS NOT DISTINCT FROM ev.assignment_id)
  ) ORDER BY ev.recorded_at DESC,ev.id),'[]'::jsonb) INTO v_events
  FROM (SELECT * FROM public.self_attendance_events WHERE staff_id=v_actor
    AND (p_shift_id IS NULL OR shift_id=p_shift_id)
    ORDER BY recorded_at DESC,id LIMIT p_limit) ev;
  RETURN v_events;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_self_attendance(text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_self_attendance(text,integer) TO authenticated;

-- Prevent ambiguous segment evidence from releasing payroll.
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
    -- Actual-work rows do not yet identify an assignment: ambiguous evidence must remain on hold.
    IF EXISTS (
      SELECT 1 FROM public.self_attendance_events e
      WHERE e.shift_id=v_segment.shift_id AND e.staff_id=v_segment.staff_id
        AND e.operational_role=v_segment.operational_role AND e.assignment_id IS NOT NULL
    ) THEN
      RETURN array_append(v_missing,'assignment_evidence_mapping_required');
    END IF;
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

COMMIT;
