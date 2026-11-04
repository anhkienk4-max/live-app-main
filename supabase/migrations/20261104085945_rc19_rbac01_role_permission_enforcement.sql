-- RC19 RBAC-01: deployable, versioned role policy and authenticated decision RPC.
-- Runtime changes stay disabled until the database gate is explicitly enabled.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.rbac_permission_catalog (
  permission text PRIMARY KEY,
  legacy_defaults jsonb NOT NULL CHECK (jsonb_typeof(legacy_defaults) = 'object'),
  hard_restricted boolean NOT NULL DEFAULT false,
  role_override_roles text[] NOT NULL DEFAULT '{}'::text[],
  account_override_roles text[] NOT NULL DEFAULT '{}'::text[],
  account_allow_roles text[] NOT NULL DEFAULT '{}'::text[],
  CHECK (account_allow_roles <@ account_override_roles),
  CHECK (role_override_roles <@ ARRAY['member','leader','admin']::text[]),
  CHECK (account_override_roles <@ ARRAY['member','leader','admin']::text[]),
  CHECK (account_allow_roles <@ ARRAY['member','leader','admin']::text[]),
  CHECK (NOT hard_restricted OR (
    cardinality(role_override_roles) = 0
    AND cardinality(account_override_roles) = 0
    AND cardinality(account_allow_roles) = 0
  ))
);

INSERT INTO private.rbac_permission_catalog
  (permission, legacy_defaults, hard_restricted, role_override_roles, account_override_roles, account_allow_roles)
VALUES
  ('shifts.view_assigned', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('shifts.view_open', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('shifts.register', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('shifts.cancel_registration', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('shifts.approve_registration', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('shifts.assign_staff', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('shifts.edit', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('shifts.delete', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('shifts.lock', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('shifts.import', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('shifts.export', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('reports.submit', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('reports.review', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('reports.export', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('swaps.request', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('swaps.approve', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('swaps.export', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('profile.edit_own', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('staff.manage', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('brands.manage', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('platforms.manage', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('campaigns.manage', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('campaigns.edit_operational', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('settings.member', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('settings.leader', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader','admin'], ARRAY['leader','admin']),
  ('settings.admin', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('permissions.manage', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('audit.view', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('audit.view_team', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader'], ARRAY['leader']),
  ('audit.restore', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('audit.review', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('data.force_delete', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('attendance.record_own', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('storage.upload', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('storage.edit_own', '{"member":true,"leader":true,"admin":true}', false, ARRAY['member','leader','admin'], ARRAY['member','leader','admin'], ARRAY['member','leader','admin']),
  ('storage.delete', '{"member":false,"leader":true,"admin":true}', false, ARRAY['leader','admin'], ARRAY['leader'], '{}'),
  ('storage.resource_manage', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}'),
  ('payroll.view_own', '{"member":true,"leader":true,"admin":true}', true, '{}', '{}', '{}'),
  ('payroll.manage', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}')
ON CONFLICT (permission) DO NOTHING;

CREATE TABLE private.rbac_runtime_gate (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO private.rbac_runtime_gate(id, enabled) VALUES (true, false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE private.rbac01_role_default_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('member','leader','admin')),
  version integer NOT NULL CHECK (version > 0),
  expected_active_version integer NOT NULL CHECK (expected_active_version >= 0),
  expected_active_version_id bigint NULL REFERENCES private.rbac01_role_default_versions(id),
  decisions jsonb NOT NULL CHECK (jsonb_typeof(decisions) = 'object'),
  proposed_by text NOT NULL REFERENCES public.business_users(id),
  proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  UNIQUE (role, version)
);

CREATE TABLE private.rbac01_role_default_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id bigint NOT NULL REFERENCES private.rbac01_role_default_versions(id),
  role text NOT NULL CHECK (role IN ('member','leader','admin')),
  event_type text NOT NULL CHECK (event_type IN ('proposal','approval','activation','revocation','rollback')),
  actor_business_user_id text NOT NULL REFERENCES public.business_users(id),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  effective_at timestamptz NULL,
  resulting_version_id bigint NULL REFERENCES private.rbac01_role_default_versions(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK ((event_type IN ('activation','revocation','rollback')) = (effective_at IS NOT NULL)),
  CHECK (event_type NOT IN ('activation','rollback') OR resulting_version_id IS NOT NULL),
  CHECK (event_type <> 'revocation' OR resulting_version_id IS NULL)
);

CREATE OR REPLACE FUNCTION private.rbac_reject_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'RBAC_HISTORY_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER rbac01_versions_immutable
  BEFORE UPDATE OR DELETE ON private.rbac01_role_default_versions
  FOR EACH ROW EXECUTE FUNCTION private.rbac_reject_immutable_change();
CREATE TRIGGER rbac01_events_immutable
  BEFORE UPDATE OR DELETE ON private.rbac01_role_default_events
  FOR EACH ROW EXECUTE FUNCTION private.rbac_reject_immutable_change();

ALTER TABLE private.rbac_permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac_permission_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE private.rbac_runtime_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac_runtime_gate FORCE ROW LEVEL SECURITY;
ALTER TABLE private.rbac01_role_default_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac01_role_default_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE private.rbac01_role_default_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac01_role_default_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.rbac_permission_catalog, private.rbac_runtime_gate,
  private.rbac01_role_default_versions, private.rbac01_role_default_events
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.rbac01_active_version_id(p_role text, p_at timestamptz)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.resulting_version_id
  FROM private.rbac01_role_default_events e
  WHERE e.role = p_role
    AND e.event_type IN ('activation','revocation','rollback')
    AND e.effective_at <= p_at
  ORDER BY e.effective_at DESC, e.id DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.rbac_permission_decision_for_user(
  p_business_user_id text,
  p_permission text,
  p_at timestamptz DEFAULT statement_timestamp()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user public.business_users%ROWTYPE;
  v_catalog private.rbac_permission_catalog%ROWTYPE;
  v_allowed boolean;
  v_version_id bigint;
  v_decision text;
  v_enabled boolean;
BEGIN
  SELECT * INTO v_user FROM public.business_users u
  WHERE u.id = p_business_user_id AND u.status = 'active' AND u.account_status = 'active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL;
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'RBAC_ACTOR_INACTIVE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_catalog FROM private.rbac_permission_catalog c WHERE c.permission = p_permission;
  IF v_catalog.permission IS NULL THEN
    RAISE EXCEPTION 'RBAC_PERMISSION_UNKNOWN' USING ERRCODE = '22023';
  END IF;
  v_allowed := coalesce((v_catalog.legacy_defaults ->> v_user.system_permission)::boolean, false);
  SELECT g.enabled INTO v_enabled FROM private.rbac_runtime_gate g WHERE g.id = true;
  IF v_catalog.hard_restricted OR NOT coalesce(v_enabled, false) THEN
    RETURN jsonb_build_object(
      'actor_business_user_id', v_user.id, 'role', v_user.system_permission,
      'permission', p_permission, 'allowed', v_allowed,
      'source', CASE WHEN v_catalog.hard_restricted THEN 'hard_restriction' ELSE 'legacy_default' END,
      'reason', CASE WHEN v_catalog.hard_restricted THEN 'This action is fixed by the security baseline.'
                     ELSE 'The dynamic policy gate is disabled; the legacy matrix applies.' END,
      'version', NULL, 'expires_at', NULL, 'effective_at', NULL
    );
  END IF;

  v_version_id := private.rbac01_active_version_id(v_user.system_permission, p_at);
  IF v_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM private.rbac01_role_default_events approval
      JOIN private.rbac01_role_default_versions version ON version.id = approval.version_id
      WHERE approval.version_id = v_version_id AND approval.event_type = 'approval'
        AND approval.actor_business_user_id <> version.proposed_by
    ) THEN
      RETURN jsonb_build_object(
        'actor_business_user_id', v_user.id, 'role', v_user.system_permission,
        'permission', p_permission, 'allowed', false, 'source', 'invalid_version',
        'reason', 'The active role configuration lacks independent approval.',
        'version', v_version_id, 'expires_at', NULL, 'effective_at', NULL
      );
    END IF;
    SELECT version.decisions ->> p_permission INTO v_decision
    FROM private.rbac01_role_default_versions version
    WHERE version.id = v_version_id AND version.role = v_user.system_permission;
    IF v_decision IN ('allow','deny') THEN
      RETURN jsonb_build_object(
        'actor_business_user_id', v_user.id, 'role', v_user.system_permission,
        'permission', p_permission, 'allowed', (v_decision = 'allow'),
        'source', 'role_override',
        'reason', format('Approved role policy v%s applies.', v_version_id),
        'version', v_version_id, 'expires_at', NULL,
        'effective_at', (SELECT e.effective_at FROM private.rbac01_role_default_events e
          WHERE e.event_type IN ('activation','rollback') AND e.resulting_version_id = v_version_id
          ORDER BY e.id DESC LIMIT 1)
      );
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'actor_business_user_id', v_user.id, 'role', v_user.system_permission,
    'permission', p_permission, 'allowed', v_allowed, 'source', 'legacy_default',
    'reason', 'No active role override changes this permission.',
    'version', NULL, 'expires_at', NULL, 'effective_at', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.rbac_has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((private.rbac_permission_decision_for_user(
    private.current_business_user_id(), p_permission
  ) ->> 'allowed')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION public.rbac_permission_decision(p_permission text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC_AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
  RETURN private.rbac_permission_decision_for_user(v_actor, p_permission);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac01_effective_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((public.rbac_permission_decision(p_permission) ->> 'allowed')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION public.rbac01_list_role_defaults()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text; v_result jsonb;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'role', v.role, 'version', v.version,
    'expected_active_version', v.expected_active_version,
    'decisions', v.decisions, 'proposed_by', v.proposed_by,
    'proposed_at', v.proposed_at, 'reason', v.reason,
    'approved_by', approval.actor_business_user_id,
    'approved_at', approval.occurred_at,
    'effective_at', activation.effective_at,
    'status', CASE
      WHEN current_version.id = v.id THEN 'active'
      WHEN rolled.id IS NOT NULL THEN 'rolled_back'
      WHEN revoked.id IS NOT NULL THEN 'revoked'
      WHEN approval.id IS NOT NULL THEN 'approved'
      ELSE 'proposed' END
  ) ORDER BY v.id DESC), '[]'::jsonb)
  INTO v_result
  FROM private.rbac01_role_default_versions v
  LEFT JOIN LATERAL (SELECT e.id,e.actor_business_user_id,e.occurred_at
    FROM private.rbac01_role_default_events e WHERE e.version_id=v.id AND e.event_type='approval'
    ORDER BY e.id DESC LIMIT 1) approval ON true
  LEFT JOIN LATERAL (SELECT e.id,e.effective_at FROM private.rbac01_role_default_events e
    WHERE e.resulting_version_id=v.id AND e.event_type IN ('activation','rollback')
    ORDER BY e.id DESC LIMIT 1) activation ON true
  LEFT JOIN LATERAL (SELECT e.id FROM private.rbac01_role_default_events e
    WHERE e.version_id=v.id AND e.event_type='rollback' ORDER BY e.id DESC LIMIT 1) rolled ON true
  LEFT JOIN LATERAL (SELECT e.id FROM private.rbac01_role_default_events e
    WHERE e.version_id=v.id AND e.event_type='revocation' ORDER BY e.id DESC LIMIT 1) revoked ON true
  LEFT JOIN LATERAL (SELECT active_version.id
    FROM private.rbac01_role_default_versions active_version
    WHERE active_version.id = private.rbac01_active_version_id(v.role, statement_timestamp())) current_version ON true;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac01_propose_role_defaults(
  p_role text, p_decisions jsonb, p_comment text, p_expected_active_version integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor text; v_active_id bigint; v_active_version integer := 0;
  v_next_version integer; v_id bigint; v_decisions jsonb := '{}'::jsonb;
  v_key text; v_value text; v_catalog private.rbac_permission_catalog%ROWTYPE;
  v_legacy_allowed boolean; v_reason text;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('member','leader','admin') OR p_role IS NULL
    OR p_decisions IS NULL OR jsonb_typeof(p_decisions) <> 'object'
    OR length(btrim(coalesce(p_comment,''))) NOT BETWEEN 5 AND 500
    OR p_expected_active_version IS NULL OR p_expected_active_version < 0
    OR (SELECT count(*) FROM jsonb_object_keys(p_decisions)) > 60
  THEN RAISE EXCEPTION 'RBAC01_INPUT_INVALID' USING ERRCODE = '22023'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || p_role, 0));
  v_active_id := private.rbac01_active_version_id(p_role, statement_timestamp());
  IF v_active_id IS NOT NULL THEN
    SELECT version, decisions INTO v_active_version, v_decisions
    FROM private.rbac01_role_default_versions WHERE id = v_active_id;
  END IF;
  IF v_active_version <> p_expected_active_version THEN
    RAISE EXCEPTION 'RBAC01_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next_version
  FROM private.rbac01_role_default_versions WHERE role = p_role;

  FOR v_key, v_value IN SELECT key, value #>> '{}' FROM jsonb_each(p_decisions)
  LOOP
    SELECT * INTO v_catalog FROM private.rbac_permission_catalog WHERE permission = v_key;
    IF v_catalog.permission IS NULL OR v_catalog.hard_restricted
      OR NOT (p_role = ANY(v_catalog.role_override_roles))
      OR v_value IS NULL OR v_value NOT IN ('allow','deny','inherit')
    THEN RAISE EXCEPTION 'RBAC01_PERMISSION_NOT_CONFIGURABLE' USING ERRCODE = '42501'; END IF;
    v_legacy_allowed := coalesce((v_catalog.legacy_defaults ->> p_role)::boolean, false);
    IF v_value IN ('allow','deny') AND NOT v_legacy_allowed THEN
      RAISE EXCEPTION 'RBAC01_ROLE_ESCALATION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF v_value = 'inherit' THEN v_decisions := v_decisions - v_key;
    ELSE v_decisions := jsonb_set(v_decisions, ARRAY[v_key], to_jsonb(v_value), true);
    END IF;
  END LOOP;

  INSERT INTO private.rbac01_role_default_versions(
    role, version, expected_active_version, expected_active_version_id,
    decisions, proposed_by, reason
  ) VALUES (
    p_role, v_next_version, p_expected_active_version, v_active_id,
    v_decisions, v_actor, btrim(p_comment)
  ) RETURNING id INTO v_id;
  INSERT INTO private.rbac01_role_default_events(
    version_id, role, event_type, actor_business_user_id, reason, before_state, after_state
  ) VALUES (
    v_id, p_role, 'proposal', v_actor, btrim(p_comment),
    coalesce((SELECT to_jsonb(v) FROM private.rbac01_role_default_versions v WHERE v.id = v_active_id), '{}'::jsonb),
    jsonb_build_object('version', v_next_version, 'decisions', v_decisions)
  );
  RETURN jsonb_build_object('id',v_id,'role',p_role,'version',v_next_version,'status','proposed','effective',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac01_approve_role_defaults(p_version_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text; v_version private.rbac01_role_default_versions%ROWTYPE;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_version FROM private.rbac01_role_default_versions WHERE id=p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'RBAC01_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_version.proposed_by = v_actor THEN RAISE EXCEPTION 'RBAC01_SELF_APPROVAL_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || v_version.role, 0));
  IF coalesce((SELECT version FROM private.rbac01_role_default_versions
      WHERE id=private.rbac01_active_version_id(v_version.role,statement_timestamp())),0)
       IS DISTINCT FROM v_version.expected_active_version THEN
    RAISE EXCEPTION 'RBAC01_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM private.rbac01_role_default_events e
    WHERE e.version_id=p_version_id AND e.event_type='approval') THEN
    RAISE EXCEPTION 'RBAC01_ALREADY_APPROVED' USING ERRCODE='40001';
  END IF;
  INSERT INTO private.rbac01_role_default_events(
    version_id,role,event_type,actor_business_user_id,reason,before_state,after_state
  ) VALUES (v_version.id,v_version.role,'approval',v_actor,'Independent Admin approval',
    jsonb_build_object('status','proposed'),jsonb_build_object('status','approved','version',v_version.version));
  RETURN jsonb_build_object('id',v_version.id,'role',v_version.role,'version',v_version.version,'status','approved','effective',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac01_activate_role_defaults(
  p_version_id bigint, p_expected_active_version integer, p_effective_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text; v_version private.rbac01_role_default_versions%ROWTYPE; v_effective_at timestamptz;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_version FROM private.rbac01_role_default_versions WHERE id=p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'RBAC01_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || v_version.role, 0));
  IF coalesce((SELECT version FROM private.rbac01_role_default_versions
    WHERE id=private.rbac01_active_version_id(v_version.role,statement_timestamp())),0) <> p_expected_active_version
    OR p_expected_active_version <> v_version.expected_active_version THEN
    RAISE EXCEPTION 'RBAC01_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.rbac01_role_default_events e
    WHERE e.version_id=p_version_id AND e.event_type='approval' AND e.actor_business_user_id<>v_version.proposed_by)
    OR EXISTS (SELECT 1 FROM private.rbac01_role_default_events e
      WHERE e.version_id=p_version_id AND e.event_type IN ('activation','rollback')) THEN
    RAISE EXCEPTION 'RBAC01_APPROVAL_REQUIRED_OR_ALREADY_ACTIVE' USING ERRCODE='42501';
  END IF;
  v_effective_at := coalesce(p_effective_at,clock_timestamp());
  IF v_effective_at < clock_timestamp() OR v_effective_at > clock_timestamp() + interval '30 days' THEN
    RAISE EXCEPTION 'RBAC01_EFFECTIVE_TIME_INVALID' USING ERRCODE='22023';
  END IF;
  INSERT INTO private.rbac01_role_default_events(
    version_id,role,event_type,actor_business_user_id,occurred_at,effective_at,resulting_version_id,
    reason,before_state,after_state
  ) VALUES (v_version.id,v_version.role,'activation',v_actor,clock_timestamp(),v_effective_at,v_version.id,
    'Approved role policy activated',jsonb_build_object('version',p_expected_active_version),
    jsonb_build_object('version',v_version.version,'effective_at',v_effective_at));
  RETURN jsonb_build_object('id',v_version.id,'role',v_version.role,'version',v_version.version,'status','active','effective',v_effective_at<=clock_timestamp(),'effective_at',v_effective_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac01_revoke_role_defaults(
  p_role text, p_expected_active_version integer, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text; v_id bigint; v_version integer;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_role NOT IN ('member','leader','admin') OR p_expected_active_version < 1
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'RBAC01_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || p_role, 0));
  v_id := private.rbac01_active_version_id(p_role,statement_timestamp());
  SELECT version INTO v_version FROM private.rbac01_role_default_versions WHERE id=v_id;
  IF v_version IS DISTINCT FROM p_expected_active_version THEN RAISE EXCEPTION 'RBAC01_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO private.rbac01_role_default_events(
    version_id,role,event_type,actor_business_user_id,effective_at,resulting_version_id,reason,before_state,after_state
  ) VALUES (v_id,p_role,'revocation',v_actor,clock_timestamp(),NULL,btrim(p_reason),
    jsonb_build_object('active_version',v_version),jsonb_build_object('active_version',NULL));
  RETURN jsonb_build_object('role',p_role,'version',v_version,'status','revoked','effective',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac01_rollback_role_defaults(p_version_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text; v_version private.rbac01_role_default_versions%ROWTYPE; v_active_id bigint;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_version FROM private.rbac01_role_default_versions WHERE id=p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'RBAC01_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || v_version.role, 0));
  v_active_id := private.rbac01_active_version_id(v_version.role,statement_timestamp());
  IF v_active_id IS DISTINCT FROM v_version.id THEN RAISE EXCEPTION 'RBAC01_ROLLBACK_NOT_ACTIVE' USING ERRCODE='40001'; END IF;
  INSERT INTO private.rbac01_role_default_events(
    version_id,role,event_type,actor_business_user_id,effective_at,resulting_version_id,reason,before_state,after_state
  ) VALUES (v_version.id,v_version.role,'rollback',v_actor,clock_timestamp(),v_version.expected_active_version_id,
    'Rollback to previous approved role policy',jsonb_build_object('version',v_version.version),
    jsonb_build_object('restored_version_id',v_version.expected_active_version_id));
  RETURN jsonb_build_object('id',v_version.id,'role',v_version.role,'status','rolled_back','effective',true,
    'restored_version_id',v_version.expected_active_version_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.rbac01_audit_logs_policy_preflight()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL
    OR (SELECT count(*) FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND tablename='audit_logs' AND cmd IN ('SELECT','ALL')) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND tablename='audit_logs' AND policyname='audit_logs_read'
        AND permissive='PERMISSIVE' AND cmd='SELECT') THEN
    RAISE EXCEPTION 'RBAC01_UNEXPECTED_AUDIT_SELECT_POLICIES' USING ERRCODE='42501';
  END IF;
END;
$$;
SELECT private.rbac01_audit_logs_policy_preflight();
DROP FUNCTION private.rbac01_audit_logs_policy_preflight();
DROP POLICY audit_logs_read ON public.audit_logs;
CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT TO authenticated USING (
  private.rbac_has_permission('audit.view')
  OR (private.rbac_has_permission('audit.view_team')
    AND module IN ('calendar','live','reports','campaigns','swaps','imports'))
);

REVOKE ALL ON FUNCTION private.rbac01_active_version_id(text,timestamptz),
  private.rbac_permission_decision_for_user(text,text,timestamptz), private.rbac_has_permission(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rbac_has_permission(text) TO authenticated;
REVOKE ALL ON FUNCTION public.rbac_permission_decision(text), public.rbac01_effective_permission(text),
  public.rbac01_list_role_defaults(), public.rbac01_propose_role_defaults(text,jsonb,text,integer),
  public.rbac01_approve_role_defaults(bigint), public.rbac01_activate_role_defaults(bigint,integer,timestamptz),
  public.rbac01_revoke_role_defaults(text,integer,text), public.rbac01_rollback_role_defaults(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_permission_decision(text), public.rbac01_effective_permission(text),
  public.rbac01_list_role_defaults(), public.rbac01_propose_role_defaults(text,jsonb,text,integer),
  public.rbac01_approve_role_defaults(bigint), public.rbac01_activate_role_defaults(bigint,integer,timestamptz),
  public.rbac01_revoke_role_defaults(text,integer,text), public.rbac01_rollback_role_defaults(bigint)
  TO authenticated;

COMMIT;
