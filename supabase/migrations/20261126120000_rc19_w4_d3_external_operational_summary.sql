-- RC19 W4 D3: separately reviewed external operational summary.
-- Historical report revisions are intentionally not backfilled.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.reports') IS NULL
     OR to_regclass('public.report_revisions') IS NULL
     OR to_regclass('private.rc19_report_revision_sources') IS NULL
     OR to_regprocedure('private.record_report_revision(text,text,text,text,text,jsonb,jsonb,jsonb,text[])') IS NULL
     OR to_regprocedure('private.rc19_can_mutate_report(text)') IS NULL
     OR to_regprocedure('private.can_read_report(text)') IS NULL
     OR to_regprocedure('private.log_shift_audit(text,text,text,text,text,jsonb,text[])') IS NULL THEN
    RAISE EXCEPTION 'D3_EXTERNAL_SUMMARY_DEPENDENCIES_MISSING';
  END IF;
END;
$dependencies$;

CREATE TABLE private.rc19_report_external_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL UNIQUE REFERENCES public.reports(id) ON DELETE RESTRICT,
  shift_id text NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
  workflow_state text NOT NULL DEFAULT 'draft'
    CHECK (workflow_state IN ('draft', 'submitted', 'approved', 'rejected', 'correction_requested')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  updated_by text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  submitted_by text REFERENCES public.business_users(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  reviewed_by text REFERENCES public.business_users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK ((submitted_by IS NULL) = (submitted_at IS NULL)),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))
);
CREATE INDEX rc19_report_external_summaries_shift_idx
  ON private.rc19_report_external_summaries(shift_id, workflow_state, updated_at DESC);
ALTER TABLE private.rc19_report_external_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_report_external_summaries OWNER TO postgres;
REVOKE ALL ON private.rc19_report_external_summaries FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.rc19_report_external_summary_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id uuid NOT NULL REFERENCES private.rc19_report_external_summaries(id) ON DELETE RESTRICT,
  report_id text NOT NULL REFERENCES public.reports(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  action text NOT NULL CHECK (action IN ('save_draft', 'submit', 'approve', 'reject', 'request_correction')),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
  actor_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  reason text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (summary_id, version)
);
CREATE INDEX rc19_report_external_summary_events_report_idx
  ON private.rc19_report_external_summary_events(report_id, created_at, id);
ALTER TABLE private.rc19_report_external_summary_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_report_external_summary_events OWNER TO postgres;
REVOKE ALL ON private.rc19_report_external_summary_events FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.rc19_report_external_summary_idempotency (
  actor_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (actor_id, idempotency_key)
);
ALTER TABLE private.rc19_report_external_summary_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_report_external_summary_idempotency OWNER TO postgres;
REVOKE ALL ON private.rc19_report_external_summary_idempotency FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE private.rc19_report_revision_sources
  ADD COLUMN external_summary_snapshot jsonb;
COMMENT ON COLUMN private.rc19_report_revision_sources.external_summary_snapshot IS
  'Private immutable approved-summary provenance captured with a report revision; null means no approved summary at capture time.';

CREATE FUNCTION private.attach_rc19_external_summary_to_report_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  approved_summary private.rc19_report_external_summaries%ROWTYPE;
  private_snapshot jsonb;
BEGIN
  SELECT * INTO approved_summary
  FROM private.rc19_report_external_summaries AS summary
  WHERE summary.report_id = NEW.report_id AND summary.workflow_state = 'approved';

  IF approved_summary.id IS NULL THEN
    NEW.external_summary_snapshot := NULL;
    NEW.external_projection := NEW.external_projection || jsonb_build_object('operationalSummary', NULL);
    RETURN NEW;
  END IF;

  private_snapshot := jsonb_build_object(
    'reportRevisionId', NEW.report_revision_id,
    'reportRevisionVersion', NEW.revision_version,
    'summaryId', approved_summary.id,
    'summaryVersion', approved_summary.version,
    'content', approved_summary.content,
    'approvedBy', approved_summary.reviewed_by,
    'approvedAt', approved_summary.reviewed_at
  );
  NEW.external_summary_snapshot := private_snapshot;
  NEW.source_snapshot := NEW.source_snapshot || jsonb_build_object(
    'approvedExternalSummary', jsonb_build_object(
      'summaryId', approved_summary.id,
      'version', approved_summary.version,
      'approvedBy', approved_summary.reviewed_by,
      'approvedAt', approved_summary.reviewed_at
    )
  );
  NEW.external_projection := NEW.external_projection || jsonb_build_object(
    'operationalSummary', jsonb_build_object(
      'version', approved_summary.version,
      'content', approved_summary.content
    )
  );
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.attach_rc19_external_summary_to_report_revision() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.attach_rc19_external_summary_to_report_revision() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rc19_attach_external_summary_before_revision_insert
  BEFORE INSERT ON private.rc19_report_revision_sources
  FOR EACH ROW EXECUTE FUNCTION private.attach_rc19_external_summary_to_report_revision();

CREATE OR REPLACE FUNCTION private.rc19_report_external_projection(
  p_report public.reports,
  p_revision_version integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    ),
    'operationalSummary', (
      SELECT CASE WHEN summary.workflow_state = 'approved'
        THEN jsonb_build_object('version', summary.version, 'content', summary.content)
        ELSE NULL END
      FROM private.rc19_report_external_summaries AS summary
      WHERE summary.report_id = p_report.id
    )
  );
$$;
ALTER FUNCTION private.rc19_report_external_projection(public.reports, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_report_external_projection(public.reports, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_report_external_summary_workflow_v1(p_report_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  target_report public.reports;
  summary private.rc19_report_external_summaries%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT private.can_read_report(p_report_id) THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO target_report FROM public.reports WHERE id = p_report_id;
  IF target_report.id IS NULL THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.rc19_can_mutate_report(p_report_id)
     AND NOT (actor_role IN ('admin', 'leader') AND private.rc19_has_any_leader_brand_scope(
       (SELECT shift.brand_id FROM public.shifts AS shift WHERE shift.id = target_report.shift_id),
       ARRAY['reports.read', 'reports.review']::text[]
     )) THEN
    RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO summary FROM private.rc19_report_external_summaries WHERE report_id = p_report_id;
  IF summary.id IS NULL THEN
    RETURN jsonb_build_object('reportId', p_report_id, 'summary', NULL);
  END IF;
  RETURN jsonb_build_object('reportId', p_report_id, 'summary', jsonb_build_object(
    'id', summary.id, 'content', summary.content, 'workflowState', summary.workflow_state,
    'version', summary.version, 'createdBy', summary.created_by, 'updatedBy', summary.updated_by,
    'submittedBy', summary.submitted_by, 'submittedAt', summary.submitted_at,
    'reviewedBy', summary.reviewed_by, 'reviewedAt', summary.reviewed_at,
    'reviewReason', summary.review_reason, 'createdAt', summary.created_at, 'updatedAt', summary.updated_at
  ));
END;
$$;
ALTER FUNCTION public.get_report_external_summary_workflow_v1(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_report_external_summary_workflow_v1(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_report_external_summary_workflow_v1(text) TO authenticated;

CREATE FUNCTION public.external_report_summary_workflow_v1(
  p_action text,
  p_report_id text,
  p_summary_id uuid,
  p_content text,
  p_expected_version integer,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  target_report public.reports;
  summary private.rc19_report_external_summaries%ROWTYPE;
  receipt private.rc19_report_external_summary_idempotency%ROWTYPE;
  request_payload jsonb;
  reviewer_action boolean;
  response_payload jsonb;
  current_revision_id text;
BEGIN
  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('save_draft', 'submit', 'approve', 'reject', 'request_correction')
     OR p_report_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  reviewer_action := p_action IN ('approve', 'reject', 'request_correction');
  IF reviewer_action AND (actor_role NOT IN ('admin', 'leader') OR
      (actor_role = 'leader' AND NOT private.rc19_has_leader_brand_scope(
        (SELECT shift.brand_id FROM public.reports AS report
         JOIN public.shifts AS shift ON shift.id = report.shift_id
         WHERE report.id = p_report_id), 'reports.review'))) THEN
    RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_REVIEW_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT reviewer_action AND NOT private.rc19_can_mutate_report(p_report_id) THEN
    RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_MUTATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_report FROM public.reports
  WHERE id = p_report_id AND deleted_at IS NULL AND archived_at IS NULL FOR UPDATE;
  IF target_report.id IS NULL THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF target_report.metrics_confirmed OR target_report.status = 'confirmed' THEN
    RAISE EXCEPTION 'REPORT_CONFIRMED' USING ERRCODE = 'P0001';
  END IF;

  request_payload := jsonb_build_object(
    'action', p_action, 'reportId', p_report_id, 'summaryId', p_summary_id,
    'content', p_content, 'expectedVersion', p_expected_version, 'reason', p_reason
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor_id || ':' || p_idempotency_key::text, 0));
  SELECT * INTO receipt FROM private.rc19_report_external_summary_idempotency
  WHERE private.rc19_report_external_summary_idempotency.actor_id = v_actor_id
    AND idempotency_key = p_idempotency_key;
  IF receipt.actor_id IS NOT NULL THEN
    IF receipt.request_payload IS DISTINCT FROM request_payload THEN
      RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_IDEMPOTENCY_CONFLICT' USING ERRCODE = '22023';
    END IF;
    IF reviewer_action THEN
      IF actor_role NOT IN ('admin', 'leader') OR (actor_role = 'leader' AND NOT private.rc19_has_leader_brand_scope(
        (SELECT shift.brand_id FROM public.shifts AS shift WHERE shift.id = target_report.shift_id), 'reports.review')) THEN
        RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_REPLAY_FORBIDDEN' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT private.rc19_can_mutate_report(p_report_id) THEN
      RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_REPLAY_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    RETURN receipt.response || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO summary FROM private.rc19_report_external_summaries
  WHERE report_id = p_report_id FOR UPDATE;
  IF p_action = 'save_draft' THEN
    IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 4000 THEN
      RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_CONTENT_INVALID' USING ERRCODE = '22023';
    END IF;
    IF summary.id IS NULL THEN
      IF p_summary_id IS NOT NULL OR coalesce(p_expected_version, 0) <> 0 THEN
        RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_VERSION_CONFLICT' USING ERRCODE = '40001';
      END IF;
      INSERT INTO private.rc19_report_external_summaries (
        report_id, shift_id, content, workflow_state, version, created_by, updated_by
      ) VALUES (p_report_id, target_report.shift_id, btrim(p_content), 'draft', 1, v_actor_id, v_actor_id)
      RETURNING * INTO summary;
    ELSE
      IF p_summary_id IS DISTINCT FROM summary.id OR p_expected_version IS DISTINCT FROM summary.version THEN
        RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_VERSION_CONFLICT' USING ERRCODE = '40001';
      END IF;
      IF summary.workflow_state NOT IN ('draft', 'correction_requested', 'rejected') THEN
        RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_STATE_CONFLICT' USING ERRCODE = '40001';
      END IF;
      UPDATE private.rc19_report_external_summaries SET content = btrim(p_content),
        workflow_state = 'draft', version = version + 1, updated_by = v_actor_id,
        updated_at = statement_timestamp(), review_reason = NULL
      WHERE id = summary.id RETURNING * INTO summary;
    END IF;
  ELSE
    IF summary.id IS NULL OR summary.id IS DISTINCT FROM p_summary_id
       OR p_expected_version IS DISTINCT FROM summary.version THEN
      RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF p_action = 'submit' THEN
      IF summary.workflow_state NOT IN ('draft', 'correction_requested') THEN
        RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_STATE_CONFLICT' USING ERRCODE = '40001';
      END IF;
      UPDATE private.rc19_report_external_summaries SET workflow_state = 'submitted', version = version + 1,
        updated_by = v_actor_id, updated_at = statement_timestamp(), submitted_by = v_actor_id,
        submitted_at = statement_timestamp(), reviewed_by = NULL, reviewed_at = NULL, review_reason = NULL
      WHERE id = summary.id RETURNING * INTO summary;
    ELSIF p_action = 'approve' THEN
      IF summary.workflow_state <> 'submitted' THEN
        RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_STATE_CONFLICT' USING ERRCODE = '40001';
      END IF;
      UPDATE private.rc19_report_external_summaries SET workflow_state = 'approved', version = version + 1,
        updated_by = v_actor_id, updated_at = statement_timestamp(), reviewed_by = v_actor_id,
        reviewed_at = statement_timestamp(), review_reason = NULL
      WHERE id = summary.id RETURNING * INTO summary;
    ELSIF p_action = 'reject' THEN
      IF summary.workflow_state <> 'submitted' OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_STATE_CONFLICT' USING ERRCODE = '40001';
      END IF;
      UPDATE private.rc19_report_external_summaries SET workflow_state = 'rejected', version = version + 1,
        updated_by = v_actor_id, updated_at = statement_timestamp(), reviewed_by = v_actor_id,
        reviewed_at = statement_timestamp(), review_reason = btrim(p_reason)
      WHERE id = summary.id RETURNING * INTO summary;
    ELSIF p_action = 'request_correction' THEN
      IF summary.workflow_state NOT IN ('submitted', 'approved') OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'REPORT_EXTERNAL_SUMMARY_STATE_CONFLICT' USING ERRCODE = '40001';
      END IF;
      UPDATE private.rc19_report_external_summaries SET workflow_state = 'correction_requested', version = version + 1,
        updated_by = v_actor_id, updated_at = statement_timestamp(), reviewed_by = v_actor_id,
        reviewed_at = statement_timestamp(), review_reason = btrim(p_reason)
      WHERE id = summary.id RETURNING * INTO summary;
    END IF;
  END IF;

  INSERT INTO private.rc19_report_external_summary_events (
    summary_id, report_id, version, action, content, actor_id, reason
  ) VALUES (summary.id, p_report_id, summary.version, p_action, summary.content, v_actor_id, nullif(btrim(p_reason), ''));

  IF p_action = 'approve' OR (p_action = 'request_correction' AND receipt.response IS NULL
     AND EXISTS (SELECT 1 FROM private.rc19_report_external_summary_events e
       WHERE e.summary_id = summary.id AND e.action = 'approve' AND e.version < summary.version)) THEN
    PERFORM private.record_report_revision(
      p_report_id, v_actor_id, target_report.status, 'save',
      'External operational summary approval state changed',
      private.report_revision_snapshot(target_report), target_report.ocr_review,
      target_report.final_recap, private.report_image_references(p_report_id)
    );
    SELECT revision.id INTO current_revision_id FROM public.report_revisions AS revision
    WHERE revision.report_id = p_report_id ORDER BY revision.version DESC LIMIT 1;
  END IF;

  PERFORM private.log_shift_audit(
    'reports', 'external_summary_' || p_action, 'report', p_report_id,
    nullif(btrim(p_reason), ''), jsonb_build_object(
      'summary_id', summary.id, 'version', summary.version, 'state', summary.workflow_state
    ), ARRAY[target_report.shift_id]::text[]
  );

  response_payload := jsonb_build_object(
    'reportId', p_report_id, 'summaryId', summary.id, 'version', summary.version,
    'workflowState', summary.workflow_state, 'replayed', false,
    'reportRevisionId', current_revision_id
  );
  INSERT INTO private.rc19_report_external_summary_idempotency (
    actor_id, idempotency_key, request_payload, response
  ) VALUES (v_actor_id, p_idempotency_key, request_payload, response_payload);
  RETURN response_payload;
END;
$$;
ALTER FUNCTION public.external_report_summary_workflow_v1(text,text,uuid,text,integer,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.external_report_summary_workflow_v1(text,text,uuid,text,integer,text,uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.external_report_summary_workflow_v1(text,text,uuid,text,integer,text,uuid)
  TO authenticated;

COMMENT ON FUNCTION public.external_report_summary_workflow_v1(text,text,uuid,text,integer,text,uuid) IS
  'Versioned actor-authorized external operational summary workflow. Approval is snapshotted atomically into the next immutable report revision.';

COMMIT;
