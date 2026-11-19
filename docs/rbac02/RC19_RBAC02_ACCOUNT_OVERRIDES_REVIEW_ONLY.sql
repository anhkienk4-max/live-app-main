-- RC19 RBAC-02 #104: account overrides for the single RBAC-01B supported slice.
-- HUMAN REVIEW ONLY. NOT A MIGRATION. NEVER APPLY TO PRODUCTION.
-- Requires RBAC-01 and RBAC-01B review-only SQL on an isolated PostgreSQL 17 DB.
-- Both this database gate and FEATURE_RBAC02_ACCOUNT_OVERRIDES default OFF.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.rbac02_runtime_gate (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO private.rbac02_runtime_gate(id,enabled) VALUES(true,false)
ON CONFLICT(id) DO NOTHING;
ALTER TABLE private.rbac02_runtime_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac02_runtime_gate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.rbac02_runtime_gate FROM PUBLIC,anon,authenticated;

-- Append-only history. The latest version is authoritative; RESET and expiry
-- return to role defaults and never revive an older account decision.
CREATE TABLE IF NOT EXISTS private.rbac02_account_permission_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_user_id text NOT NULL REFERENCES public.business_users(id),
  permission text NOT NULL CHECK (permission='audit.view_team'),
  decision text NOT NULL CHECK (decision IN ('allow','deny','reset')),
  version integer NOT NULL CHECK (version>0),
  changed_by text NOT NULL REFERENCES public.business_users(id),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(business_user_id,permission,version),
  CHECK (decision<>'reset' OR expires_at IS NULL),
  CHECK (expires_at IS NULL OR expires_at>changed_at)
);
ALTER TABLE private.rbac02_account_permission_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac02_account_permission_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.rbac02_account_permission_versions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.rbac02_account_permission_versions_id_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.rbac02_reject_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'RBAC02_HISTORY_IMMUTABLE' USING ERRCODE='42501';
END;
$fn$;
REVOKE ALL ON FUNCTION private.rbac02_reject_history_mutation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS rbac02_account_permission_history_immutable
  ON private.rbac02_account_permission_versions;
CREATE TRIGGER rbac02_account_permission_history_immutable
  BEFORE UPDATE OR DELETE ON private.rbac02_account_permission_versions
  FOR EACH ROW EXECUTE FUNCTION private.rbac02_reject_history_mutation();

CREATE OR REPLACE FUNCTION private.rbac02_role_baseline_allows(p_business_user_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_role text; v_version record; v_decision text; v_audit_ok boolean;
BEGIN
  SELECT u.system_permission INTO v_role FROM public.business_users u
  WHERE u.id=p_business_user_id AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL;
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role='admin' THEN RETURN true; END IF;
  IF v_role<>'leader' THEN RETURN false; END IF;
  FOR v_version IN
    SELECT v.id,v.role,v.version,v.decisions,v.proposed_by,v.proposed_at,v.approved_by,v.approved_at
    FROM private.rbac01_role_default_versions v
    WHERE v.role='leader' AND v.status='approved'
    ORDER BY v.version DESC
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM private.rbac01_audit_events a
      WHERE a.version_id=v_version.id AND a.role=v_version.role
        AND a.action='approve' AND a.actor_business_user_id=v_version.approved_by
        AND a.after_state->>'status'='approved'
        AND a.after_state->>'version'=v_version.version::text
        AND a.at>=v_version.proposed_at AND a.at<=v_version.approved_at+interval '1 second'
    ) INTO v_audit_ok;
    IF NOT coalesce(v_audit_ok,false)
      OR nullif(btrim(v_version.proposed_by),'') IS NULL
      OR nullif(btrim(v_version.approved_by),'') IS NULL
      OR v_version.proposed_by=v_version.approved_by
      OR v_version.approved_at IS NULL OR v_version.approved_at<v_version.proposed_at
      OR v_version.approved_at>clock_timestamp()
      OR v_version.decisions IS NULL OR jsonb_typeof(v_version.decisions) IS DISTINCT FROM 'object'
    THEN RETURN false; END IF;
    IF v_version.decisions ? 'audit.view_team' THEN
      v_decision:=v_version.decisions->>'audit.view_team';
      IF v_decision='deny' THEN RETURN false; END IF;
      IF v_decision='inherit' THEN RETURN true; END IF;
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION private.rbac02_role_baseline_allows(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.rbac02_effective_for_business_user(
  p_business_user_id text,p_permission text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_role text; v_gate boolean:=false; v_baseline boolean; v_override record;
BEGIN
  IF p_permission IS DISTINCT FROM 'audit.view_team' THEN RETURN false; END IF;
  SELECT u.system_permission INTO v_role FROM public.business_users u
  WHERE u.id=p_business_user_id AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL;
  IF v_role IS NULL THEN RETURN false; END IF;
  -- Existing Admin permission and Member denial remain immutable.
  IF v_role='admin' THEN RETURN true; END IF;
  IF v_role<>'leader' THEN RETURN false; END IF;
  v_baseline:=private.rbac02_role_baseline_allows(p_business_user_id);
  IF NOT v_baseline THEN RETURN false; END IF;
  SELECT g.enabled INTO v_gate FROM private.rbac02_runtime_gate g WHERE g.id=true;
  IF NOT coalesce(v_gate,false) THEN RETURN v_baseline; END IF;
  SELECT o.decision,o.expires_at INTO v_override
  FROM private.rbac02_account_permission_versions o
  WHERE o.business_user_id=p_business_user_id AND o.permission=p_permission
  ORDER BY o.version DESC LIMIT 1;
  IF NOT FOUND OR v_override.decision='reset'
    OR (v_override.expires_at IS NOT NULL AND v_override.expires_at<=clock_timestamp())
  THEN RETURN v_baseline; END IF;
  IF v_override.decision='deny' THEN RETURN false; END IF;
  -- ALLOW restores only a role-baseline grant; it cannot escalate a role.
  RETURN v_override.decision='allow' AND v_baseline;
END;
$fn$;
REVOKE ALL ON FUNCTION private.rbac02_effective_for_business_user(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.rbac01b_audit_team_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT coalesce(private.rbac02_effective_for_business_user(private.current_business_user_id(),'audit.view_team'),false)
$fn$;
REVOKE ALL ON FUNCTION private.rbac01b_audit_team_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.rbac01b_audit_team_allowed() TO authenticated;

CREATE OR REPLACE FUNCTION public.rbac02_list_account_overrides()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_actor text; v_result jsonb;
BEGIN
  SELECT u.id INTO v_actor FROM public.business_users u
  WHERE u.auth_user_id=auth.uid() AND u.system_permission='admin'
    AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC02_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.rbac02_runtime_gate g WHERE g.id=true AND g.enabled=true) THEN
    RAISE EXCEPTION 'RBAC02_DISABLED' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'target_id',u.id,'permission','audit.view_team',
    'decision',latest.decision,'version',coalesce(latest.version,0),
    'reason',latest.reason,'expires_at',latest.expires_at,'changed_by',latest.changed_by,
    'changed_at',latest.changed_at,
    'effective',private.rbac02_effective_for_business_user(u.id,'audit.view_team'),
    'source',CASE WHEN latest.decision IN ('allow','deny','reset')
      AND (latest.expires_at IS NULL OR latest.expires_at>clock_timestamp())
      AND latest.decision<>'reset' THEN 'account_override' ELSE 'role_default' END,
    'history',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'decision',h.decision,'version',h.version,'reason',h.reason,'expires_at',h.expires_at,
      'changed_by',h.changed_by,'changed_at',h.changed_at
    ) ORDER BY h.version DESC) FROM private.rbac02_account_permission_versions h
      WHERE h.business_user_id=u.id AND h.permission='audit.view_team'),'[]'::jsonb)
  ) ORDER BY u.id),'[]'::jsonb) INTO v_result
  FROM public.business_users u
  LEFT JOIN LATERAL (
    SELECT o.decision,o.version,o.reason,o.expires_at,o.changed_by,o.changed_at
    FROM private.rbac02_account_permission_versions o
    WHERE o.business_user_id=u.id AND o.permission='audit.view_team'
    ORDER BY o.version DESC LIMIT 1
  ) latest ON true
  WHERE u.system_permission='leader' AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL AND u.id<>v_actor;
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rbac02_set_account_override(
  p_target_business_user_id text,p_permission text,p_decision text,
  p_reason text,p_expires_at timestamptz,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_actor text; v_role text; v_version integer; v_before jsonb; v_id bigint;
BEGIN
  SELECT u.id INTO v_actor FROM public.business_users u
  WHERE u.auth_user_id=auth.uid() AND u.system_permission='admin'
    AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR UPDATE;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC02_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.rbac02_runtime_gate g WHERE g.id=true AND g.enabled=true) THEN
    RAISE EXCEPTION 'RBAC02_DISABLED' USING ERRCODE='42501';
  END IF;
  IF p_target_business_user_id IS NULL OR p_target_business_user_id=v_actor
    OR p_permission IS DISTINCT FROM 'audit.view_team'
    OR (p_decision IS DISTINCT FROM 'allow' AND p_decision IS DISTINCT FROM 'deny')
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
    OR p_expected_version IS NULL OR p_expected_version<0
    OR (p_expires_at IS NOT NULL AND
      (p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '365 days'))
  THEN RAISE EXCEPTION 'RBAC02_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'rbac02:'||p_target_business_user_id||':audit.view_team',0));
  SELECT u.system_permission INTO v_role FROM public.business_users u
  WHERE u.id=p_target_business_user_id AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR UPDATE;
  IF v_role IS DISTINCT FROM 'leader' THEN
    RAISE EXCEPTION 'RBAC02_TARGET_NOT_SUPPORTED' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(max(o.version),0) INTO v_version
  FROM private.rbac02_account_permission_versions o
  WHERE o.business_user_id=p_target_business_user_id AND o.permission=p_permission;
  IF v_version<>p_expected_version THEN RAISE EXCEPTION 'RBAC02_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF p_decision='allow' AND NOT private.rbac02_role_baseline_allows(p_target_business_user_id) THEN
    RAISE EXCEPTION 'RBAC02_HARD_BOUNDARY_DENY' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(o) INTO v_before FROM private.rbac02_account_permission_versions o
  WHERE o.business_user_id=p_target_business_user_id AND o.permission=p_permission
  ORDER BY o.version DESC LIMIT 1;
  INSERT INTO private.rbac02_account_permission_versions(
    business_user_id,permission,decision,version,changed_by,expires_at,reason,before_state,after_state
  ) VALUES (
    p_target_business_user_id,p_permission,p_decision,v_version+1,v_actor,p_expires_at,btrim(p_reason),
    coalesce(v_before,'{}'::jsonb),jsonb_build_object('decision',p_decision,'version',v_version+1,'expires_at',p_expires_at)
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'target_id',p_target_business_user_id,
    'permission',p_permission,'decision',p_decision,'version',v_version+1,
    'effective',private.rbac02_effective_for_business_user(p_target_business_user_id,p_permission));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rbac02_reset_account_override(
  p_target_business_user_id text,p_permission text,p_reason text,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_actor text; v_role text; v_version integer; v_before jsonb; v_id bigint;
BEGIN
  SELECT u.id INTO v_actor FROM public.business_users u
  WHERE u.auth_user_id=auth.uid() AND u.system_permission='admin'
    AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR UPDATE;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC02_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.rbac02_runtime_gate g WHERE g.id=true AND g.enabled=true) THEN
    RAISE EXCEPTION 'RBAC02_DISABLED' USING ERRCODE='42501';
  END IF;
  IF p_target_business_user_id IS NULL OR p_target_business_user_id=v_actor
    OR p_permission IS DISTINCT FROM 'audit.view_team'
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
    OR p_expected_version IS NULL OR p_expected_version<0
  THEN RAISE EXCEPTION 'RBAC02_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'rbac02:'||p_target_business_user_id||':audit.view_team',0));
  SELECT u.system_permission INTO v_role FROM public.business_users u
  WHERE u.id=p_target_business_user_id AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR UPDATE;
  IF v_role IS DISTINCT FROM 'leader' THEN
    RAISE EXCEPTION 'RBAC02_TARGET_NOT_SUPPORTED' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(max(o.version),0) INTO v_version
  FROM private.rbac02_account_permission_versions o
  WHERE o.business_user_id=p_target_business_user_id AND o.permission=p_permission;
  IF v_version<>p_expected_version THEN RAISE EXCEPTION 'RBAC02_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  SELECT to_jsonb(o) INTO v_before FROM private.rbac02_account_permission_versions o
  WHERE o.business_user_id=p_target_business_user_id AND o.permission=p_permission
  ORDER BY o.version DESC LIMIT 1;
  INSERT INTO private.rbac02_account_permission_versions(
    business_user_id,permission,decision,version,changed_by,reason,before_state,after_state
  ) VALUES (p_target_business_user_id,p_permission,'reset',v_version+1,v_actor,btrim(p_reason),
    coalesce(v_before,'{}'::jsonb),jsonb_build_object('decision','reset','version',v_version+1))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'target_id',p_target_business_user_id,
    'permission',p_permission,'decision','reset','version',v_version+1,
    'effective',private.rbac02_effective_for_business_user(p_target_business_user_id,p_permission));
END;
$fn$;

REVOKE ALL ON FUNCTION public.rbac02_list_account_overrides() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rbac02_set_account_override(text,text,text,text,timestamptz,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rbac02_reset_account_override(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rbac02_list_account_overrides() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac02_set_account_override(text,text,text,text,timestamptz,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac02_reset_account_override(text,text,text,integer) TO authenticated;

DO $owner_attestation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
    WHERE c.oid='private.rbac02_account_permission_versions'::regclass AND (r.rolbypassrls OR r.rolsuper)
  ) THEN RAISE EXCEPTION 'RBAC02_UNSAFE_DEFINER_OWNER' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_roles r ON r.oid=f.proowner
    WHERE f.oid='public.rbac02_set_account_override(text,text,text,text,timestamptz,integer)'::regprocedure
      AND f.prosecdef AND (r.rolbypassrls OR r.rolsuper)
  ) THEN RAISE EXCEPTION 'RBAC02_UNSAFE_SET_FUNCTION' USING ERRCODE='42501'; END IF;
END;
$owner_attestation$;
COMMIT;
