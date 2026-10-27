-- RC19 SECURITY #84: synthetic Postgres 17 allow/deny contract.
-- NO real users, credentials, report records or Production connection.
\set ON_ERROR_STOP on

-- SQL objects use the exact reviewed RC19 migration sequence, NOT PR #62 DDL.
DO $gate$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.reports'::regclass)
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.report_revisions'::regclass)
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.report_images'::regclass)
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.live_report_images'::regclass)
 THEN RAISE EXCEPTION 'REPORT_RLS_DISABLED'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.get_report_revisions(text)'::regprocedure)
 THEN RAISE EXCEPTION 'REPORT_REVISIONS_RPC_MUST_BE_INVOKER'; END IF;
 IF has_function_privilege('anon','public.get_report_revisions(text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.get_report_revisions(text)','EXECUTE')
 THEN RAISE EXCEPTION 'REPORT_REVISIONS_RPC_GRANTS_INVALID'; END IF;
 IF (SELECT public FROM storage.buckets WHERE id='report-images') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'REPORT_BUCKET_MUST_BE_PRIVATE'; END IF;
 IF (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='reports'
   AND p.cmd='SELECT' AND p.roles @> ARRAY['authenticated'::name]
   AND p.policyname IN ('reports_active_select','reports_archived_select')
   AND p.qual LIKE '%private.can_read_report%') <> 2
 THEN RAISE EXCEPTION 'REPORT_RLS_SCOPE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
   AND p.tablename IN ('reports','report_revisions','report_images','live_report_images')
   AND p.cmd IN ('SELECT','ALL') AND p.permissive='PERMISSIVE'
   AND (p.roles @> ARRAY['authenticated'::name] OR p.roles @> ARRAY['public'::name])
   AND p.policyname NOT IN (
     'reports_active_select','reports_archived_select',
     'report_revisions_read','report_images_read','live_report_images_read'))
 THEN RAISE EXCEPTION 'REPORT_UNEXPECTED_PERMISSIVE_READ_POLICY'; END IF;
END $gate$;

-- Member with no assignment/submitter relationship, foreign ID guessed.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $member$
DECLARE denied boolean:=false; p jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.reports WHERE id='r_unrelated')
 OR EXISTS(SELECT 1 FROM public.report_revisions WHERE report_id='r_unrelated')
 OR EXISTS(SELECT 1 FROM public.report_images WHERE report_id='r_unrelated')
 OR EXISTS(SELECT 1 FROM public.live_report_images WHERE report_id='r_unrelated')
 OR EXISTS(SELECT 1 FROM public.live_report_images WHERE report_id IS NULL)
 OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='report-images' AND name='reports/r_unrelated/evidence.png')
 THEN RAISE EXCEPTION 'MEMBER_FOREIGN_READ_EXPOSED'; END IF;
 BEGIN
   PERFORM * FROM public.get_report_revisions('r_unrelated');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM <> 'REPORT_NOT_FOUND' THEN RAISE; END IF;
   denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'MEMBER_FOREIGN_RPC_EXPOSED'; END IF;
 p:=public.get_report_list_page(1,20,'{"search":"r_unrelated"}'::jsonb,false);
 IF p->>'total'<>'0' THEN RAISE EXCEPTION 'MEMBER_FOREIGN_LIST_EXPOSED'; END IF;
END $member$;
ROLLBACK;

-- A Member assigned Host directly may read the shift's report and revision.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
DO $host$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.reports WHERE id='r_host')
 OR (SELECT count(*) FROM public.get_report_revisions('r_host'))<>1
 THEN RAISE EXCEPTION 'HOST_REPORT_ACCESS_BROKEN'; END IF;
 IF EXISTS(SELECT 1 FROM public.reports WHERE id='r_approved')
 THEN RAISE EXCEPTION 'HOST_FOREIGN_ACCESS_EXPOSED'; END IF;
 -- Archived/deleted Report requires Admin, despite Member having submitted it.
 IF EXISTS(SELECT 1 FROM public.reports WHERE id IN ('r_archived','r_deleted'))
 OR EXISTS(SELECT 1 FROM public.report_revisions WHERE report_id='r_archived')
 THEN RAISE EXCEPTION 'MEMBER_ARCHIVED_READ_EXPOSED'; END IF;
END $host$;
ROLLBACK;

-- Approved, manually assigned, and historical submitter paths remain readable.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.reports WHERE id='r_approved')
 THEN RAISE EXCEPTION 'APPROVED_REPORT_DENIED'; END IF;
END $$;
ROLLBACK;
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000008',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.reports WHERE id='r_manual')
 THEN RAISE EXCEPTION 'MANUAL_ASSIGNMENT_DENIED'; END IF;
END $$;
ROLLBACK;
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000009',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.reports WHERE id='r_submitter')
 OR (SELECT count(*) FROM public.get_report_revisions('r_submitter'))<>1
 THEN RAISE EXCEPTION 'HISTORICAL_SUBMITTER_DENIED'; END IF;
END $$;
ROLLBACK;

-- Open-registration and pending applications never grant Report content.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.reports WHERE id='r_open')
 THEN RAISE EXCEPTION 'OPEN_REGISTRATION_REPORT_EXPOSED'; END IF; END $$;
ROLLBACK;
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.reports WHERE id='r_pending')
 THEN RAISE EXCEPTION 'PENDING_REPORT_EXPOSED'; END IF; END $$;
ROLLBACK;

-- Active Leader retains active scope, never archived/deleted records.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.reports WHERE id='r_unrelated')
 OR (SELECT count(*) FROM public.get_report_revisions('r_unrelated'))<>1
 THEN RAISE EXCEPTION 'LEADER_ACTIVE_REPORT_DENIED'; END IF;
 IF EXISTS(SELECT 1 FROM public.reports WHERE id IN ('r_archived','r_deleted'))
 THEN RAISE EXCEPTION 'LEADER_ARCHIVE_EXPOSED'; END IF;
END $$;
ROLLBACK;

-- Admin retains archived/revision permissions; unrelated Member never gets them.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.reports WHERE id='r_archived')
 OR NOT EXISTS(SELECT 1 FROM public.reports WHERE id='r_deleted')
 OR (SELECT count(*) FROM public.get_report_revisions('r_archived'))<>1
 THEN RAISE EXCEPTION 'ADMIN_ARCHIVE_ACCESS_DENIED'; END IF;
 IF EXISTS(SELECT 1 FROM public.live_report_images WHERE report_id IS NULL)
 THEN RAISE EXCEPTION 'ORPHAN_LIVE_IMAGE_READ_EXPOSED'; END IF;
END $$;
ROLLBACK;

SELECT 'RC19_REPORTS_P0_POSTGRESQL17_SYNTHETIC: PASS';
