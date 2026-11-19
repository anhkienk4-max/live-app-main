-- RC19 RBAC-02: append-only account overrides with database-owned actor identity.
BEGIN;

CREATE TABLE private.rbac02_account_permission_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_business_user_id text NOT NULL REFERENCES public.business_users(id),
  permission text NOT NULL REFERENCES private.rbac_permission_catalog(permission),
  version integer NOT NULL CHECK (version > 0),
  expected_version integer NOT NULL CHECK (expected_version >= 0),
  decision text NOT NULL CHECK (decision IN ('allow','deny','reset','revoke')),
  actor_business_user_id text NOT NULL REFERENCES public.business_users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (target_business_user_id, permission, version),
  CHECK (decision IN ('allow','deny') OR expires_at IS NULL)
);

CREATE TRIGGER rbac02_versions_immutable
  BEFORE UPDATE OR DELETE ON private.rbac02_account_permission_versions
  FOR EACH ROW EXECUTE FUNCTION private.rbac_reject_immutable_change();

ALTER TABLE private.rbac02_account_permission_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac02_account_permission_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.rbac02_account_permission_versions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.rbac_permission_decision_for_user(
  p_business_user_id text,
  p_permission text,
  p_at timestamptz DEFAULT statement_timestamp()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user public.business_users%ROWTYPE;
  v_catalog private.rbac_permission_catalog%ROWTYPE;
  v_enabled boolean;
  v_allowed boolean;
  v_version_id bigint;
  v_decision text;
  v_effective_at timestamptz;
  v_account private.rbac02_account_permission_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.business_users u
  WHERE u.id = p_business_user_id AND u.status = 'active' AND u.account_status = 'active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'RBAC_ACTOR_INACTIVE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_catalog FROM private.rbac_permission_catalog c WHERE c.permission = p_permission;
  IF v_catalog.permission IS NULL THEN RAISE EXCEPTION 'RBAC_PERMISSION_UNKNOWN' USING ERRCODE='22023'; END IF;
  v_allowed := coalesce((v_catalog.legacy_defaults ->> v_user.system_permission)::boolean, false);
  SELECT g.enabled INTO v_enabled FROM private.rbac_runtime_gate g WHERE g.id = true;
  IF v_catalog.hard_restricted OR NOT coalesce(v_enabled, false) THEN
    RETURN jsonb_build_object(
      'actor_business_user_id',v_user.id,'role',v_user.system_permission,'permission',p_permission,
      'allowed',v_allowed,'source',CASE WHEN v_catalog.hard_restricted THEN 'hard_restriction' ELSE 'legacy_default' END,
      'reason',CASE WHEN v_catalog.hard_restricted THEN 'This action is fixed by the security baseline.'
                    ELSE 'The dynamic policy gate is disabled; the legacy matrix applies.' END,
      'version',NULL,'expires_at',NULL,'effective_at',NULL
    );
  END IF;

  v_version_id := private.rbac01_active_version_id(v_user.system_permission,p_at);
  IF v_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM private.rbac01_role_default_events approval
      JOIN private.rbac01_role_default_versions version ON version.id=approval.version_id
      WHERE approval.version_id=v_version_id AND approval.event_type='approval'
        AND approval.actor_business_user_id<>version.proposed_by
    ) THEN
      RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
        'permission',p_permission,'allowed',false,'source','invalid_version',
        'reason','The active role configuration lacks independent approval.',
        'version',v_version_id,'expires_at',NULL,'effective_at',NULL);
    END IF;
    SELECT version.decisions->>p_permission INTO v_decision
    FROM private.rbac01_role_default_versions version
    WHERE version.id=v_version_id AND version.role=v_user.system_permission;
    IF v_decision IN ('allow','deny') THEN
      v_allowed := (v_decision='allow');
      v_effective_at := (SELECT e.effective_at FROM private.rbac01_role_default_events e
        WHERE e.event_type IN ('activation','rollback') AND e.resulting_version_id=v_version_id
        ORDER BY e.effective_at DESC,e.id DESC LIMIT 1);
    END IF;
  END IF;

  SELECT * INTO v_account FROM private.rbac02_account_permission_versions a
  WHERE a.target_business_user_id=v_user.id AND a.permission=p_permission
  ORDER BY a.version DESC LIMIT 1;
  IF v_account.id IS NOT NULL AND v_account.decision IN ('allow','deny') THEN
    IF v_account.expires_at IS NOT NULL AND v_account.expires_at <= p_at THEN
      RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
        'permission',p_permission,'allowed',v_allowed,'source','expired',
        'reason','The account override expired; the role policy applies.',
        'version',v_account.version,'expires_at',v_account.expires_at,'effective_at',v_effective_at);
    END IF;
    IF v_account.decision='deny' THEN v_allowed := false;
    ELSIF v_user.system_permission = ANY(v_catalog.account_allow_roles) THEN v_allowed := true;
    ELSE v_allowed := false;
    END IF;
    RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
      'permission',p_permission,'allowed',v_allowed,
      'source',CASE WHEN v_account.decision='deny' THEN 'account_deny' ELSE 'account_allow' END,
      'reason',CASE WHEN v_account.decision='deny' THEN 'An active account deny takes precedence.'
                    WHEN v_allowed THEN 'An active account allow is permitted by the catalog.'
                    ELSE 'This account role is not allowed to receive this permission.' END,
      'version',v_account.version,'expires_at',v_account.expires_at,'effective_at',v_effective_at);
  END IF;
  IF v_account.id IS NOT NULL AND v_account.decision IN ('reset','revoke') THEN
    RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
      'permission',p_permission,'allowed',v_allowed,
      'source',CASE WHEN v_account.decision='revoke' THEN 'revoked' ELSE 'legacy_default' END,
      'reason',CASE WHEN v_account.decision='revoke' THEN 'The account override was revoked; the role policy applies.'
                    ELSE 'The account override was reset; the role policy applies.' END,
      'version',v_account.version,'expires_at',NULL,'effective_at',v_effective_at);
  END IF;
  RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
    'permission',p_permission,'allowed',v_allowed,
    'source',CASE WHEN v_version_id IS NULL THEN 'legacy_default' ELSE 'role_override' END,
    'reason',CASE WHEN v_version_id IS NULL THEN 'No active role override changes this permission.'
                  ELSE format('Approved role policy v%s applies.',v_version_id) END,
    'version',v_version_id,'expires_at',NULL,'effective_at',v_effective_at);
END;
$$;

CREATE OR REPLACE FUNCTION private.rbac_has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((private.rbac_permission_decision_for_user(
    private.current_business_user_id(),p_permission
  )->>'allowed')::boolean,false)
$$;

CREATE OR REPLACE FUNCTION public.rbac_permission_decision(p_permission text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text;
BEGIN
  v_actor:=private.current_business_user_id();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN private.rbac_permission_decision_for_user(v_actor,p_permission);
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_permission_decisions()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text; v_result jsonb;
BEGIN
  v_actor:=private.current_business_user_id();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(private.rbac_permission_decision_for_user(v_actor,c.permission)
    ORDER BY c.permission),'[]'::jsonb) INTO v_result
  FROM private.rbac_permission_catalog c;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac01_effective_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((public.rbac_permission_decision(p_permission)->>'allowed')::boolean,false)
$$;

CREATE OR REPLACE FUNCTION public.rbac02_list_account_overrides()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor text; v_result jsonb;
BEGIN
  v_actor:=private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission()<>'admin' THEN
    RAISE EXCEPTION 'RBAC02_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'target_business_user_id',a.target_business_user_id,'permission',a.permission,
    'version',a.version,'decision',a.decision,'actor_business_user_id',a.actor_business_user_id,
    'reason',a.reason,'expires_at',a.expires_at,'created_at',a.created_at
  ) ORDER BY a.target_business_user_id,a.permission),'[]'::jsonb) INTO v_result
  FROM private.rbac02_account_permission_versions a
  JOIN (SELECT DISTINCT ON (target_business_user_id,permission)
      target_business_user_id,permission,version
    FROM private.rbac02_account_permission_versions
    ORDER BY target_business_user_id,permission,version DESC) latest
    USING (target_business_user_id,permission,version);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.rbac02_append_account_decision(
  p_target_business_user_id text,p_permission text,p_decision text,p_reason text,
  p_expires_at timestamptz,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor text; v_target public.business_users%ROWTYPE; v_catalog private.rbac_permission_catalog%ROWTYPE;
  v_current_version integer; v_next_version integer; v_id bigint;
BEGIN
  v_actor:=private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission()<>'admin'
    OR NOT private.rbac_has_permission('permissions.manage') THEN
    RAISE EXCEPTION 'RBAC02_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_target_business_user_id IS NULL OR p_permission IS NULL
    OR p_decision NOT IN ('allow','deny','reset','revoke')
    OR p_expected_version IS NULL OR p_expected_version<0
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'RBAC02_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_target_business_user_id=v_actor THEN
    RAISE EXCEPTION 'RBAC02_SELF_CHANGE_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_target FROM public.business_users u
  WHERE u.id=p_target_business_user_id AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'RBAC02_TARGET_INACTIVE' USING ERRCODE='42501'; END IF;
  IF v_target.system_permission='admin' THEN
    RAISE EXCEPTION 'RBAC02_ADMIN_TARGET_PROTECTED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_catalog FROM private.rbac_permission_catalog c WHERE c.permission=p_permission;
  IF v_catalog.permission IS NULL OR v_catalog.hard_restricted
    OR NOT (v_target.system_permission=ANY(v_catalog.account_override_roles))
    OR (p_decision='allow' AND NOT (v_target.system_permission=ANY(v_catalog.account_allow_roles))) THEN
    RAISE EXCEPTION 'RBAC02_PERMISSION_NOT_CONFIGURABLE' USING ERRCODE='42501';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'RBAC02_EXPIRY_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'rbac02:'||p_target_business_user_id||':'||p_permission,0));
  SELECT coalesce(max(version),0) INTO v_current_version FROM private.rbac02_account_permission_versions
  WHERE target_business_user_id=p_target_business_user_id AND permission=p_permission;
  IF v_current_version<>p_expected_version THEN RAISE EXCEPTION 'RBAC02_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  v_next_version:=v_current_version+1;
  INSERT INTO private.rbac02_account_permission_versions(
    target_business_user_id,permission,version,expected_version,decision,
    actor_business_user_id,reason,expires_at
  ) VALUES (
    p_target_business_user_id,p_permission,v_next_version,v_current_version,p_decision,
    v_actor,btrim(p_reason),p_expires_at
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'target_business_user_id',p_target_business_user_id,
    'permission',p_permission,'version',v_next_version,'decision',p_decision,
    'expires_at',p_expires_at,'effective',p_decision IN ('allow','deny')
      AND (p_expires_at IS NULL OR p_expires_at>statement_timestamp()));
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac02_set_account_override(
  p_target_business_user_id text,p_permission text,p_decision text,p_reason text,
  p_expires_at timestamptz,p_expected_version integer
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.rbac02_append_account_decision(
    p_target_business_user_id,p_permission,p_decision,p_reason,p_expires_at,p_expected_version)
$$;

CREATE OR REPLACE FUNCTION public.rbac02_reset_account_override(
  p_target_business_user_id text,p_permission text,p_reason text,p_expected_version integer
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.rbac02_append_account_decision(
    p_target_business_user_id,p_permission,'reset',p_reason,NULL,p_expected_version)
$$;

CREATE OR REPLACE FUNCTION public.rbac02_revoke_account_override(
  p_target_business_user_id text,p_permission text,p_reason text,p_expected_version integer
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.rbac02_append_account_decision(
    p_target_business_user_id,p_permission,'revoke',p_reason,NULL,p_expected_version)
$$;

REVOKE ALL ON FUNCTION private.rbac_permission_decision_for_user(text,text,timestamptz),
  private.rbac02_append_account_decision(text,text,text,text,timestamptz,integer),
  private.rbac_has_permission(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.rbac_has_permission(text) TO authenticated;
REVOKE ALL ON FUNCTION public.rbac_permission_decision(text),public.rbac_permission_decisions(),
  public.rbac01_effective_permission(text),public.rbac02_list_account_overrides(),
  public.rbac02_set_account_override(text,text,text,text,timestamptz,integer),
  public.rbac02_reset_account_override(text,text,text,integer),
  public.rbac02_revoke_account_override(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rbac_permission_decision(text),public.rbac_permission_decisions(),
  public.rbac01_effective_permission(text),public.rbac02_list_account_overrides(),
  public.rbac02_set_account_override(text,text,text,text,timestamptz,integer),
  public.rbac02_reset_account_override(text,text,text,integer),
  public.rbac02_revoke_account_override(text,text,text,integer) TO authenticated;
COMMIT;
