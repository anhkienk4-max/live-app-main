-- Delta D2: persisted operational-note draft, submit, review and correction workflow.
-- Existing notes remain readable and retain their original IDs and versions.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.shift_operational_notes') IS NULL
     OR to_regclass('public.shifts') IS NULL
     OR to_regclass('public.business_users') IS NULL
     OR to_regclass('public.shift_staffing_segments') IS NULL
     OR to_regclass('private.rc19_staff_incidents') IS NULL
     OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
     OR to_regprocedure('private.can_write_shift_operational_notes(text)') IS NULL
     OR to_regprocedure('private.can_read_shift_operational_notes(text)') IS NULL THEN
    RAISE EXCEPTION 'DELTA_D2_DEPENDENCIES_MISSING';
  END IF;
END;
$$;

ALTER TABLE public.shift_operational_notes
  ADD COLUMN workflow_state text NOT NULL DEFAULT 'submitted'
    CHECK (workflow_state IN ('draft','submitted','reviewed','correction_requested','rejected')),
  ADD COLUMN staffing_segment_id text NULL REFERENCES public.shift_staffing_segments(id) ON DELETE RESTRICT,
  ADD COLUMN canonical_incident_id uuid NULL REFERENCES private.rc19_staff_incidents(id) ON DELETE RESTRICT;

CREATE TABLE public.shift_operational_note_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id text NOT NULL REFERENCES public.shift_operational_notes(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  action text NOT NULL CHECK (action IN ('created','draft_saved','submitted','reviewed','correction_requested','rejected','correction_submitted')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  actor_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (note_id, version)
);
CREATE INDEX shift_operational_note_revisions_note_idx
  ON public.shift_operational_note_revisions (note_id, version DESC);
ALTER TABLE public.shift_operational_note_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shift_operational_note_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.shift_operational_note_revisions TO authenticated;
CREATE POLICY shift_operational_note_revisions_read_policy
  ON public.shift_operational_note_revisions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shift_operational_notes n
    WHERE n.id = note_id AND n.deleted_at IS NULL
      AND private.can_read_shift_operational_notes(n.shift_id)
  ));

CREATE TABLE private.rc19_shift_note_idempotency (
  actor_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL,
  note_id text NOT NULL REFERENCES public.shift_operational_notes(id) ON DELETE RESTRICT,
  resulting_version integer NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (actor_id, idempotency_key)
);
ALTER TABLE private.rc19_shift_note_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rc19_shift_note_idempotency FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.record_shift_note_initial_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.shift_operational_note_revisions(note_id,version,action,snapshot,actor_id)
  VALUES(NEW.id,NEW.version,'created',to_jsonb(NEW),NEW.author_id);
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.record_shift_note_initial_revision() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.record_shift_note_initial_revision() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER shift_operational_notes_initial_revision
  AFTER INSERT ON public.shift_operational_notes
  FOR EACH ROW EXECUTE FUNCTION private.record_shift_note_initial_revision();

CREATE OR REPLACE FUNCTION public.mutate_shift_operational_note_v1(
  p_action text,
  p_note_id text,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_shift_id text DEFAULT NULL,
  p_business_date date DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_actual_event_time timestamptz DEFAULT NULL,
  p_affected_role text DEFAULT NULL,
  p_affected_user_id text DEFAULT NULL,
  p_staffing_segment_id text DEFAULT NULL,
  p_canonical_incident_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text := private.require_shift_actor(false);
  v_permission text := private.current_system_permission();
  v_note public.shift_operational_notes%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_payload jsonb;
  v_existing private.rc19_shift_note_idempotency%ROWTYPE;
  v_action text := p_action;
  v_revision_action text;
  v_next_state text;
  v_next_version integer;
  v_now timestamptz := statement_timestamp();
  v_resolved_shift_id text;
  v_resolved_segment_id text;
BEGIN
  IF v_actor IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR v_action NOT IN ('save_draft','submit','approve','request_correction','reject') THEN
    RAISE EXCEPTION 'NOTE_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_action <> 'save_draft' AND (
    p_shift_id IS NOT NULL OR p_business_date IS NOT NULL OR p_category IS NOT NULL OR p_note IS NOT NULL
    OR p_actual_event_time IS NOT NULL OR p_affected_role IS NOT NULL OR p_affected_user_id IS NOT NULL
    OR p_staffing_segment_id IS NOT NULL OR p_canonical_incident_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'NOTE_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'action',v_action,'note_id',p_note_id,'expected_version',p_expected_version,
    'shift_id',p_shift_id,'business_date',p_business_date,'category',p_category,'note',p_note,
    'actual_event_time',p_actual_event_time,'affected_role',p_affected_role,
    'affected_user_id',p_affected_user_id,'staffing_segment_id',p_staffing_segment_id,
    'canonical_incident_id',p_canonical_incident_id
  );

  IF p_note_id IS NULL THEN
    IF v_action <> 'save_draft' OR p_expected_version IS NOT NULL OR p_shift_id IS NULL THEN
      RAISE EXCEPTION 'NOTE_REQUEST_INVALID' USING ERRCODE = '22023';
    END IF;
    IF NOT private.can_write_shift_operational_notes(p_shift_id) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_shift FROM public.shifts s
    WHERE s.id = p_shift_id AND s.deleted_at IS NULL AND s.archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    v_resolved_shift_id := p_shift_id;
    v_resolved_segment_id := p_staffing_segment_id;
  ELSE
    SELECT * INTO v_note FROM public.shift_operational_notes n
    WHERE n.id = p_note_id AND n.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF NOT private.can_write_shift_operational_notes(v_note.shift_id) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF v_action IN ('approve','request_correction','reject') AND v_permission NOT IN ('admin','leader') THEN
      RAISE EXCEPTION 'NOTE_REVIEW_PERMISSION_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF v_action IN ('save_draft','submit') AND v_note.author_id <> v_actor THEN
      RAISE EXCEPTION 'NOTE_AUTHOR_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_shift_id IS NOT NULL AND p_shift_id <> v_note.shift_id THEN
      RAISE EXCEPTION 'NOTE_SHIFT_IMMUTABLE' USING ERRCODE = '22023';
    END IF;
    v_resolved_shift_id := v_note.shift_id;
    v_resolved_segment_id := CASE WHEN v_action='save_draft' THEN p_staffing_segment_id ELSE v_note.staffing_segment_id END;
  END IF;

  -- Authorization is deliberately evaluated before idempotency replay.
  SELECT * INTO v_existing FROM private.rc19_shift_note_idempotency i
  WHERE i.actor_id = v_actor AND i.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_note FROM public.shift_operational_notes n WHERE n.id = v_existing.note_id;
    RETURN jsonb_build_object(
      'note',to_jsonb(v_note),'replayed',true,'revision',v_note.version,
      'originalRevision',v_existing.resulting_version
    );
  END IF;

  IF p_staffing_segment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shift_staffing_segments seg
    WHERE seg.id = p_staffing_segment_id AND seg.shift_id = v_resolved_shift_id
  ) THEN RAISE EXCEPTION 'NOTE_SEGMENT_SHIFT_MISMATCH' USING ERRCODE = '22023'; END IF;

  IF p_affected_role IS NOT NULL AND p_affected_role NOT IN ('host','support','technical') THEN
    RAISE EXCEPTION 'INVALID_AFFECTED_ROLE' USING ERRCODE = '22023';
  END IF;
  IF p_affected_user_id IS NOT NULL THEN
    IF v_permission = 'member' AND p_affected_user_id <> v_actor THEN
      RAISE EXCEPTION 'NOTE_SUBJECT_SCOPE_DENIED' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_users u WHERE u.id = p_affected_user_id
        AND u.status = 'active' AND u.account_status = 'active'
        AND u.archived_at IS NULL AND u.deleted_at IS NULL
    ) THEN RAISE EXCEPTION 'AFFECTED_USER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.shift_registrations r
      WHERE r.shift_id = v_resolved_shift_id
        AND r.user_id = p_affected_user_id
        AND (p_affected_role IS NULL OR r.operational_role = p_affected_role)
        AND r.staffing_segment_id IS NOT DISTINCT FROM v_resolved_segment_id
    ) AND NOT EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = v_resolved_shift_id AND v_resolved_segment_id IS NULL
        AND ((p_affected_role IS NULL OR p_affected_role='host') AND s.host_id=p_affected_user_id
          OR (p_affected_role IS NULL OR p_affected_role='support') AND s.support_id=p_affected_user_id
          OR (p_affected_role IS NULL OR p_affected_role='technical') AND s.technical_id=p_affected_user_id)
    ) THEN RAISE EXCEPTION 'NOTE_SUBJECT_NOT_ASSIGNED' USING ERRCODE = '22023'; END IF;
  END IF;

  IF p_canonical_incident_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.rc19_staff_incidents i
    WHERE i.id = p_canonical_incident_id
      AND i.shift_id = v_resolved_shift_id
      AND i.staffing_segment_id IS NOT DISTINCT FROM v_resolved_segment_id
      AND (p_affected_user_id IS NULL OR p_affected_user_id IN (i.original_staff_id,i.replacement_staff_id))
  ) THEN RAISE EXCEPTION 'NOTE_INCIDENT_SCOPE_MISMATCH' USING ERRCODE = '42501'; END IF;

  IF v_action = 'save_draft' THEN
    IF btrim(coalesce(p_note,'')) = '' THEN RAISE EXCEPTION 'NOTE_EMPTY' USING ERRCODE = '22023'; END IF;
    IF p_category IS NULL OR p_category NOT IN ('normal','attendance','swap','incident','sales','other') THEN
      RAISE EXCEPTION 'INVALID_CATEGORY' USING ERRCODE = '22023';
    END IF;
    IF p_business_date IS DISTINCT FROM (CASE WHEN p_note_id IS NULL THEN v_shift.date ELSE v_note.business_date END) THEN
      RAISE EXCEPTION 'BUSINESS_DATE_MISMATCH' USING ERRCODE = '22023';
    END IF;
    IF p_note_id IS NULL THEN
      INSERT INTO public.shift_operational_notes (
        shift_id,business_date,date,category,note,author_id,author_name,author_role,
        actual_event_time,event_time,affected_role,affected_user_id,version,workflow_state,
        staffing_segment_id,canonical_incident_id
      ) SELECT p_shift_id,p_business_date,p_business_date,p_category,btrim(p_note),v_actor,u.full_name,
        coalesce(u.role,'staff'),coalesce(p_actual_event_time,v_now),coalesce(p_actual_event_time,v_now),
        p_affected_role,p_affected_user_id,1,'draft',p_staffing_segment_id,p_canonical_incident_id
        FROM public.business_users u WHERE u.id=v_actor RETURNING * INTO v_note;
      v_revision_action := 'created';
    ELSE
      IF v_note.workflow_state NOT IN ('draft','correction_requested') THEN
        RAISE EXCEPTION 'NOTE_NOT_EDITABLE' USING ERRCODE = '55000';
      END IF;
      IF p_expected_version IS DISTINCT FROM v_note.version THEN
        RAISE EXCEPTION 'NOTE_VERSION_CONFLICT' USING ERRCODE = '40001';
      END IF;
      v_next_version := v_note.version + 1;
      v_next_state := CASE WHEN v_note.workflow_state='correction_requested' THEN 'submitted' ELSE 'draft' END;
      UPDATE public.shift_operational_notes SET
        business_date=p_business_date,date=p_business_date,category=p_category,note=btrim(p_note),
        actual_event_time=coalesce(p_actual_event_time,actual_event_time),
        event_time=coalesce(p_actual_event_time,event_time),affected_role=p_affected_role,
        affected_user_id=p_affected_user_id,staffing_segment_id=p_staffing_segment_id,
        canonical_incident_id=p_canonical_incident_id,workflow_state=v_next_state,
        version=v_next_version,updated_at=v_now
      WHERE id=p_note_id RETURNING * INTO v_note;
      v_revision_action := CASE WHEN v_note.workflow_state='submitted' THEN 'correction_submitted' ELSE 'draft_saved' END;
    END IF;
  ELSIF v_action = 'submit' THEN
    IF p_expected_version IS DISTINCT FROM v_note.version THEN RAISE EXCEPTION 'NOTE_VERSION_CONFLICT' USING ERRCODE = '40001'; END IF;
    IF v_note.workflow_state <> 'draft' THEN RAISE EXCEPTION 'NOTE_NOT_SUBMITTABLE' USING ERRCODE = '55000'; END IF;
    v_next_version := v_note.version + 1;
    UPDATE public.shift_operational_notes SET workflow_state='submitted',version=v_next_version,updated_at=v_now
      WHERE id=p_note_id RETURNING * INTO v_note;
    v_revision_action := 'submitted';
  ELSE
    IF p_expected_version IS DISTINCT FROM v_note.version THEN RAISE EXCEPTION 'NOTE_VERSION_CONFLICT' USING ERRCODE = '40001'; END IF;
    IF v_note.workflow_state <> 'submitted' THEN RAISE EXCEPTION 'NOTE_NOT_REVIEWABLE' USING ERRCODE = '55000'; END IF;
    v_next_version := v_note.version + 1;
    CASE v_action
      WHEN 'approve' THEN v_next_state := 'reviewed'; v_revision_action := 'reviewed';
      WHEN 'request_correction' THEN v_next_state := 'correction_requested'; v_revision_action := 'correction_requested';
      WHEN 'reject' THEN v_next_state := 'rejected'; v_revision_action := 'rejected';
    END CASE;
    UPDATE public.shift_operational_notes SET workflow_state=v_next_state,version=v_next_version,updated_at=v_now
      WHERE id=p_note_id RETURNING * INTO v_note;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.shift_operational_note_revisions r WHERE r.note_id=v_note.id AND r.version=v_note.version) THEN
    INSERT INTO public.shift_operational_note_revisions(note_id,version,action,snapshot,actor_id)
      VALUES(v_note.id,v_note.version,v_revision_action,to_jsonb(v_note),v_actor);
  END IF;
  INSERT INTO private.rc19_shift_note_idempotency(actor_id,idempotency_key,request_payload,note_id,resulting_version,action)
    VALUES(v_actor,p_idempotency_key,v_payload,v_note.id,v_note.version,v_action);
  RETURN jsonb_build_object('note',to_jsonb(v_note),'replayed',false,'revision',v_note.version);
END;
$$;

ALTER FUNCTION public.mutate_shift_operational_note_v1(text,text,integer,uuid,text,date,text,text,timestamptz,text,text,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mutate_shift_operational_note_v1(text,text,integer,uuid,text,date,text,text,timestamptz,text,text,text,uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_shift_operational_note_v1(text,text,integer,uuid,text,date,text,text,timestamptz,text,text,text,uuid) TO authenticated;
COMMENT ON FUNCTION public.mutate_shift_operational_note_v1(text,text,integer,uuid,text,date,text,text,timestamptz,text,text,text,uuid)
  IS 'Delta D2 versioned, actor-scoped operational note draft and review lifecycle. Append-only revisions; CAS and idempotency.';

COMMIT;
