\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.one_shot_assert(value boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ONE_SHOT_ASSERTION_FAILED: %', label; END IF;
  RAISE NOTICE 'ONE_SHOT_PASS: %', label;
END $$;

SELECT public.one_shot_assert(
  (SELECT prosecdef AND proconfig = ARRAY['search_path=""']::text[]
   FROM pg_proc WHERE oid = 'private.can_read_report(text,text)'::regprocedure),
  'can_read_report SECURITY DEFINER and empty search_path');
SELECT public.one_shot_assert(
  has_function_privilege('authenticated', 'private.can_read_report(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.can_read_report(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'private.can_read_report(text,text)', 'EXECUTE'),
  'can_read_report ACL');
SELECT public.one_shot_assert(
  (SELECT qual LIKE '%can_read_report%' FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'reports_active_select'),
  'Reports active policy is narrowed');
SELECT public.one_shot_assert(
  (SELECT qual LIKE '%can_read_report%' FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'dashboard_updates'
     AND policyname = 'dashboard_updates_scoped_read'),
  'Snapshot policy follows Report scope');
SELECT public.one_shot_assert(
  (SELECT prosecdef AND proconfig = ARRAY['search_path=""']::text[]
   FROM pg_proc WHERE oid = 'public.create_dashboard_update(jsonb)'::regprocedure),
  'Snapshot RPC security metadata');
SELECT public.one_shot_assert(
  has_function_privilege('authenticated', 'public.create_dashboard_update(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.create_dashboard_update(jsonb)', 'EXECUTE'),
  'Snapshot RPC ACL');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT public.one_shot_assert(NOT EXISTS (SELECT 1 FROM public.reports WHERE id = 'r_unrelated'), 'unrelated member denied');
SELECT public.one_shot_assert(NOT EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id = 'r_unrelated'), 'unrelated revisions denied');
SELECT public.one_shot_assert(NOT EXISTS (SELECT 1 FROM public.report_images WHERE report_id = 'r_unrelated'), 'unrelated images denied');
SELECT public.one_shot_assert(NOT EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id = 'r_unrelated'), 'unrelated live images denied');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT public.one_shot_assert(private.can_read_shift('s_open') AND NOT private.can_read_report('s_open', 'm_host'), 'open registration cannot read Report');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
SELECT public.one_shot_assert(private.can_read_shift('s_pending') AND NOT private.can_read_report('s_pending', 'm_host'), 'pending registration cannot read Report');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT public.one_shot_assert(private.can_read_report('s_host', 'm_host'), 'direct Host allowed');
SELECT public.one_shot_assert((public.get_report_list_page(1, 20, '{"search":"r_host"}', false)->>'total')::integer = 1, 'Reports list/search works after M1 and M2');
SELECT public.one_shot_assert((SELECT count(*) FROM public.get_report_revisions('r_host')) = 1, 'revision RPC preserves legitimate access');
SELECT public.one_shot_assert(NOT EXISTS (SELECT 1 FROM public.reports WHERE id IN ('r_archived_shift', 'r_deleted_shift', 'r_archived', 'r_deleted')), 'archived and deleted boundary');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
SELECT public.one_shot_assert(private.can_read_report('s_support', 'm_support'), 'direct Support allowed');
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
SELECT public.one_shot_assert(private.can_read_report('s_technical', 'm_technical'), 'direct Technical allowed');
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
SELECT public.one_shot_assert(private.can_read_report('s_approved', 'm_approved'), 'approved registration allowed');
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
SELECT public.one_shot_assert(private.can_read_report('s_manual', 'm_manual'), 'manual registration allowed');
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', true);
SELECT public.one_shot_assert(private.can_read_report('s_submitter', 'm_submitter'), 'Report submitter allowed');
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
SELECT public.one_shot_assert(NOT EXISTS (SELECT 1 FROM public.reports WHERE id = 'r_inactive'), 'inactive member denied');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
SELECT public.one_shot_assert(EXISTS (SELECT 1 FROM public.reports WHERE id = 'r_unrelated'), 'Leader active scope retained');
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
SELECT public.one_shot_assert(EXISTS (SELECT 1 FROM public.reports WHERE id = 'r_archived'), 'Admin archive scope retained');
ROLLBACK;

UPDATE public.shifts SET status = 'live', start_at = statement_timestamp() - interval '1 hour',
  end_at = statement_timestamp() + interval '1 hour' WHERE id = 's_host';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT public.create_dashboard_update(jsonb_build_object(
  'shift_id', 's_host', 'time', statement_timestamp()::text,
  'dashboard_platform', 'tiktok_shop', 'normalized_metrics', jsonb_build_object('gmv', 100),
  'ocr_review', jsonb_build_object('metrics', jsonb_build_object('gmv', jsonb_build_object(
    'value', 100, 'status', 'manual', 'source', 'manual', 'needs_review', false,
    'manual_edit', jsonb_build_object('manual_value', 100, 'edited_by', 'm_host', 'edited_at', statement_timestamp()::text)))),
  'request_id', '11111111-1111-4111-8111-111111111111'));
SELECT public.one_shot_assert((SELECT count(*) FROM public.dashboard_updates) = 1, 'direct Host creates and reads bound snapshot');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT public.one_shot_assert((SELECT count(*) FROM public.dashboard_updates) = 0, 'unrelated member cannot read snapshot');
DO $$ BEGIN
  BEGIN
    PERFORM public.create_dashboard_update(jsonb_build_object(
      'shift_id', 's_host', 'time', statement_timestamp()::text,
      'dashboard_platform', 'tiktok_shop', 'request_id', '22222222-2222-4222-8222-222222222222'));
    RAISE EXCEPTION 'UNRELATED_SNAPSHOT_WRITE_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;

SELECT public.one_shot_assert(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
    AND indexname = 'dashboard_updates_actor_request_id_key'),
  'snapshot idempotency index');
