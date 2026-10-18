\set ON_ERROR_STOP on

DO $$
DECLARE f pg_proc%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.reports'::regclass,
      'public.report_revisions'::regclass,'public.report_images'::regclass,'public.live_report_images'::regclass)
      AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'REPORT_RELATED_RLS_DISABLED';
  END IF;
  SELECT * INTO f FROM pg_proc WHERE oid='private.can_read_report(text,text)'::regprocedure;
  IF NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR pg_get_userbyid(f.proowner) <> 'postgres' THEN
    RAISE EXCEPTION 'CAN_READ_REPORT_SECURITY_METADATA_MISMATCH';
  END IF;
  IF NOT has_function_privilege('authenticated','private.can_read_report(text,text)','EXECUTE')
     OR has_function_privilege('anon','private.can_read_report(text,text)','EXECUTE')
     OR has_function_privilege('service_role','private.can_read_report(text,text)','EXECUTE')
     OR EXISTS (SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'CAN_READ_REPORT_ACL_MISMATCH';
  END IF;
  SELECT * INTO f FROM pg_proc WHERE oid='public.get_report_revisions(text)'::regprocedure;
  IF NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR pg_get_userbyid(f.proowner) <> 'postgres'
     OR NOT has_function_privilege('authenticated','public.get_report_revisions(text)','EXECUTE') THEN
    RAISE EXCEPTION 'REPORT_REVISIONS_SECURITY_METADATA_MISMATCH';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reports'
    AND policyname='reports_active_select' AND cmd='SELECT' AND permissive='PERMISSIVE'
    AND qual LIKE '%can_read_report%') THEN
    RAISE EXCEPTION 'REPORT_SELECT_POLICY_NOT_NARROWED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='live_report_images'
    AND policyname='live_report_images_read' AND qual LIKE '%current_business_user_is_active%') THEN
    RAISE EXCEPTION 'LIVE_REPORT_IMAGE_POLICY_MISSING';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('reports','report_revisions','report_images','live_report_images')
      AND cmd IN ('SELECT','ALL') AND permissive='PERMISSIVE'
      AND (roles @> ARRAY['public'::name] OR roles @> ARRAY['authenticated'::name])) <> 5 THEN
    RAISE EXCEPTION 'UNEXPECTED_REPORT_READ_POLICY_SET';
  END IF;
END $$;

-- Each block uses the authenticated database role and a synthetic Auth subject.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE n integer; payload jsonb; denied boolean:=false; BEGIN
  IF (SELECT count(*) FROM public.reports WHERE id='r_unrelated') <> 0 THEN RAISE EXCEPTION 'UNRELATED_REPORT_READ'; END IF;
  IF (SELECT count(*) FROM public.report_revisions WHERE report_id='r_unrelated') <> 0 THEN RAISE EXCEPTION 'UNRELATED_REVISION_READ'; END IF;
  IF (SELECT count(*) FROM public.report_images WHERE report_id='r_unrelated') <> 0 THEN RAISE EXCEPTION 'UNRELATED_IMAGE_READ'; END IF;
  IF (SELECT count(*) FROM public.live_report_images WHERE report_id='r_unrelated') <> 0 THEN RAISE EXCEPTION 'UNRELATED_LIVE_IMAGE_READ'; END IF;
  IF (SELECT count(*) FROM public.live_report_images WHERE report_id IS NULL) <> 0 THEN RAISE EXCEPTION 'UNBOUND_LIVE_IMAGE_READ'; END IF;
  payload := public.get_report_list_page(1,20,'{"search":"r_unrelated"}',false);
  IF payload->'rows' <> '[]'::jsonb THEN RAISE EXCEPTION 'UNRELATED_SEARCH_RESULT'; END IF;
  BEGIN PERFORM * FROM public.get_report_revisions('r_unrelated');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'UNRELATED_REVISION_RPC_NOT_DENIED'; END IF;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
  IF NOT private.can_read_shift('s_open') THEN RAISE EXCEPTION 'OPEN_BASELINE_FIXTURE_EXPECTATION'; END IF;
  IF private.can_read_report('s_open','m_open') THEN RAISE EXCEPTION 'OPEN_REPORT_HELPER_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.reports WHERE id='r_open') THEN RAISE EXCEPTION 'OPEN_REPORT_ROW_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id='r_open') THEN RAISE EXCEPTION 'OPEN_REPORT_REVISION_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.report_images WHERE report_id='r_open') THEN RAISE EXCEPTION 'OPEN_REPORT_IMAGE_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id='r_open') THEN RAISE EXCEPTION 'OPEN_LIVE_REPORT_IMAGE_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id IS NULL) THEN RAISE EXCEPTION 'OPEN_UNBOUND_LIVE_IMAGE_LEAK'; END IF;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
  IF NOT private.can_read_shift('s_pending') THEN RAISE EXCEPTION 'PENDING_BASELINE_FIXTURE_EXPECTATION'; END IF;
  IF private.can_read_report('s_pending','m_pending') THEN RAISE EXCEPTION 'PENDING_REPORT_HELPER_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.reports WHERE id='r_pending') THEN RAISE EXCEPTION 'PENDING_REPORT_ROW_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id='r_pending') THEN RAISE EXCEPTION 'PENDING_REPORT_REVISION_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.report_images WHERE report_id='r_pending') THEN RAISE EXCEPTION 'PENDING_REPORT_IMAGE_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id='r_pending') THEN RAISE EXCEPTION 'PENDING_LIVE_REPORT_IMAGE_LEAK'; END IF;
  IF EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id IS NULL) THEN RAISE EXCEPTION 'PENDING_UNBOUND_LIVE_IMAGE_LEAK'; END IF;
END $$;
ROLLBACK;

-- Direct operational assignments, approved/manual registrations, and own submitter.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
DO $$ DECLARE n integer; denied boolean:=false; BEGIN
  IF NOT private.can_read_report('s_host','m_host') OR (SELECT count(*) FROM public.reports WHERE id='r_host') <> 1
     OR (SELECT count(*) FROM public.report_revisions WHERE report_id='r_host') <> 1
     OR (SELECT count(*) FROM public.report_images WHERE report_id='r_host') <> 1
     OR (SELECT count(*) FROM public.live_report_images WHERE report_id='r_host') <> 1 THEN RAISE EXCEPTION 'HOST_SCOPE_FAILURE'; END IF;
  SELECT count(*) INTO n FROM public.get_report_revisions('r_host'); IF n <> 1 THEN RAISE EXCEPTION 'HOST_REVISION_RPC_FAILURE'; END IF;
  IF (public.get_report_list_page(1,20,'{"search":"r_host"}',false)->'rows') <> '[{"id":"r_host"}]'::jsonb THEN RAISE EXCEPTION 'HOST_LIST_SEARCH_FAILURE'; END IF;
  IF EXISTS (SELECT 1 FROM public.reports WHERE id IN ('r_archived_shift','r_deleted_shift','r_archived','r_deleted'))
     OR EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id IN ('r_archived_shift','r_deleted_shift','r_archived','r_deleted'))
     OR EXISTS (SELECT 1 FROM public.report_images WHERE report_id IN ('r_archived_shift','r_deleted_shift','r_archived','r_deleted'))
     OR EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id IN ('r_archived_shift','r_deleted_shift','r_archived','r_deleted')) THEN
    RAISE EXCEPTION 'HOST_ARCHIVED_BOUNDARY_FAILURE';
  END IF;
  BEGIN PERFORM * FROM public.get_report_revisions('r_archived_shift');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'ARCHIVED_SHIFT_REVISION_RPC_NOT_DENIED'; END IF;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
DO $$ BEGIN IF NOT private.can_read_report('s_support','m_support') OR NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_support') THEN RAISE EXCEPTION 'SUPPORT_SCOPE_FAILURE'; END IF; END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
DO $$ BEGIN IF NOT private.can_read_report('s_technical','m_technical') OR NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_technical') THEN RAISE EXCEPTION 'TECHNICAL_SCOPE_FAILURE'; END IF; END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',true);
DO $$ BEGIN IF NOT private.can_read_report('s_approved','m_approved') OR NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_approved') THEN RAISE EXCEPTION 'APPROVED_SCOPE_FAILURE'; END IF; END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000008',true);
DO $$ BEGIN IF NOT private.can_read_report('s_manual','m_manual') OR NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_manual') THEN RAISE EXCEPTION 'MANUAL_SCOPE_FAILURE'; END IF; END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000009',true);
DO $$ BEGIN IF NOT private.can_read_report('s_submitter','m_submitter') OR NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_submitter') THEN RAISE EXCEPTION 'SUBMITTER_SCOPE_FAILURE'; END IF; END $$;
ROLLBACK;

-- Inactive business identity and assigned member on deleted/archived shifts/reports.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.reports WHERE id='r_inactive') THEN RAISE EXCEPTION 'INACTIVE_MEMBER_READ'; END IF; END $$;
ROLLBACK;

-- Leader and Admin retain active report scope; only Admin retains archived/deleted reports.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_unrelated') THEN RAISE EXCEPTION 'LEADER_ACTIVE_SCOPE_FAILURE'; END IF;
  IF EXISTS (SELECT 1 FROM public.reports WHERE id IN ('r_archived','r_deleted')) THEN RAISE EXCEPTION 'LEADER_ARCHIVED_SCOPE_EXPANSION'; END IF;
  IF (SELECT count(*) FROM public.live_report_images WHERE report_id IS NULL) <> 1 THEN RAISE EXCEPTION 'LEADER_UNBOUND_LIVE_IMAGE_SCOPE_FAILURE'; END IF;
END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $$ DECLARE n integer; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_unrelated') THEN RAISE EXCEPTION 'ADMIN_ACTIVE_SCOPE_FAILURE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_archived') OR NOT EXISTS (SELECT 1 FROM public.reports WHERE id='r_deleted') THEN RAISE EXCEPTION 'ADMIN_ARCHIVED_SCOPE_FAILURE'; END IF;
  SELECT count(*) INTO n FROM public.get_report_revisions('r_archived'); IF n <> 1 THEN RAISE EXCEPTION 'ADMIN_ARCHIVED_REVISION_FAILURE'; END IF;
  IF (SELECT count(*) FROM public.live_report_images WHERE report_id IS NULL) <> 1 THEN RAISE EXCEPTION 'ADMIN_UNBOUND_LIVE_IMAGE_SCOPE_FAILURE'; END IF;
END $$;
ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'M2_STANDALONE_SECURITY_MATRIX=PASS (synthetic database only)'; END $$;
