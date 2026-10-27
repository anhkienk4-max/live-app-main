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
DECLARE v_role text; v_decision text;
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
  SELECT versions.decisions->>'audit.view_team' INTO v_decision
  FROM private.rbac01_role_default_versions versions
  WHERE versions.role = 'leader' AND versions.status = 'approved'
  ORDER BY versions.version DESC LIMIT 1;
  -- Deny is the ONLY possible effective override in this slice. Any unknown
  -- value behaves as inherit, never ALLOW beyond existing role+RLS constraints.
  RETURN v_decision IS DISTINCT FROM 'deny';
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
