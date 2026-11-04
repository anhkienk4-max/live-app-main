\set ON_ERROR_STOP on

-- Signed-in Leader has its legacy team-audit permission while the database gate is off.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'LEGACY_DECISION_WHILE_GATE_OFF_FAILED';
  END IF;
  IF (public.rbac_permission_decision('audit.view_team')->>'actor_business_user_id') <> 'leader-a' THEN
    RAISE EXCEPTION 'AUTH_IDENTITY_MAPPING_FAILED';
  END IF;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;
UPDATE private.rbac_runtime_gate SET enabled=true,changed_at=clock_timestamp() WHERE id=true;

-- Team audit permission preserves the existing module boundary in RLS.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.audit_logs) <> 1 THEN RAISE EXCEPTION 'LEADER_AUDIT_SCOPE_FAILED'; END IF;
END $$;
RESET ROLE;

-- Admin A proposes, cannot approve their own version; Admin B independently approves.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT (public.rbac01_propose_role_defaults('leader','{"audit.view_team":"deny"}'::jsonb,
  'Disable team audit for role',0)->>'id')::bigint AS role_proposal_id \gset
DO $$ DECLARE v_id bigint;
BEGIN
  SELECT (entry.value->>'id')::bigint INTO v_id
  FROM jsonb_array_elements(public.rbac01_list_role_defaults()) AS entry(value)
  WHERE entry.value->>'role'='leader' AND entry.value->>'status'='proposed'
  ORDER BY (entry.value->>'version')::integer DESC LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'ROLE_PROPOSAL_NOT_LISTED'; END IF;
  BEGIN
    PERFORM public.rbac01_approve_role_defaults(v_id);
    RAISE EXCEPTION 'ROLE_SELF_APPROVAL_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000012';
SET ROLE authenticated;
SELECT public.rbac01_approve_role_defaults(:'role_proposal_id'::bigint);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac01_activate_role_defaults(:'role_proposal_id'::bigint,0,NULL);
RESET ROLE;

-- A stale active version is rejected; the active role change is used by the same RPC as RLS.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.rbac01_propose_role_defaults('leader','{"audit.view_team":"allow"}'::jsonb,
      'Stale version must fail',0);
    RAISE EXCEPTION 'ROLE_VERSION_CONFLICT_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
     OR (SELECT count(*) FROM public.audit_logs) <> 0 THEN
    RAISE EXCEPTION 'ROLE_DENY_NOT_ENFORCED_BY_DECISION_AND_RLS';
  END IF;
END $$;
RESET ROLE;

-- Catalog-approved account Allow can restore this supported action after role Deny.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac02_set_account_override('leader-a','audit.view_team','allow',
  'Temporary account grant',NULL,0);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM true
     OR (SELECT count(*) FROM public.audit_logs) <> 1
     OR public.rbac_permission_decision('audit.view_team')->>'source' <> 'account_allow' THEN
    RAISE EXCEPTION 'ACCOUNT_ALLOW_DECISION_OR_RLS_FAILED';
  END IF;
END $$;
RESET ROLE;

-- Deny precedence, reset-to-role inheritance, expiry, revoke, and optimistic version check.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac02_set_account_override('leader-a','audit.view_team','deny',
  'Temporary account deny',NULL,1);
DO $$ BEGIN
  BEGIN
    PERFORM public.rbac02_set_account_override('leader-a','audit.view_team','allow',
      'Stale version must fail',NULL,1);
    RAISE EXCEPTION 'ACCOUNT_VERSION_CONFLICT_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
END $$;
SELECT public.rbac02_reset_account_override('leader-a','audit.view_team','Restore role policy',2);
SELECT public.rbac02_set_account_override('leader-a','audit.view_team','allow',
  'Short account grant',clock_timestamp()+interval '1 second',3);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
SELECT pg_catalog.pg_sleep(1.1);
DO $$ BEGIN
  IF public.rbac_permission_decision('audit.view_team')->>'source' <> 'expired'
     OR public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ACCOUNT_EXPIRY_FALLBACK_FAILED';
  END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac02_revoke_account_override('leader-a','audit.view_team','Revoke account grant',4);

-- Finance/Admin hard restrictions, self-escalation and protected Admin targets fail closed.
DO $$ BEGIN
  BEGIN
    PERFORM public.rbac02_set_account_override('leader-a','payroll.manage','allow','Finance test grant',NULL,0);
    RAISE EXCEPTION 'HARD_RESTRICTED_PERMISSION_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.rbac02_set_account_override('admin-b','audit.view_team','deny','Admin target test',NULL,0);
    RAISE EXCEPTION 'ADMIN_TARGET_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.rbac02_set_account_override('admin-a','audit.view_team','allow','Self change test',NULL,0);
    RAISE EXCEPTION 'SELF_CHANGE_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000031';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('payroll.view_own') IS DISTINCT FROM true
     OR public.rbac01_effective_permission('payroll.manage') IS DISTINCT FROM false
     OR (public.rbac_permission_decision('payroll.manage')->>'source') <> 'hard_restriction' THEN
    RAISE EXCEPTION 'FINANCE_HARD_RESTRICTION_FAILED';
  END IF;
  IF (SELECT count(*) FROM public.audit_logs) <> 0 THEN RAISE EXCEPTION 'MEMBER_AUDIT_SCOPE_FAILED'; END IF;
  IF has_table_privilege('authenticated','private.rbac02_account_permission_versions','SELECT')
     OR has_table_privilege('authenticated','private.rbac02_account_permission_versions','UPDATE')
     OR has_table_privilege('authenticated','private.rbac01_role_default_versions','SELECT') THEN
    RAISE EXCEPTION 'PRIVATE_RBAC_TABLE_PRIVILEGE_LEAK';
  END IF;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

-- Rollback restores legacy defaults, and role revoke clears the active policy.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac01_rollback_role_defaults(:'role_proposal_id'::bigint);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ROLE_ROLLBACK_DID_NOT_RESTORE_LEGACY';
  END IF;
END $$;
RESET ROLE;

-- Re-activate a second version then revoke it to legacy defaults.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT (public.rbac01_propose_role_defaults('leader','{"audit.view_team":"deny"}'::jsonb,
  'Second role version',0)->>'id')::bigint AS role_proposal_id_2 \gset
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000012';
SET ROLE authenticated;
SELECT public.rbac01_approve_role_defaults(:'role_proposal_id_2'::bigint);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac01_activate_role_defaults(:'role_proposal_id_2'::bigint,0,NULL);
SELECT public.rbac01_revoke_role_defaults('leader',2,'Revoke role policy');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ROLE_REVOKE_DID_NOT_RESTORE_LEGACY';
  END IF;
END $$;
RESET ROLE;

-- Anonymous execution and direct history writes remain unavailable.
DO $$ BEGIN
  IF has_function_privilege('anon','public.rbac_permission_decision(text)','EXECUTE')
     OR has_function_privilege('anon','public.rbac02_set_account_override(text,text,text,text,timestamptz,integer)','EXECUTE')
     OR has_table_privilege('authenticated','private.rbac01_role_default_events','INSERT') THEN
    RAISE EXCEPTION 'RBAC_PRIVILEGE_BOUNDARY_FAILED';
  END IF;
END $$;
SELECT 'RC19_RBAC_ENFORCEMENT_PG17: PASS';
