-- Delta D foundation only: no client access or automatic historical backfill.
-- A later reviewed transaction facade must validate scope and populate these rows.
BEGIN;

CREATE TABLE private.rc19_staff_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id text NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  staffing_segment_id text REFERENCES public.shift_staffing_segments(id) ON DELETE RESTRICT,
  original_registration_id text NOT NULL REFERENCES public.shift_registrations(id) ON DELETE RESTRICT,
  original_staff_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  replacement_registration_id text REFERENCES public.shift_registrations(id) ON DELETE RESTRICT,
  replacement_staff_id text REFERENCES public.business_users(id) ON DELETE RESTRICT,
  replacement_receipt_id uuid UNIQUE REFERENCES public.rc19_shift_assignment_replacements(id) ON DELETE RESTRICT,
  operational_role text NOT NULL CHECK (operational_role IN ('host', 'support', 'technical')),
  business_date date NOT NULL,
  incident_type text NOT NULL CHECK (incident_type IN ('skip', 'absent', 'authorized_absence', 'late', 'early_leave', 'approved_pass', 'approved_swap', 'planned_reassignment', 'other')),
  review_state text NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'confirmed', 'rejected', 'corrected')),
  effective_at timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  evidence_reference_id text,
  verified_late_minutes integer CHECK (verified_late_minutes IS NULL OR verified_late_minutes >= 0),
  created_by text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK ((replacement_registration_id IS NULL) = (replacement_staff_id IS NULL))
);

CREATE INDEX rc19_staff_incidents_subject_date_idx
  ON private.rc19_staff_incidents (original_staff_id, business_date DESC, id);
CREATE INDEX rc19_staff_incidents_shift_idx
  ON private.rc19_staff_incidents (shift_id, staffing_segment_id, id);
ALTER TABLE private.rc19_staff_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rc19_staff_incidents FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.rc19_staff_incidents IS
  'Delta D private incident foundation; writes require a separately reviewed authorized transaction facade.';
COMMIT;
