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
  INSERT INTO public.shift_registrations(id,shift_id,user_id,source,status,reviewed_by)
  VALUES ('legacy-assignment','shift-rbac','member-a','manual_assignment','manually_assigned','leader-a');
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

-- Mutations reject permissions without matching DB enforcement.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.rbac02_set_account_override('leader-a','reports.export','deny',
      'unsupported account decision',NULL,0);
    RAISE EXCEPTION 'UNSUPPORTED_ACCOUNT_OVERRIDE_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.rbac01_propose_role_defaults('leader','{"reports.export":"deny"}'::jsonb,
      'unsupported role decision',0);
    RAISE EXCEPTION 'UNSUPPORTED_ROLE_OVERRIDE_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- Staffing assignment and removal consult the same active database decision.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT (public.rbac01_propose_role_defaults('leader','{"shifts.assign_staff":"deny"}'::jsonb,
  'Disable Leader staffing assignments',0)->>'id')::bigint AS assignment_role_proposal_id \gset
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000012';
SET ROLE authenticated;
SELECT public.rbac01_approve_role_defaults(:'assignment_role_proposal_id'::bigint);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac01_activate_role_defaults(:'assignment_role_proposal_id'::bigint,0,NULL);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('shifts.assign_staff') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'STAFF_ASSIGNMENT_ROLE_DENY_NOT_APPLIED';
  END IF;
  BEGIN
    INSERT INTO public.shift_registrations(id,shift_id,user_id,source,status,reviewed_by)
    VALUES ('denied-assignment','shift-rbac','member-a','manual_assignment','manually_assigned','leader-a');
    RAISE EXCEPTION 'DENIED_STAFF_ASSIGNMENT_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    UPDATE public.shift_registrations SET status='removed'
    WHERE id='assignment-removal';
    RAISE EXCEPTION 'DENIED_STAFF_REMOVAL_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac01_rollback_role_defaults(:'assignment_role_proposal_id'::bigint);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('shifts.assign_staff') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STAFF_ASSIGNMENT_ROLE_ROLLBACK_FAILED';
  END IF;
  UPDATE public.shift_registrations SET status='removed'
  WHERE id='assignment-removal';
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_REMOVAL_AFTER_POLICY_ROLLBACK_FAILED'; END IF;
END $$;
RESET ROLE;

-- The report-submit API and direct swap RPCs consume the same authenticated decision.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT (public.rbac01_propose_role_defaults('leader',
  '{"reports.submit":"deny","swaps.request":"deny","swaps.approve":"deny"}'::jsonb,
  'Scoped action policy test',0)->>'id')::bigint AS scoped_role_proposal_id \gset
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000012';
SET ROLE authenticated;
SELECT public.rbac01_approve_role_defaults(:'scoped_role_proposal_id'::bigint);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac01_activate_role_defaults(:'scoped_role_proposal_id'::bigint,0,NULL);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('reports.submit') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SCOPED_ROLE_DENY_NOT_APPLIED';
  END IF;
  BEGIN
    INSERT INTO public.swap_requests(id,status) VALUES ('denied-swap','pending');
    RAISE EXCEPTION 'SWAP_REQUEST_WITHOUT_PERMISSION_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac02_set_account_override('leader-a','reports.submit','allow',
  'Restore scoped report submission',NULL,0);
SELECT public.rbac02_set_account_override('leader-a','swaps.request','allow',
  'Restore scoped swap request',NULL,0);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rbac01_effective_permission('reports.submit') IS DISTINCT FROM true
     OR public.rbac_permission_decision('reports.submit')->>'source' <> 'account_allow' THEN
    RAISE EXCEPTION 'ACCOUNT_ALLOW_DID_NOT_RESTORE_SCOPED_REPORT_PERMISSION';
  END IF;
  INSERT INTO public.swap_requests(id,status) VALUES ('allowed-swap','pending');
  BEGIN
    UPDATE public.swap_requests SET status='approved',approved_by='leader-a' WHERE id='allowed-swap';
    RAISE EXCEPTION 'SWAP_APPROVAL_WITHOUT_PERMISSION_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rbac02_set_account_override('leader-a','swaps.approve','allow',
  'Restore scoped swap approval',NULL,0);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
UPDATE public.swap_requests SET status='approved',approved_by='leader-a' WHERE id='allowed-swap';
RESET ROLE;

-- Batch and single-permission RPCs use the same authenticated database result.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ DECLARE v_single jsonb; v_batch jsonb;
BEGIN
  v_single:=public.rbac_permission_decision('audit.view_team');
  SELECT item INTO v_batch FROM jsonb_array_elements(public.rbac_permission_decisions()) item
    WHERE item->>'permission'='audit.view_team';
  IF v_single IS DISTINCT FROM v_batch THEN RAISE EXCEPTION 'BATCH_SINGLE_PERMISSION_DIVERGED'; END IF;
END $$;
RESET ROLE;
SELECT 'RC19_RBAC_ENFORCEMENT_PG17: PASS';

-- Admin-managed Leader-to-Brand scope, report RLS, child resources and RPC triggers.
GRANT SELECT ON public.shifts, public.shift_registrations TO authenticated;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_registrations_disposable_test_scope ON public.shift_registrations;
CREATE POLICY shifts_scoped_select ON public.shifts FOR SELECT TO authenticated
  USING ((SELECT private.can_read_shift(id)));
CREATE POLICY shift_registrations_scoped_select ON public.shift_registrations FOR SELECT TO authenticated
  USING ((SELECT private.can_read_shift(shift_id)));
CREATE OR REPLACE FUNCTION public.pg17_test_update_report(p_report_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.reports SET status = status WHERE id = p_report_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.pg17_test_update_report_image(p_image_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.report_images SET deleted_at = deleted_at WHERE id = p_image_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.pg17_test_change_user_role(p_user_id text, p_permission text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.business_users SET system_permission = p_permission WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pg17_test_update_report(text), public.pg17_test_update_report_image(text),
  public.pg17_test_change_user_role(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pg17_test_update_report(text), public.pg17_test_update_report_image(text),
  public.pg17_test_change_user_role(text,text) TO authenticated;

-- No mapping is synthesized. Admin A grants only Brand X and named domains.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.read',true,0,
  statement_timestamp(),NULL,'PG17 synthetic report-read grant');
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','workforce.read',true,0,
  statement_timestamp(),NULL,'PG17 synthetic workforce grant');
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','shifts.read',true,0,
  statement_timestamp(),NULL,'PG17 synthetic shift-read grant');
SELECT public.rc19_set_leader_brand_scope('leader-b','brand-y','reports.export',true,0,
  statement_timestamp(),NULL,'PG17 export scope must not grant direct report reads');
RESET ROLE;

-- Leader A sees only report/revision/image/Drive-object rows in Brand X.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ DECLARE v_brands text[];
BEGIN
  SELECT array_agg(value ORDER BY value) INTO v_brands
    FROM public.rc19_current_leader_brand_ids('workforce.read') AS value;
  IF v_brands IS DISTINCT FROM ARRAY['brand-x']::text[] THEN RAISE EXCEPTION 'LEADER_BRAND_IDS_SCOPE_FAILED'; END IF;
  IF (SELECT count(*) FROM public.reports) <> 2 THEN RAISE EXCEPTION 'REPORT_RLS_CROSS_BRAND_READ'; END IF;
  IF (SELECT count(*) FROM public.report_revisions) <> 1 THEN RAISE EXCEPTION 'REPORT_REVISION_CROSS_BRAND_READ'; END IF;
  IF (SELECT count(*) FROM public.report_images) <> 2 THEN RAISE EXCEPTION 'REPORT_IMAGE_CROSS_BRAND_READ'; END IF;
  IF (SELECT count(*) FROM public.live_report_images) <> 1 THEN RAISE EXCEPTION 'LIVE_REPORT_IMAGE_CROSS_BRAND_OR_ORPHAN_READ'; END IF;
  IF (SELECT count(*) FROM storage.objects) <> 1 THEN RAISE EXCEPTION 'REPORT_STORAGE_CROSS_BRAND_READ'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='report-images-read') THEN RAISE EXCEPTION 'STALE_BROAD_REPORT_STORAGE_POLICY_REMAINS'; END IF;
  IF private.can_read_report('report-y') OR private.can_read_report('forged-report-id') THEN
    RAISE EXCEPTION 'CROSS_BRAND_OR_FORGED_REPORT_AUTHORIZED';
  END IF;
  IF NOT private.can_read_report('report-x') OR NOT private.can_read_shift('shift-x')
     OR private.can_read_shift('shift-y') THEN RAISE EXCEPTION 'LEADER_SCOPE_FUNCTION_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM public.business_users WHERE id='staff-y')
     OR NOT EXISTS (SELECT 1 FROM public.business_users WHERE id='staff-x') THEN
    RAISE EXCEPTION 'LEADER_WORKFORCE_DIRECTORY_CROSS_BRAND_LEAK';
  END IF;
  IF has_table_privilege('authenticated','public.rc19_leader_brand_scopes','INSERT')
     OR has_table_privilege('authenticated','public.rc19_leader_brand_scopes','UPDATE') THEN
    RAISE EXCEPTION 'LEADER_SCOPE_DIRECT_WRITE_PRIVILEGE';
  END IF;
  IF public.authorize_report_image_delete('forged-image-id') THEN
    RAISE EXCEPTION 'FORGED_IMAGE_DELETE_PREFLIGHT_AUTHORIZED';
  END IF;
END $$;
DO $$ BEGIN
  BEGIN
    PERFORM public.pg17_test_update_report('report-x');
    RAISE EXCEPTION 'REPORT_READ_SCOPE_ALLOWED_REVIEW_MUTATION';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.pg17_test_update_report_image('image-x');
    RAISE EXCEPTION 'REPORT_READ_SCOPE_ALLOWED_IMAGE_MUTATION';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.read',true,1,
      statement_timestamp(),NULL,'Leader must not self grant');
    RAISE EXCEPTION 'LEADER_SELF_GRANT_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.authorize_report_image_delete('image-x');
    RAISE EXCEPTION 'REPORT_READ_SCOPE_ALLOWED_PROVIDER_DELETE';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.authorize_report_image_delete('image-y');
    RAISE EXCEPTION 'CROSS_BRAND_PROVIDER_DELETE_PREFLIGHT_AUTHORIZED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- A second Leader receives no inherited Brand X access; forged IDs stay hidden.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000022';
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.reports) <> 0
     OR cardinality(ARRAY(SELECT public.rc19_current_leader_brand_ids('reports.read'))) <> 0
     OR private.can_read_report('report-x') OR private.can_read_report('report-y') THEN
    RAISE EXCEPTION 'LEADER_B_INHERITED_BRAND_A_SCOPE';
  END IF;
END $$;
RESET ROLE;

-- Member ownership/assignment is unchanged; an unassigned cross-Brand report is denied.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000031';
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.reports) <> 2
     OR private.can_read_report('report-y') THEN RAISE EXCEPTION 'MEMBER_REPORT_SCOPE_REGRESSION'; END IF;
  IF public.authorize_report_image_delete('image-member') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'MEMBER_OWN_IMAGE_DELETE_REGRESSION';
  END IF;
  BEGIN
    PERFORM public.authorize_report_image_delete('image-x');
    RAISE EXCEPTION 'MEMBER_CROSS_OWNER_IMAGE_DELETE_AUTHORIZED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  PERFORM public.pg17_test_update_report('report-member-x');
  BEGIN
    PERFORM public.pg17_test_update_report('report-x');
    RAISE EXCEPTION 'MEMBER_UPDATED_OTHER_REPORT';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- Admin remains global; reports.review is distinct from read and can mutate only its Brand.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.review',true,0,
  statement_timestamp(),NULL,'PG17 synthetic report-review grant');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.reports) <> 3 THEN RAISE EXCEPTION 'ADMIN_REPORT_GLOBAL_VIEW_FAILED'; END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.authorize_report_image_delete('image-x') IS DISTINCT FROM true
     OR public.authorize_live_report_image_delete('live-image-x') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'REPORT_REVIEW_PROVIDER_DELETE_PREFLIGHT_DENIED';
  END IF;
END $$;
SELECT public.pg17_test_update_report('report-x');
DO $$ BEGIN
  BEGIN
    PERFORM public.pg17_test_update_report('report-y');
    RAISE EXCEPTION 'LEADER_REVIEW_CROSSED_BRAND';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- Expiry, revoke and version conflict all remove scope without deleting history.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rc19_set_leader_brand_scope('leader-b','brand-y','reports.read',true,0,
  statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour','PG17 expired grant');
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.read',false,1,
  statement_timestamp(),NULL,'PG17 revoke report read');
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.review',false,1,
  statement_timestamp(),NULL,'PG17 revoke report review');
DO $$ BEGIN
  BEGIN
    PERFORM public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.read',true,1,
      statement_timestamp(),NULL,'PG17 stale expected version');
    RAISE EXCEPTION 'STALE_SCOPE_VERSION_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF private.can_read_report('report-x') OR (SELECT count(*) FROM public.reports) <> 0 THEN
    RAISE EXCEPTION 'REVOKED_REPORT_SCOPE_STILL_ACTIVE';
  END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000022';
SET ROLE authenticated;
DO $$ BEGIN
  IF private.can_read_report('report-y') THEN RAISE EXCEPTION 'EXPIRED_REPORT_SCOPE_STILL_ACTIVE'; END IF;
END $$;
RESET ROLE;
-- Losing Leader authority revokes grants permanently; re-promotion does not resurrect them.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.pg17_test_change_user_role('leader-a','member');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF private.can_read_report('report-x')
     OR cardinality(ARRAY(SELECT public.rc19_current_leader_brand_ids('workforce.read'))) <> 0 THEN
    RAISE EXCEPTION 'ROLE_LOSS_DID_NOT_REVOKE_SCOPES';
  END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.pg17_test_change_user_role('leader-a','leader');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  IF private.can_read_report('report-x') THEN RAISE EXCEPTION 'ROLE_REPROMOTION_RESURRECTED_SCOPES'; END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.rc19_leader_brand_scope_events WHERE event_type='automatic_revoke') < 2
     OR (SELECT count(*) FROM public.rc19_leader_brand_scope_events) < 7 THEN
    RAISE EXCEPTION 'LEADER_SCOPE_AUDIT_HISTORY_MISSING';
  END IF;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT 'RC19_C3_LEADER_BRAND_REPORTS_PG17: PASS';
