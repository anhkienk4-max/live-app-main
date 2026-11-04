-- RC19 RBAC-01B #103: one isolated slice ONLY: Leader audit.view_team DENY.
-- HUMAN REVIEW ONLY. NOT A VERSIONED MIGRATION. NEVER APPLY TO PRODUCTION.
-- Precondition: docs/rbac01/RC19_RBAC01_REVIEW_ONLY.sql installed in a disposable PG17 DB.
-- Original read RLS is preserved exactly for all actors when no approved version exists.
-- Approval interface remains intentionally blocked by RBAC-01 parent.
BEGIN;

CREATE OR REPLACE FUNCTION private.rbac01b_audit_team_allowed()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_role text;
  v_version record;
  v_decision text;
  v_audit_ok boolean;
BEGIN
  SELECT u.system_permission INTO v_role
  FROM public.business_users u
  WHERE u.auth_user_id = auth.uid()
    AND u.status = 'active' AND u.account_status = 'active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL;
  IF v_role IS NULL THEN RETURN false; END IF;
  -- Existing Admin permission and scope are immutable; Member gets no new rights.
  IF v_role = 'admin' THEN RETURN true; END IF;
  IF v_role <> 'leader' THEN RETURN false; END IF;
  -- DELTA SEMANTICS: every approved version carries only changed keys.
  -- Missing audit.view_team in a newer delta must NOT silently erase an older DENY.
  -- Unverifiable provenance or invalid payload fails closed before any grant.
  FOR v_version IN
    SELECT v.id,v.role,v.version,v.decisions,v.proposed_by,v.proposed_at,
           v.approved_by,v.approved_at
    FROM private.rbac01_role_default_versions v
    WHERE v.role = 'leader' AND v.status = 'approved'
    ORDER BY v.version DESC
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM private.rbac01_audit_events a
      WHERE a.version_id = v_version.id AND a.role = v_version.role
        AND a.action = 'approve' AND a.actor_business_user_id = v_version.approved_by
        AND a.after_state->>'status' = 'approved'
        AND a.after_state->>'version' = v_version.version::text
        AND a.at >= v_version.proposed_at
        AND a.at <= v_version.approved_at + interval '1 second'
    ) INTO v_audit_ok;
    IF NOT coalesce(v_audit_ok,false)
      OR nullif(btrim(v_version.proposed_by),'') IS NULL
      OR nullif(btrim(v_version.approved_by),'') IS NULL
      OR v_version.proposed_by = v_version.approved_by
      OR v_version.approved_at IS NULL
      OR v_version.approved_at < v_version.proposed_at
      OR v_version.approved_at > clock_timestamp()
      OR v_version.decisions IS NULL
      OR jsonb_typeof(v_version.decisions) IS DISTINCT FROM 'object'
    THEN RETURN false; END IF;
    -- Older DENY remains binding when the newest approved delta concerns
    -- another permission or contains no key for this slice.
    IF v_version.decisions ? 'audit.view_team' THEN
      v_decision := v_version.decisions->>'audit.view_team';
      IF v_decision = 'deny' THEN RETURN false; END IF;
      IF v_decision = 'inherit' THEN RETURN true; END IF;
      -- allow, null, garbage or a non-string value MUST NEVER grant.
      RETURN false;
    END IF;
  END LOOP;
  -- No approved explicit decision for this permission: exact legacy fallback.
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION private.rbac01b_audit_team_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rbac01b_audit_team_allowed() TO authenticated;

CREATE OR REPLACE FUNCTION public.rbac01_effective_permission(p_permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  -- Strict, nonextensible permission allowlist. NO client role/actor input.
  IF p_permission IS DISTINCT FROM 'audit.view_team' THEN
    RAISE EXCEPTION 'RBAC01B_PERMISSION_UNSUPPORTED' USING ERRCODE='42501';
  END IF;
  RETURN private.rbac01b_audit_team_allowed();
END;
$fn$;
REVOKE ALL ON FUNCTION public.rbac01_effective_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac01_effective_permission(text) TO authenticated;

-- SECURITY DEFINER OWNER ATTESTATION: forced-RLS private tables are only readable
-- by a properly privileged function owner. A migration under an arbitrary role
-- must STOP rather than silently inheriting unsafe behavior.
DO $owner_attestation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc f
    JOIN pg_catalog.pg_roles r ON r.oid=f.proowner
    WHERE f.oid='private.rbac01b_audit_team_allowed()'::regprocedure
      AND f.prosecdef
      AND (r.rolbypassrls OR r.rolsuper)
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc f
    WHERE f.oid='public.rbac01_effective_permission(text)'::regprocedure
      AND f.prosecdef
  )
  THEN RAISE EXCEPTION 'RBAC01B_UNSAFE_SECURITY_DEFINER_OWNER' USING ERRCODE='42501'; END IF;
END;
$owner_attestation$;

-- This patch assumes precisely the single known permissive SELECT policy.
-- Fail instead of silently letting a second permissive SELECT policy bypass DENY.
DO $preflight$
DECLARE v_owner oid;
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND tablename='audit_logs'
        AND cmd IN ('SELECT','ALL')) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname='public' AND tablename='audit_logs'
         AND policyname='audit_logs_read' AND permissive='PERMISSIVE'
         AND cmd='SELECT'
     )
  THEN RAISE EXCEPTION 'RBAC01B_UNEXPECTED_AUDIT_SELECT_POLICIES' USING ERRCODE='42501'; END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
          WHERE c.oid='public.audit_logs'::regclass)
     OR NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity
          FROM pg_catalog.pg_class c
          WHERE c.oid='private.rbac01_role_default_versions'::regclass)
  THEN RAISE EXCEPTION 'RBAC01B_RLS_PRECONDITION_FAILED' USING ERRCODE='42501'; END IF;
  SELECT c.relowner INTO v_owner
    FROM pg_catalog.pg_class c WHERE c.oid='private.rbac01_role_default_versions'::regclass;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.oid = v_owner AND (r.rolbypassrls OR r.rolsuper)
  ) THEN RAISE EXCEPTION 'RBAC01B_PRIVATE_OWNER_CANNOT_READ_FORCED_RLS' USING ERRCODE='42501'; END IF;
END;
$preflight$;

-- Exact legacy SELECT scope preserved; one additional restrictive leader predicate.
DROP POLICY IF EXISTS audit_logs_read ON public.audit_logs;
CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT TO authenticated
USING (
  (SELECT private.current_system_permission()) = 'admin'
  OR (
    (SELECT private.current_system_permission()) = 'leader'
    AND module = ANY(ARRAY['calendar','live','reports','campaigns','swaps','imports']::text[])
    AND (SELECT private.rbac01b_audit_team_allowed())
  )
);

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND tablename='audit_logs'
        AND cmd IN ('SELECT','ALL')) <> 1
  THEN RAISE EXCEPTION 'RBAC01B_SELECT_POLICY_BYPASS' USING ERRCODE='42501'; END IF;
END;
$postflight$;

-- SECURITY INVOKER RPC: original shape, filters and pagination unchanged.
-- Explicit revoked-Leader guard ensures direct RPC is denied (not only empty data).
CREATE OR REPLACE FUNCTION public.get_audit_actor_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = ''
AS $fn$
DECLARE result jsonb;
BEGIN
  IF private.current_business_user_id() IS NULL OR private.is_leader_or_admin() IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF private.current_system_permission() = 'leader' AND private.rbac01b_audit_team_allowed() IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF p_page IS NULL OR p_page<1 OR p_page>100000 OR p_page_size IS NULL
    OR p_page_size NOT IN (10,20,50) THEN
    RAISE EXCEPTION 'LIST_QUERY_INVALID' USING ERRCODE='22023'; END IF;
  WITH actors AS MATERIALIZED (
    SELECT actor_business_user_id id, MAX(COALESCE(actor_name,actor_business_user_id)) name
    FROM public.audit_logs WHERE actor_business_user_id IS NOT NULL GROUP BY actor_business_user_id
  ), selected AS (
    SELECT * FROM actors ORDER BY name,id LIMIT p_page_size OFFSET (p_page-1)*p_page_size
  )
  SELECT jsonb_build_object(
    'items',COALESCE(jsonb_agg(to_jsonb(selected) ORDER BY name,id),'[]'::jsonb),
    'total',(SELECT count(*) FROM actors)
  ) INTO result FROM selected;
  RETURN result;
END;
$fn$;
-- SECURITY INVOKER is mandatory; preserve existing authenticated-only execute.
REVOKE ALL ON FUNCTION public.get_audit_actor_page(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_actor_page(integer,integer) TO authenticated;
COMMIT;
