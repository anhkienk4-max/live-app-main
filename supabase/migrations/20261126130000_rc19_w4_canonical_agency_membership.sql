-- RC19 W4: canonical Agency membership foundation and fail-closed write checks.
-- This migration contains no HR backfill and does not infer Agency from agency_code.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.business_users') IS NULL
     OR to_regclass('public.shifts') IS NULL
     OR to_regclass('public.shift_registrations') IS NULL
     OR to_regclass('public.shift_operational_notes') IS NULL
     OR to_regclass('private.rc19_staff_incidents') IS NULL
     OR to_regprocedure('private.current_business_user_id()') IS NULL
     OR to_regprocedure('private.current_business_user_is_active()') IS NULL
     OR to_regprocedure('private.current_system_permission()') IS NULL THEN
    RAISE EXCEPTION 'RC19_AGENCY_MEMBERSHIP_DEPENDENCIES_MISSING';
  END IF;
END;
$dependencies$;

CREATE TABLE private.rc19_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL CHECK (length(btrim(source_system)) BETWEEN 1 AND 100),
  authoritative_key text NOT NULL CHECK (length(btrim(authoritative_key)) BETWEEN 1 AND 200),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 300),
  is_active boolean NOT NULL DEFAULT true,
  source_version text NOT NULL CHECK (length(btrim(source_version)) BETWEEN 1 AND 200),
  source_snapshot_sha256 text NOT NULL CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (source_system, authoritative_key)
);
ALTER TABLE private.rc19_agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_agencies OWNER TO postgres;
REVOKE ALL ON private.rc19_agencies FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.rc19_business_user_agency_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_user_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  agency_id uuid NOT NULL REFERENCES private.rc19_agencies(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  revoked_at timestamptz,
  source_system text NOT NULL CHECK (length(btrim(source_system)) BETWEEN 1 AND 100),
  source_user_key text NOT NULL CHECK (length(btrim(source_user_key)) BETWEEN 1 AND 200),
  source_agency_key text NOT NULL CHECK (length(btrim(source_agency_key)) BETWEEN 1 AND 200),
  source_record_key text NOT NULL CHECK (length(btrim(source_record_key)) BETWEEN 1 AND 250),
  source_version text NOT NULL CHECK (length(btrim(source_version)) BETWEEN 1 AND 200),
  source_snapshot_sha256 text NOT NULL CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  UNIQUE (source_system, source_record_key, source_version)
);
CREATE INDEX rc19_agency_membership_effective_idx
  ON private.rc19_business_user_agency_memberships(business_user_id, agency_id, effective_from DESC);
CREATE INDEX rc19_agency_membership_source_idx
  ON private.rc19_business_user_agency_memberships(source_system, source_user_key, source_agency_key);
ALTER TABLE private.rc19_business_user_agency_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_business_user_agency_memberships OWNER TO postgres;
REVOKE ALL ON private.rc19_business_user_agency_memberships FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.rc19_agency_membership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES private.rc19_business_user_agency_memberships(id) ON DELETE RESTRICT,
  membership_version integer NOT NULL CHECK (membership_version > 0),
  action text NOT NULL CHECK (action IN ('created', 'updated', 'revoked')),
  actor_business_user_id text REFERENCES public.business_users(id) ON DELETE RESTRICT,
  source_system text NOT NULL,
  source_record_key text NOT NULL,
  source_version text NOT NULL,
  source_snapshot_sha256 text NOT NULL CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  before_state jsonb,
  after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (membership_id, membership_version)
);
CREATE INDEX rc19_agency_membership_events_lookup_idx
  ON private.rc19_agency_membership_events(membership_id, membership_version DESC);
ALTER TABLE private.rc19_agency_membership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_agency_membership_events OWNER TO postgres;
REVOKE ALL ON private.rc19_agency_membership_events FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.shifts
  ADD COLUMN authoritative_agency_id uuid REFERENCES private.rc19_agencies(id) ON DELETE RESTRICT;
CREATE INDEX shifts_authoritative_agency_idx
  ON public.shifts(authoritative_agency_id, id)
  WHERE authoritative_agency_id IS NOT NULL;
COMMENT ON COLUMN public.shifts.authoritative_agency_id IS
  'Canonical HR Agency scope. Never inferred from agency_code, import source, attendance, staffing, or payroll history.';

CREATE FUNCTION private.rc19_has_active_agency_membership(
  p_business_user_id text,
  p_agency_id uuid,
  p_at timestamptz DEFAULT statement_timestamp()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_business_user_id IS NOT NULL AND p_agency_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM private.rc19_business_user_agency_memberships AS membership
    JOIN private.rc19_agencies AS agency ON agency.id = membership.agency_id
    JOIN public.business_users AS business_user ON business_user.id = membership.business_user_id
    WHERE membership.business_user_id = p_business_user_id
      AND membership.agency_id = p_agency_id
      AND membership.status = 'active'
      AND membership.effective_from <= p_at
      AND (membership.effective_until IS NULL OR p_at < membership.effective_until)
      AND agency.is_active
      AND business_user.status = 'active'
      AND business_user.account_status = 'active'
      AND business_user.deleted_at IS NULL
      AND business_user.archived_at IS NULL
  );
$$;
ALTER FUNCTION private.rc19_has_active_agency_membership(text, uuid, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_has_active_agency_membership(text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.rc19_actor_has_shift_agency_scope(
  p_business_user_id text,
  p_shift_id text,
  p_at timestamptz DEFAULT statement_timestamp()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shifts AS shift
    WHERE shift.id = p_shift_id
      AND private.rc19_has_active_agency_membership(
        p_business_user_id, shift.authoritative_agency_id, p_at
      )
  );
$$;
ALTER FUNCTION private.rc19_actor_has_shift_agency_scope(text, text, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_actor_has_shift_agency_scope(text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.rc19_record_agency_membership_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  membership_row private.rc19_business_user_agency_memberships%ROWTYPE;
  prior_state jsonb;
  action_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RC19_AGENCY_MEMBERSHIP_HISTORY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  membership_row := NEW;
  IF TG_OP = 'INSERT' THEN
    action_name := 'created';
  ELSE
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'RC19_AGENCY_MEMBERSHIP_VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    prior_state := to_jsonb(OLD);
    action_name := CASE WHEN NEW.status = 'revoked' AND OLD.status <> 'revoked' THEN 'revoked' ELSE 'updated' END;
  END IF;
  INSERT INTO private.rc19_agency_membership_events (
    membership_id, membership_version, action, actor_business_user_id,
    source_system, source_record_key, source_version, source_snapshot_sha256,
    before_state, after_state
  ) VALUES (
    membership_row.id, membership_row.version, action_name,
    private.current_business_user_id(), membership_row.source_system,
    membership_row.source_record_key, membership_row.source_version,
    membership_row.source_snapshot_sha256, prior_state, to_jsonb(membership_row)
  );
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.rc19_record_agency_membership_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_record_agency_membership_event() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rc19_agency_membership_append_event
  AFTER INSERT OR UPDATE OR DELETE ON private.rc19_business_user_agency_memberships
  FOR EACH ROW EXECUTE FUNCTION private.rc19_record_agency_membership_event();

CREATE FUNCTION private.rc19_reject_agency_membership_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'RC19_AGENCY_MEMBERSHIP_EVENT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
ALTER FUNCTION private.rc19_reject_agency_membership_event_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_reject_agency_membership_event_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rc19_agency_membership_events_immutable
  BEFORE UPDATE OR DELETE ON private.rc19_agency_membership_events
  FOR EACH ROW EXECUTE FUNCTION private.rc19_reject_agency_membership_event_mutation();

CREATE FUNCTION private.rc19_prevent_overlapping_agency_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_user_id || ':' || NEW.agency_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM private.rc19_business_user_agency_memberships AS existing
    WHERE existing.business_user_id = NEW.business_user_id
      AND existing.agency_id = NEW.agency_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND tstzrange(existing.effective_from, coalesce(existing.effective_until, 'infinity'::timestamptz), '[)')
          && tstzrange(NEW.effective_from, coalesce(NEW.effective_until, 'infinity'::timestamptz), '[)')
  ) THEN
    RAISE EXCEPTION 'RC19_AGENCY_MEMBERSHIP_INTERVAL_OVERLAP' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.rc19_prevent_overlapping_agency_membership() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_prevent_overlapping_agency_membership() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rc19_agency_membership_no_overlap
  BEFORE INSERT OR UPDATE OF business_user_id, agency_id, effective_from, effective_until
  ON private.rc19_business_user_agency_memberships
  FOR EACH ROW EXECUTE FUNCTION private.rc19_prevent_overlapping_agency_membership();

CREATE FUNCTION private.rc19_enforce_shift_agency_write_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_permission text := private.current_system_permission();
  target_shift_id text;
  target_at timestamptz := statement_timestamp();
  target_agency_id uuid;
  target_user_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_shift_id := OLD.shift_id;
  ELSE
    target_shift_id := NEW.shift_id;
  END IF;
  IF actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'RC19_AGENCY_ACTOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT shift.authoritative_agency_id INTO target_agency_id
  FROM public.shifts AS shift WHERE shift.id = target_shift_id;
  IF target_agency_id IS NULL THEN
    RAISE EXCEPTION 'RC19_AGENCY_SCOPE_UNRESOLVED' USING ERRCODE = '42501';
  END IF;
  IF actor_permission <> 'admin' AND NOT private.rc19_has_active_agency_membership(actor_id, target_agency_id, target_at) THEN
    RAISE EXCEPTION 'RC19_AGENCY_ACTOR_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'shift_registrations' AND TG_OP <> 'DELETE' THEN
    target_user_id := NEW.user_id;
    IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      IF NOT private.rc19_has_active_agency_membership(target_user_id, target_agency_id, target_at) THEN
        RAISE EXCEPTION 'RC19_AGENCY_CANDIDATE_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'shift_operational_notes' AND TG_OP <> 'DELETE' THEN
    target_user_id := NEW.affected_user_id;
    IF target_user_id IS NOT NULL AND NOT private.rc19_has_active_agency_membership(target_user_id, target_agency_id, target_at) THEN
      RAISE EXCEPTION 'RC19_AGENCY_SUBJECT_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'rc19_staff_incidents' AND TG_OP <> 'DELETE' THEN
    target_at := coalesce(NEW.effective_at, statement_timestamp());
    IF NOT private.rc19_has_active_agency_membership(NEW.original_staff_id, target_agency_id, target_at) THEN
      RAISE EXCEPTION 'RC19_AGENCY_ORIGINAL_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF NEW.replacement_staff_id IS NOT NULL AND NOT private.rc19_has_active_agency_membership(NEW.replacement_staff_id, target_agency_id, target_at) THEN
      RAISE EXCEPTION 'RC19_AGENCY_CANDIDATE_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.rc19_enforce_shift_agency_write_scope() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_enforce_shift_agency_write_scope() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER rc19_shift_registrations_agency_scope
  BEFORE INSERT OR UPDATE OR DELETE ON public.shift_registrations
  FOR EACH ROW EXECUTE FUNCTION private.rc19_enforce_shift_agency_write_scope();
CREATE TRIGGER rc19_shift_operational_notes_agency_scope
  BEFORE INSERT OR UPDATE OR DELETE ON public.shift_operational_notes
  FOR EACH ROW EXECUTE FUNCTION private.rc19_enforce_shift_agency_write_scope();
CREATE TRIGGER rc19_staff_incidents_agency_scope
  BEFORE INSERT OR UPDATE OR DELETE ON private.rc19_staff_incidents
  FOR EACH ROW EXECUTE FUNCTION private.rc19_enforce_shift_agency_write_scope();

COMMENT ON TABLE private.rc19_business_user_agency_memberships IS
  'Canonical HR-sourced actor-to-Agency membership history. No rows are inferred or backfilled by this migration.';
COMMENT ON TABLE private.rc19_agency_membership_events IS
  'Append-only before/after audit history for HR-authoritative Agency membership updates.';
COMMENT ON FUNCTION private.rc19_actor_has_shift_agency_scope(text,text,timestamptz) IS
  'Fail-closed actor/shift Agency predicate; null shift Agency mapping or absent/expired membership returns false.';

COMMIT;
