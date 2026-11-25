BEGIN;

-- A replacement can start part-way through a segment. Attendance must use the
-- later of the segment start and the authoritative replacement receipt.
CREATE OR REPLACE FUNCTION private.attendance_assignment_interval(
  p_shift_id text, p_operational_role text, p_assignment_id text
) RETURNS TABLE(assignment_id text, segment_id text, starts_at timestamptz, ends_at timestamptz)
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
      SELECT r.id, s.id, greatest(s.start_at, coalesce(x.effective_at, s.start_at)), s.end_at
      FROM public.shift_registrations r
      JOIN public.shift_staffing_segments s ON s.id = r.staffing_segment_id AND s.shift_id = r.shift_id
      LEFT JOIN public.rc19_shift_assignment_replacements x ON x.new_registration_id = r.id
        AND x.shift_id = r.shift_id AND x.staffing_segment_id = s.id
      WHERE r.id = p_assignment_id AND r.shift_id = p_shift_id AND r.user_id = v_actor
        AND r.operational_role = p_operational_role AND r.status IN ('approved', 'manually_assigned')
        AND s.start_at >= v_shift.start_at AND s.end_at <= v_shift.end_at AND s.end_at > s.start_at
        AND greatest(s.start_at, coalesce(x.effective_at, s.start_at)) < s.end_at;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTENDANCE_ASSIGNMENT_NOT_AUTHORIZED';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ATTENDANCE_LEGACY_INTERVAL_REQUIRED';
  END IF;
END;
$function$;

-- Prevent a replacement from claiming work before the recorded handover.
-- The existing assignment integrity trigger still enforces segment bounds.
CREATE FUNCTION private.rc19_replacement_actual_interval_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_effective_at timestamptz;
BEGIN
  IF NEW.assignment_id IS NOT NULL AND NEW.event_kind = 'worked' THEN
    SELECT effective_at INTO v_effective_at
      FROM public.rc19_shift_assignment_replacements
      WHERE new_registration_id = NEW.assignment_id;
    IF FOUND AND NEW.actual_start_at < v_effective_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WORKFORCE_REPLACEMENT_INTERVAL_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.rc19_replacement_actual_interval_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rc19_replacement_actual_interval_guard
  BEFORE INSERT OR UPDATE ON public.workforce_actual_segments
  FOR EACH ROW EXECUTE FUNCTION private.rc19_replacement_actual_interval_guard();

-- A replaced registration remains valid for its own historical worked
-- interval, but never for work after the recorded handover.
CREATE OR REPLACE FUNCTION private.rc19_actual_assignment_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_assignment public.shift_registrations%ROWTYPE; v_segment public.shift_staffing_segments%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_IMMUTABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shift_staffing_segments WHERE shift_id=NEW.shift_id) THEN
    IF NEW.assignment_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_REQUIRED';
    END IF;
    SELECT * INTO v_assignment FROM public.shift_registrations WHERE id=NEW.assignment_id FOR SHARE;
    IF NOT FOUND OR v_assignment.shift_id<>NEW.shift_id OR v_assignment.user_id<>NEW.staff_id
      OR v_assignment.operational_role<>NEW.operational_role OR v_assignment.staffing_segment_id IS NULL
      OR NOT (v_assignment.status IN ('approved','manually_assigned') OR
        (v_assignment.status='removed' AND NEW.event_kind='worked' AND EXISTS (
          SELECT 1 FROM public.rc19_shift_assignment_replacements outgoing
          WHERE outgoing.old_registration_id=v_assignment.id
            AND NEW.actual_end_at<=outgoing.effective_at))) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_INVALID';
    END IF;
    SELECT * INTO v_segment FROM public.shift_staffing_segments WHERE id=v_assignment.staffing_segment_id AND shift_id=NEW.shift_id FOR SHARE;
    IF NOT FOUND OR (NEW.event_kind='worked' AND (NEW.actual_start_at<v_segment.start_at OR NEW.actual_end_at>v_segment.end_at)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_INTERVAL_INVALID';
    END IF;
  ELSIF NEW.assignment_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;

-- Preserve valid historical actual-work mapping after an assignment is replaced.
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
    IF EXISTS (SELECT 1 FROM public.shift_staffing_segments s WHERE s.shift_id=v_segment.shift_id) THEN
      IF v_segment.assignment_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.shift_registrations r
        JOIN public.shift_staffing_segments s ON s.id=r.staffing_segment_id AND s.shift_id=r.shift_id
        WHERE r.id=v_segment.assignment_id AND r.shift_id=v_segment.shift_id
          AND r.user_id=v_segment.staff_id AND r.operational_role=v_segment.operational_role
          AND (r.status IN ('approved','manually_assigned') OR
            (r.status='removed' AND EXISTS (
              SELECT 1 FROM public.rc19_shift_assignment_replacements outgoing
              WHERE outgoing.old_registration_id=r.id
                AND v_segment.actual_end_at<=outgoing.effective_at)))
          AND NOT EXISTS (
            SELECT 1 FROM public.rc19_shift_assignment_replacements incoming
            WHERE incoming.new_registration_id=r.id
              AND v_segment.actual_start_at<incoming.effective_at)
          AND v_segment.actual_start_at>=s.start_at AND v_segment.actual_end_at<=s.end_at
      ) THEN
        RETURN array_append(v_missing,'assignment_evidence_mapping_required');
      END IF;
    ELSIF v_segment.assignment_id IS NOT NULL THEN
      RETURN array_append(v_missing,'assignment_evidence_mapping_required');
    END IF;
    foreach v_kind in array array['check_in','check_out'] loop
      select * into v_event from public.self_attendance_events
       where shift_id=v_segment.shift_id and staff_id=v_segment.staff_id
         and operational_role=v_segment.operational_role and event_kind=v_kind
         and assignment_id is not distinct from v_segment.assignment_id;
      if not found then
        v_missing:=array_append(v_missing,v_kind||'_photo_review');
        continue;
      end if;
      select request_id into v_photo_request from public.self_attendance_photo_evidence
       where request_id=v_event.request_id and shift_id=v_segment.shift_id
         and staff_id=v_segment.staff_id and operational_role=v_segment.operational_role
         and assignment_id is not distinct from v_segment.assignment_id;
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

-- Private operation-specific binding; the C4 receipt remains authoritative for
-- replacement parameters and this row binds the complete incident payload.
CREATE TABLE private.rc19_incident_replacement_requests (
  actor_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL,
  incident_id uuid NOT NULL UNIQUE REFERENCES private.rc19_staff_incidents(id) ON DELETE RESTRICT,
  PRIMARY KEY (actor_id, idempotency_key)
);
ALTER TABLE private.rc19_incident_replacement_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rc19_incident_replacement_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.replace_shift_assignment_with_incident_v1(
  p_shift_id text, p_staffing_segment_id text, p_registration_id text,
  p_replacement_user_id text, p_role text, p_expected_shift_version integer,
  p_expected_registration_version integer, p_effective_at timestamptz,
  p_reason text, p_is_emergency boolean, p_idempotency_key uuid,
  p_incident_type text, p_evidence_reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_permission text;
  v_brand text;
  v_payload jsonb;
  v_binding private.rc19_incident_replacement_requests%ROWTYPE;
  v_incident private.rc19_staff_incidents%ROWTYPE;
  v_receipt public.rc19_shift_assignment_replacements%ROWTYPE;
  v_result jsonb;
  v_date date;
BEGIN
  v_actor := private.require_shift_actor(true);
  v_permission := private.current_system_permission();
  IF v_actor IS NULL OR NOT private.current_business_user_is_active()
    OR v_permission NOT IN ('admin', 'leader')
    OR NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTOR_NOT_AUTHORIZED';
  END IF;
  IF p_is_emergency IS NULL OR (p_is_emergency AND v_permission <> 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EMERGENCY_REPLACEMENT_ADMIN_ONLY';
  END IF;
  IF p_idempotency_key IS NULL OR p_incident_type IS NULL OR p_incident_type NOT IN
    ('skip','absent','authorized_absence','late','early_leave','approved_pass','approved_swap','planned_reassignment','other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INCIDENT_REQUEST_INVALID';
  END IF;
  -- Evidence validation/ACL has not yet been implemented. Never accept an
  -- unchecked reference while the review and storage contracts are pending.
  IF p_evidence_reference_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INCIDENT_EVIDENCE_REFERENCE_UNAVAILABLE';
  END IF;
  SELECT brand_id, date INTO v_brand, v_date FROM public.shifts
    WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND'; END IF;
  IF v_permission = 'leader' AND NOT private.rc19_has_any_leader_brand_scope(v_brand, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;
  v_payload := jsonb_build_object('shift_id',p_shift_id,'segment_id',p_staffing_segment_id,
    'registration_id',p_registration_id,'replacement_user_id',p_replacement_user_id,'role',p_role,
    'shift_version',p_expected_shift_version,'registration_version',p_expected_registration_version,
    'effective_at',p_effective_at,'reason',btrim(p_reason),'emergency',p_is_emergency,
    'incident_type',p_incident_type,'evidence_reference_id',p_evidence_reference_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor || ':' || p_idempotency_key::text, 91732));
  SELECT * INTO v_binding FROM private.rc19_incident_replacement_requests
    WHERE actor_id=v_actor AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND AND v_binding.request_payload IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
  END IF;
  IF v_binding.incident_id IS NULL AND EXISTS (
    SELECT 1 FROM public.rc19_shift_assignment_replacements
    WHERE actor_business_user_id=v_actor AND idempotency_key=p_idempotency_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
  END IF;
  -- C4 performs actor, brand scope, version, timing, eligibility, capacity and
  -- overlap checks in this transaction. Locked-history coverage requires its
  -- own verification and must not be inferred from this call.
  v_result := public.replace_shift_assignment(p_shift_id,p_staffing_segment_id,p_registration_id,
    p_replacement_user_id,p_role,p_expected_shift_version,p_expected_registration_version,
    p_effective_at,p_reason,p_is_emergency,p_idempotency_key);
  IF v_binding.incident_id IS NOT NULL THEN
    SELECT * INTO STRICT v_incident FROM private.rc19_staff_incidents WHERE id=v_binding.incident_id;
  ELSE
    SELECT * INTO STRICT v_receipt FROM public.rc19_shift_assignment_replacements
      WHERE id=(v_result->>'replacement_id')::uuid AND actor_business_user_id=v_actor;
    INSERT INTO private.rc19_staff_incidents (shift_id,staffing_segment_id,original_registration_id,
      original_staff_id,replacement_registration_id,replacement_staff_id,replacement_receipt_id,
      operational_role,business_date,incident_type,effective_at,reason,created_by)
    VALUES (v_receipt.shift_id,v_receipt.staffing_segment_id,v_receipt.old_registration_id,
      v_receipt.old_user_id,v_receipt.new_registration_id,v_receipt.replacement_user_id,v_receipt.id,
      v_receipt.operational_role,v_date,p_incident_type,v_receipt.effective_at,btrim(p_reason),v_actor)
    RETURNING * INTO v_incident;
    INSERT INTO private.rc19_incident_replacement_requests(actor_id,idempotency_key,request_payload,incident_id)
      VALUES(v_actor,p_idempotency_key,v_payload,v_incident.id);
    -- The legacy audit helper may swallow errors. This write intentionally
    -- propagates failure so replacement, receipt and incident roll back together.
    INSERT INTO public.audit_logs (actor_auth_user_id,actor_business_user_id,actor_name,actor_role,
      module,action,entity_type,entity_id,entity_name,reason,source,status,metadata,related_records)
    SELECT auth.uid(),v_actor,u.full_name,v_permission,'staffing','incident_recorded','staff_incident',
      v_incident.id::text,'staff_incident:' || v_incident.id::text,btrim(p_reason),'system','success',
      jsonb_build_object('incident_id',v_incident.id,'replacement_id',v_receipt.id,
        'original_registration_id',v_receipt.old_registration_id,'review_state','pending'),
      jsonb_build_array(jsonb_build_object('entity_type','shift','entity_id',p_shift_id))
    FROM public.business_users u WHERE u.id=v_actor;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ACTOR_NOT_AUTHORIZED'; END IF;
  END IF;
  RETURN v_result || jsonb_build_object('canonical_incident',jsonb_build_object(
    'id',v_incident.id,'shift_id',v_incident.shift_id,'staffing_segment_id',v_incident.staffing_segment_id,
    'original_registration_id',v_incident.original_registration_id,'original_staff_id',v_incident.original_staff_id,
    'replacement_registration_id',v_incident.replacement_registration_id,'replacement_staff_id',v_incident.replacement_staff_id,
    'role',v_incident.operational_role,'business_date',v_incident.business_date,'incident_type',v_incident.incident_type,
    'review_state',v_incident.review_state,'verified_late_minutes',v_incident.verified_late_minutes,'version',v_incident.version));
END;
$$;
ALTER FUNCTION public.replace_shift_assignment_with_incident_v1(text,text,text,text,text,integer,integer,timestamptz,text,boolean,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_shift_assignment_with_incident_v1(text,text,text,text,text,integer,integer,timestamptz,text,boolean,uuid,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.replace_shift_assignment_with_incident_v1(text,text,text,text,text,integer,integer,timestamptz,text,boolean,uuid,text,text) TO authenticated;
COMMIT;
