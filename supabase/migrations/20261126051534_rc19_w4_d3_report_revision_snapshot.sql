-- RC19 W4 Delta D3: capture immutable note/incident source snapshots with each
-- report revision. Historical revisions are intentionally not backfilled from
-- mutable live sources.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.reports') IS NULL
     OR to_regclass('public.report_revisions') IS NULL
     OR to_regclass('public.shift_operational_notes') IS NULL
     OR to_regclass('public.shift_staffing_segments') IS NULL
     OR to_regclass('private.rc19_staff_incidents') IS NULL
     OR to_regprocedure('private.report_revision_snapshot(public.reports)') IS NULL
     OR to_regprocedure('private.can_read_report(text)') IS NULL
     OR to_regprocedure('private.can_read_shift_operational_notes(text)') IS NULL
     OR to_regprocedure('private.rc19_can_mutate_report(text)') IS NULL THEN
    RAISE EXCEPTION 'D3_REPORT_REVISION_SNAPSHOT_DEPENDENCIES_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_operational_notes'
      AND column_name = 'workflow_state'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_operational_notes'
      AND column_name = 'canonical_incident_id'
  ) THEN
    RAISE EXCEPTION 'D3_NOTE_WORKFLOW_DEPENDENCY_MISSING';
  END IF;
END;
$$;

CREATE TABLE private.rc19_report_revision_sources (
  report_revision_id text PRIMARY KEY
    REFERENCES public.report_revisions(id) ON DELETE RESTRICT,
  report_id text NOT NULL REFERENCES public.reports(id) ON DELETE RESTRICT,
  revision_version integer NOT NULL CHECK (revision_version > 0),
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  external_projection jsonb NOT NULL CHECK (jsonb_typeof(external_projection) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX rc19_report_revision_sources_lookup_idx
  ON private.rc19_report_revision_sources(report_id, revision_version DESC);
ALTER TABLE private.rc19_report_revision_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_report_revision_sources OWNER TO postgres;
REVOKE ALL ON private.rc19_report_revision_sources FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE private.rc19_report_revision_sources IS
  'Immutable D3 source snapshot captured atomically with a report revision; only authorized RPC projections may read it.';

CREATE FUNCTION private.reject_rc19_report_revision_source_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'REPORT_REVISION_SNAPSHOT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
ALTER FUNCTION private.reject_rc19_report_revision_source_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.reject_rc19_report_revision_source_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rc19_report_revision_sources_immutable
  BEFORE UPDATE OR DELETE ON private.rc19_report_revision_sources
  FOR EACH ROW EXECUTE FUNCTION private.reject_rc19_report_revision_source_mutation();

CREATE FUNCTION private.rc19_report_source_snapshot(p_shift_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH note_rows AS (
    SELECT
      n.id,
      n.version,
      n.business_date,
      n.actual_event_time,
      n.category,
      n.note,
      n.workflow_state,
      n.author_id,
      n.author_name,
      n.author_role,
      n.affected_role,
      n.affected_user_id,
      n.staffing_segment_id,
      n.canonical_incident_id,
      n.created_at,
      jsonb_build_object(
        'noteId', n.id,
        'version', n.version,
        'businessDate', n.business_date,
        'actualEventTime', n.actual_event_time,
        'category', n.category,
        'note', n.note,
        'workflowState', n.workflow_state,
        'authorId', n.author_id,
        'authorName', n.author_name,
        'authorRole', n.author_role,
        'affectedRole', n.affected_role,
        'affectedUserId', n.affected_user_id,
        'staffingSegmentId', n.staffing_segment_id,
        'canonicalIncidentId', n.canonical_incident_id
      ) AS snapshot
    FROM public.shift_operational_notes AS n
    WHERE n.shift_id = p_shift_id AND n.deleted_at IS NULL
      AND n.workflow_state IN ('draft', 'submitted', 'reviewed', 'correction_requested')
  ), incident_rows AS (
    SELECT
      i.id,
      i.version,
      i.business_date,
      i.created_at,
      jsonb_build_object(
        'incidentId', i.id,
        'version', i.version,
        'staffingSegmentId', i.staffing_segment_id,
        'originalRegistrationId', i.original_registration_id,
        'originalStaffId', i.original_staff_id,
        'replacementRegistrationId', i.replacement_registration_id,
        'replacementStaffId', i.replacement_staff_id,
        'replacementReceiptId', i.replacement_receipt_id,
        'role', i.operational_role,
        'businessDate', i.business_date,
        'type', i.incident_type,
        'reviewState', i.review_state,
        'effectiveAt', i.effective_at,
        'reason', i.reason,
        'evidenceReferenceId', i.evidence_reference_id,
        'verifiedLateMinutes', i.verified_late_minutes,
        'createdBy', i.created_by
      ) AS snapshot
    FROM private.rc19_staff_incidents AS i
    WHERE i.shift_id = p_shift_id
  )
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'notes', coalesce((
      SELECT jsonb_agg(n.snapshot ORDER BY n.business_date, n.actual_event_time, n.id)
      FROM note_rows AS n
    ), '[]'::jsonb),
    'noteRefs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'noteId', n.id,
        'version', n.version,
        'canonicalIncidentId', n.canonical_incident_id
      ) ORDER BY n.business_date, n.actual_event_time, n.id)
      FROM note_rows AS n
    ), '[]'::jsonb),
    'incidents', coalesce((
      SELECT jsonb_agg(i.snapshot ORDER BY i.business_date, i.created_at, i.id)
      FROM incident_rows AS i
    ), '[]'::jsonb),
    'incidentRefs', coalesce((
      SELECT jsonb_agg(jsonb_build_object('incidentId', i.id, 'version', i.version)
        ORDER BY i.business_date, i.created_at, i.id)
      FROM incident_rows AS i
    ), '[]'::jsonb)
  );
$$;
ALTER FUNCTION private.rc19_report_source_snapshot(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_report_source_snapshot(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.rc19_report_external_projection(p_report public.reports, p_revision_version integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'reportId', p_report.id,
    'revisionVersion', p_revision_version,
    'status', p_report.status,
    'metrics', jsonb_build_object(
      'revenue', p_report.revenue,
      'orders', p_report.orders,
      'peakViewer', p_report.peak_viewer,
      'averageViewer', p_report.average_viewer,
      'gmv', p_report.gmv,
      'viewers', p_report.viewers,
      'productClicks', p_report.product_clicks,
      'ctr', p_report.ctr,
      'cvr', p_report.cvr,
      'averageOrderValue', p_report.average_order_value,
      'liveDurationMinutes', p_report.live_duration_minutes,
      'dashboardPlatform', p_report.dashboard_platform
    )
  );
$$;
ALTER FUNCTION private.rc19_report_external_projection(public.reports, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_report_external_projection(public.reports, integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.record_report_revision(
  p_report_id text,
  p_actor_id text,
  p_status text,
  p_event text,
  p_reason text,
  p_metrics jsonb,
  p_ocr_review jsonb,
  p_final_recap jsonb,
  p_image_references text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  next_version integer;
  revision_id text;
  target_report public.reports;
  source_snapshot jsonb;
BEGIN
  SELECT * INTO target_report
  FROM public.reports
  WHERE id = p_report_id
  FOR UPDATE;
  IF target_report.id IS NULL THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.shift_operational_notes AS note
    WHERE note.shift_id = target_report.shift_id
      AND note.deleted_at IS NULL
      AND note.workflow_state IN ('draft', 'submitted', 'reviewed', 'correction_requested')
      AND (
        (note.staffing_segment_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.shift_staffing_segments AS segment
          WHERE segment.id = note.staffing_segment_id AND segment.shift_id = target_report.shift_id
        ))
        OR (note.canonical_incident_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM private.rc19_staff_incidents AS incident
          WHERE incident.id = note.canonical_incident_id AND incident.shift_id = target_report.shift_id
        ))
      )
  ) THEN
    RAISE EXCEPTION 'REPORT_SOURCE_SCOPE_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO next_version
  FROM public.report_revisions
  WHERE report_id = p_report_id;

  INSERT INTO public.report_revisions (
    report_id, version, created_by, status, reason, event,
    metrics, ocr_review, final_recap, image_references
  ) VALUES (
    p_report_id, next_version, p_actor_id, p_status, p_reason, p_event,
    p_metrics, p_ocr_review, p_final_recap, p_image_references
  ) RETURNING id INTO revision_id;

  source_snapshot := private.rc19_report_source_snapshot(target_report.shift_id);
  INSERT INTO private.rc19_report_revision_sources (
    report_revision_id, report_id, revision_version, source_snapshot, external_projection
  ) VALUES (
    revision_id,
    p_report_id,
    next_version,
    source_snapshot,
    private.rc19_report_external_projection(target_report, next_version)
  );

  UPDATE public.reports SET version_number = next_version WHERE id = p_report_id;
END;
$$;
ALTER FUNCTION private.record_report_revision(text, text, text, text, text, jsonb, jsonb, jsonb, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.record_report_revision(
  text, text, text, text, text, jsonb, jsonb, jsonb, text[]
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.preview_report_revision_sources_v1(
  p_report_id text,
  p_audience text DEFAULT 'internal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_permission text := private.current_system_permission();
  target_report public.reports;
BEGIN
  IF actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_audience IS NULL OR p_audience NOT IN ('internal', 'external') THEN
    RAISE EXCEPTION 'REPORT_SNAPSHOT_AUDIENCE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT private.can_read_report(p_report_id) THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO target_report FROM public.reports WHERE id = p_report_id;
  IF target_report.id IS NULL THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_audience = 'internal' THEN
    IF actor_permission NOT IN ('admin', 'leader')
      OR NOT private.can_read_shift_operational_notes(target_report.shift_id) THEN
      RAISE EXCEPTION 'REPORT_INTERNAL_SNAPSHOT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF actor_permission = 'leader' AND NOT private.rc19_has_any_leader_brand_scope(
      (SELECT shift.brand_id FROM public.shifts AS shift WHERE shift.id = target_report.shift_id),
      ARRAY['reports.read', 'reports.review']::text[]
    ) THEN
      RAISE EXCEPTION 'REPORT_INTERNAL_SNAPSHOT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
      'kind', 'preview', 'reportId', p_report_id, 'shiftId', target_report.shift_id,
      'currentVersion', target_report.version_number, 'audience', 'internal',
      'sourceSnapshot', private.rc19_report_source_snapshot(target_report.shift_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'kind', 'preview', 'reportId', p_report_id, 'shiftId', target_report.shift_id,
    'currentVersion', target_report.version_number, 'audience', 'external',
    'externalProjection', private.rc19_report_external_projection(target_report, target_report.version_number)
  );
END;
$$;
ALTER FUNCTION public.preview_report_revision_sources_v1(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.preview_report_revision_sources_v1(text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_report_revision_sources_v1(text, text) TO authenticated;

CREATE FUNCTION public.get_report_revision_sources_v1(
  p_report_id text,
  p_revision_version integer,
  p_audience text DEFAULT 'internal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_permission text := private.current_system_permission();
  target_report public.reports;
  source_row private.rc19_report_revision_sources%ROWTYPE;
  revision_row public.report_revisions%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_revision_version IS NULL OR p_revision_version < 1
     OR p_audience IS NULL OR p_audience NOT IN ('internal', 'external') THEN
    RAISE EXCEPTION 'REPORT_SNAPSHOT_QUERY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT private.can_read_report(p_report_id) THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO target_report FROM public.reports WHERE id = p_report_id;
  IF target_report.id IS NULL THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_audience = 'internal' THEN
    IF actor_permission NOT IN ('admin', 'leader')
      OR NOT private.can_read_shift_operational_notes(target_report.shift_id) THEN
      RAISE EXCEPTION 'REPORT_INTERNAL_SNAPSHOT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF actor_permission = 'leader' AND NOT private.rc19_has_any_leader_brand_scope(
      (SELECT shift.brand_id FROM public.shifts AS shift WHERE shift.id = target_report.shift_id),
      ARRAY['reports.read', 'reports.review']::text[]
    ) THEN
      RAISE EXCEPTION 'REPORT_INTERNAL_SNAPSHOT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO revision_row FROM public.report_revisions AS revision
  WHERE revision.report_id = p_report_id AND revision.version = p_revision_version;
  SELECT * INTO source_row FROM private.rc19_report_revision_sources AS sources
  WHERE sources.report_revision_id = revision_row.id;
  IF revision_row.id IS NULL OR source_row.report_revision_id IS NULL THEN
    RAISE EXCEPTION 'REPORT_REVISION_SNAPSHOT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_audience = 'internal' THEN
    RETURN jsonb_build_object(
      'kind', 'revision', 'reportId', p_report_id, 'revisionId', revision_row.id,
      'revisionVersion', revision_row.version, 'createdAt', revision_row.created_at,
      'audience', 'internal', 'sourceSnapshot', source_row.source_snapshot
    );
  END IF;
  RETURN jsonb_build_object(
    'kind', 'revision', 'reportId', p_report_id, 'revisionId', revision_row.id,
    'revisionVersion', revision_row.version, 'createdAt', revision_row.created_at,
    'audience', 'external', 'externalProjection', source_row.external_projection
  );
END;
$$;
ALTER FUNCTION public.get_report_revision_sources_v1(text, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_report_revision_sources_v1(text, integer, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_report_revision_sources_v1(text, integer, text) TO authenticated;

COMMENT ON FUNCTION public.preview_report_revision_sources_v1(text, text) IS
  'D3 internal report preview of saved notes and canonical incidents; external audience returns allowlisted metrics only.';
COMMENT ON FUNCTION public.get_report_revision_sources_v1(text, integer, text) IS
  'D3 authorized immutable source snapshot readback for one persisted report revision.';

CREATE TABLE private.rc19_report_revision_idempotency (
  actor_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  report_id text NOT NULL REFERENCES public.reports(id) ON DELETE RESTRICT,
  revision_id text NOT NULL REFERENCES public.report_revisions(id) ON DELETE RESTRICT,
  revision_version integer NOT NULL CHECK (revision_version > 0),
  response_report jsonb NOT NULL CHECK (jsonb_typeof(response_report) = 'object'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (actor_id, idempotency_key)
);
ALTER TABLE private.rc19_report_revision_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_report_revision_idempotency OWNER TO postgres;
REVOKE ALL ON private.rc19_report_revision_idempotency FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE private.rc19_report_revision_idempotency IS
  'Actor-scoped receipt for atomic report CAS save plus D3 snapshot; replay requires current report-read authorization.';

CREATE FUNCTION public.update_report_with_revision_snapshot_v1(
  p_report_id text,
  p_patch jsonb,
  p_expected_version integer,
  p_reason text,
  p_event text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text := private.require_report_actor(false);
  v_request_payload jsonb;
  v_existing private.rc19_report_revision_idempotency%ROWTYPE;
  v_report public.reports;
  v_revision public.report_revisions%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'REPORT_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_request_payload := jsonb_build_object(
    'reportId', p_report_id,
    'patch', p_patch,
    'expectedVersion', p_expected_version,
    'reason', p_reason,
    'event', p_event
  );

  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor_id || ':' || p_idempotency_key::text, 0));
  SELECT receipt.* INTO v_existing
  FROM private.rc19_report_revision_idempotency AS receipt
  WHERE receipt.actor_id = v_actor_id AND receipt.idempotency_key = p_idempotency_key;

  IF v_existing.actor_id IS NOT NULL THEN
    IF v_existing.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'REPORT_IDEMPOTENCY_CONFLICT' USING ERRCODE = '22023';
    END IF;
    IF NOT private.current_business_user_is_active()
       OR NOT private.rc19_can_mutate_report(v_existing.report_id) THEN
      RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'report', v_existing.response_report,
      'revisionId', v_existing.revision_id,
      'revisionVersion', v_existing.revision_version,
      'replayed', true
    );
  END IF;

  v_report := public.update_report(
    p_report_id, p_patch, p_expected_version, p_reason, p_event
  );
  SELECT revision.* INTO v_revision
  FROM public.report_revisions AS revision
  WHERE revision.report_id = p_report_id
    AND revision.version = v_report.version_number;
  IF v_revision.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.rc19_report_revision_sources AS sources
    WHERE sources.report_revision_id = v_revision.id
  ) THEN
    RAISE EXCEPTION 'REPORT_REVISION_SNAPSHOT_NOT_PERSISTED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO private.rc19_report_revision_idempotency (
    actor_id, idempotency_key, request_payload, report_id, revision_id,
    revision_version, response_report
  ) VALUES (
    v_actor_id, p_idempotency_key, v_request_payload, p_report_id, v_revision.id,
    v_revision.version, to_jsonb(v_report)
  );

  RETURN jsonb_build_object(
    'report', to_jsonb(v_report),
    'revisionId', v_revision.id,
    'revisionVersion', v_revision.version,
    'replayed', false
  );
END;
$$;
ALTER FUNCTION public.update_report_with_revision_snapshot_v1(text, jsonb, integer, text, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_report_with_revision_snapshot_v1(text, jsonb, integer, text, text, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_report_with_revision_snapshot_v1(text, jsonb, integer, text, text, uuid) TO authenticated;
COMMENT ON FUNCTION public.update_report_with_revision_snapshot_v1(text, jsonb, integer, text, text, uuid) IS
  'D3 atomic report CAS save, revision source snapshot and actor-scoped idempotency receipt.';

COMMIT;
