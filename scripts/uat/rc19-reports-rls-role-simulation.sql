-- RC19 P0 #84 / STAGING-ONLY reproducible SQL role simulation.
-- Run only on Supabase Staging (amagnzebmmuqiptmrjmc) with a privileged
-- SQL reviewer session. Refuse Production: rollout requires separate approval.
-- Current fixture assumptions: >=5 Auth-linked active Members, >=1 Leader,
-- >=1 Admin, >=1 active report foreign to each Member, >=1 report for Leader/Admin.
-- Every case uses BEGIN READ ONLY and ROLLBACK. No IDs/tokens emitted.
-- IMPORTANT: request.jwt.claim.sub + SET LOCAL ROLE are SQL simulations,
-- NOT genuine Supabase HTTP requests signed by Member/Leader/Admin JWTs.
-- Missing actors or fixtures cause explicit failure; do not waive silently.
-- A clean run is NOT a Production GO / JWT clearance.

BEGIN READ ONLY;
-- Member #1: use an existing Auth-linked active account, never an emailed identity.
SELECT set_config('request.jwt.claim.sub',(
  SELECT auth_user_id::text FROM public.business_users
  WHERE system_permission = 'member' AND status = 'active'
    AND account_status = 'active' AND auth_user_id IS NOT NULL
  ORDER BY id LIMIT 1 OFFSET 0
),true);
SELECT set_config('rc19.expected_visible',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
),true);
SELECT set_config('rc19.expected_all',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL
),true);
SELECT set_config('rc19.foreign_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND NOT private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SELECT set_config('rc19.own_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SET LOCAL ROLE authenticated;
DO $member_gate$
DECLARE actual_count integer; foreign_report text; own_report text;
DECLARE direct_revisions integer; rpc_revisions integer;
BEGIN
  IF private.current_system_permission() <> 'member'
    OR NOT private.current_business_user_is_active()
  THEN RAISE EXCEPTION 'RC19_MEMBER_ACTOR_INVALID'; END IF;
  SELECT count(*) INTO actual_count FROM public.reports
    WHERE deleted_at IS NULL AND archived_at IS NULL;
  IF actual_count <> current_setting('rc19.expected_visible')::integer
    OR actual_count >= current_setting('rc19.expected_all')::integer
  THEN RAISE EXCEPTION 'RC19_MEMBER_READ_SCOPE_BROKEN'; END IF;
  foreign_report := nullif(current_setting('rc19.foreign_id', true), '');
  IF foreign_report IS NULL THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_FIXTURE_MISSING'; END IF;
  IF private.can_read_report(foreign_report)
    OR EXISTS (SELECT 1 FROM public.reports WHERE id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_images WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id = foreign_report)
  THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_READ_LEAK'; END IF;
  BEGIN
    PERFORM 1 FROM public.get_report_revisions(foreign_report);
    RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_RPC_LEAK';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'REPORT_NOT_FOUND' THEN RAISE; END IF;
  END;
  own_report := nullif(current_setting('rc19.own_id', true), '');
  IF own_report IS NOT NULL THEN
    SELECT count(*) INTO direct_revisions
      FROM public.report_revisions WHERE report_id = own_report;
    SELECT count(*) INTO rpc_revisions
      FROM public.get_report_revisions(own_report);
    IF direct_revisions <> rpc_revisions
      THEN RAISE EXCEPTION 'RC19_MEMBER_OWN_RPC_MISMATCH'; END IF;
  END IF;
END $member_gate$;
ROLLBACK;

BEGIN READ ONLY;
-- Member #2: use an existing Auth-linked active account, never an emailed identity.
SELECT set_config('request.jwt.claim.sub',(
  SELECT auth_user_id::text FROM public.business_users
  WHERE system_permission = 'member' AND status = 'active'
    AND account_status = 'active' AND auth_user_id IS NOT NULL
  ORDER BY id LIMIT 1 OFFSET 1
),true);
SELECT set_config('rc19.expected_visible',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
),true);
SELECT set_config('rc19.expected_all',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL
),true);
SELECT set_config('rc19.foreign_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND NOT private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SELECT set_config('rc19.own_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SET LOCAL ROLE authenticated;
DO $member_gate$
DECLARE actual_count integer; foreign_report text; own_report text;
DECLARE direct_revisions integer; rpc_revisions integer;
BEGIN
  IF private.current_system_permission() <> 'member'
    OR NOT private.current_business_user_is_active()
  THEN RAISE EXCEPTION 'RC19_MEMBER_ACTOR_INVALID'; END IF;
  SELECT count(*) INTO actual_count FROM public.reports
    WHERE deleted_at IS NULL AND archived_at IS NULL;
  IF actual_count <> current_setting('rc19.expected_visible')::integer
    OR actual_count >= current_setting('rc19.expected_all')::integer
  THEN RAISE EXCEPTION 'RC19_MEMBER_READ_SCOPE_BROKEN'; END IF;
  foreign_report := nullif(current_setting('rc19.foreign_id', true), '');
  IF foreign_report IS NULL THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_FIXTURE_MISSING'; END IF;
  IF private.can_read_report(foreign_report)
    OR EXISTS (SELECT 1 FROM public.reports WHERE id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_images WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id = foreign_report)
  THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_READ_LEAK'; END IF;
  BEGIN
    PERFORM 1 FROM public.get_report_revisions(foreign_report);
    RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_RPC_LEAK';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'REPORT_NOT_FOUND' THEN RAISE; END IF;
  END;
  own_report := nullif(current_setting('rc19.own_id', true), '');
  IF own_report IS NOT NULL THEN
    SELECT count(*) INTO direct_revisions
      FROM public.report_revisions WHERE report_id = own_report;
    SELECT count(*) INTO rpc_revisions
      FROM public.get_report_revisions(own_report);
    IF direct_revisions <> rpc_revisions
      THEN RAISE EXCEPTION 'RC19_MEMBER_OWN_RPC_MISMATCH'; END IF;
  END IF;
END $member_gate$;
ROLLBACK;

BEGIN READ ONLY;
-- Member #3: use an existing Auth-linked active account, never an emailed identity.
SELECT set_config('request.jwt.claim.sub',(
  SELECT auth_user_id::text FROM public.business_users
  WHERE system_permission = 'member' AND status = 'active'
    AND account_status = 'active' AND auth_user_id IS NOT NULL
  ORDER BY id LIMIT 1 OFFSET 2
),true);
SELECT set_config('rc19.expected_visible',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
),true);
SELECT set_config('rc19.expected_all',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL
),true);
SELECT set_config('rc19.foreign_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND NOT private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SELECT set_config('rc19.own_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SET LOCAL ROLE authenticated;
DO $member_gate$
DECLARE actual_count integer; foreign_report text; own_report text;
DECLARE direct_revisions integer; rpc_revisions integer;
BEGIN
  IF private.current_system_permission() <> 'member'
    OR NOT private.current_business_user_is_active()
  THEN RAISE EXCEPTION 'RC19_MEMBER_ACTOR_INVALID'; END IF;
  SELECT count(*) INTO actual_count FROM public.reports
    WHERE deleted_at IS NULL AND archived_at IS NULL;
  IF actual_count <> current_setting('rc19.expected_visible')::integer
    OR actual_count >= current_setting('rc19.expected_all')::integer
  THEN RAISE EXCEPTION 'RC19_MEMBER_READ_SCOPE_BROKEN'; END IF;
  foreign_report := nullif(current_setting('rc19.foreign_id', true), '');
  IF foreign_report IS NULL THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_FIXTURE_MISSING'; END IF;
  IF private.can_read_report(foreign_report)
    OR EXISTS (SELECT 1 FROM public.reports WHERE id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_images WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id = foreign_report)
  THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_READ_LEAK'; END IF;
  BEGIN
    PERFORM 1 FROM public.get_report_revisions(foreign_report);
    RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_RPC_LEAK';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'REPORT_NOT_FOUND' THEN RAISE; END IF;
  END;
  own_report := nullif(current_setting('rc19.own_id', true), '');
  IF own_report IS NOT NULL THEN
    SELECT count(*) INTO direct_revisions
      FROM public.report_revisions WHERE report_id = own_report;
    SELECT count(*) INTO rpc_revisions
      FROM public.get_report_revisions(own_report);
    IF direct_revisions <> rpc_revisions
      THEN RAISE EXCEPTION 'RC19_MEMBER_OWN_RPC_MISMATCH'; END IF;
  END IF;
END $member_gate$;
ROLLBACK;

BEGIN READ ONLY;
-- Member #4: use an existing Auth-linked active account, never an emailed identity.
SELECT set_config('request.jwt.claim.sub',(
  SELECT auth_user_id::text FROM public.business_users
  WHERE system_permission = 'member' AND status = 'active'
    AND account_status = 'active' AND auth_user_id IS NOT NULL
  ORDER BY id LIMIT 1 OFFSET 3
),true);
SELECT set_config('rc19.expected_visible',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
),true);
SELECT set_config('rc19.expected_all',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL
),true);
SELECT set_config('rc19.foreign_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND NOT private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SELECT set_config('rc19.own_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SET LOCAL ROLE authenticated;
DO $member_gate$
DECLARE actual_count integer; foreign_report text; own_report text;
DECLARE direct_revisions integer; rpc_revisions integer;
BEGIN
  IF private.current_system_permission() <> 'member'
    OR NOT private.current_business_user_is_active()
  THEN RAISE EXCEPTION 'RC19_MEMBER_ACTOR_INVALID'; END IF;
  SELECT count(*) INTO actual_count FROM public.reports
    WHERE deleted_at IS NULL AND archived_at IS NULL;
  IF actual_count <> current_setting('rc19.expected_visible')::integer
    OR actual_count >= current_setting('rc19.expected_all')::integer
  THEN RAISE EXCEPTION 'RC19_MEMBER_READ_SCOPE_BROKEN'; END IF;
  foreign_report := nullif(current_setting('rc19.foreign_id', true), '');
  IF foreign_report IS NULL THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_FIXTURE_MISSING'; END IF;
  IF private.can_read_report(foreign_report)
    OR EXISTS (SELECT 1 FROM public.reports WHERE id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_images WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id = foreign_report)
  THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_READ_LEAK'; END IF;
  BEGIN
    PERFORM 1 FROM public.get_report_revisions(foreign_report);
    RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_RPC_LEAK';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'REPORT_NOT_FOUND' THEN RAISE; END IF;
  END;
  own_report := nullif(current_setting('rc19.own_id', true), '');
  IF own_report IS NOT NULL THEN
    SELECT count(*) INTO direct_revisions
      FROM public.report_revisions WHERE report_id = own_report;
    SELECT count(*) INTO rpc_revisions
      FROM public.get_report_revisions(own_report);
    IF direct_revisions <> rpc_revisions
      THEN RAISE EXCEPTION 'RC19_MEMBER_OWN_RPC_MISMATCH'; END IF;
  END IF;
END $member_gate$;
ROLLBACK;

BEGIN READ ONLY;
-- Member #5: use an existing Auth-linked active account, never an emailed identity.
SELECT set_config('request.jwt.claim.sub',(
  SELECT auth_user_id::text FROM public.business_users
  WHERE system_permission = 'member' AND status = 'active'
    AND account_status = 'active' AND auth_user_id IS NOT NULL
  ORDER BY id LIMIT 1 OFFSET 4
),true);
SELECT set_config('rc19.expected_visible',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
),true);
SELECT set_config('rc19.expected_all',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL
),true);
SELECT set_config('rc19.foreign_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND NOT private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SELECT set_config('rc19.own_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SET LOCAL ROLE authenticated;
DO $member_gate$
DECLARE actual_count integer; foreign_report text; own_report text;
DECLARE direct_revisions integer; rpc_revisions integer;
BEGIN
  IF private.current_system_permission() <> 'member'
    OR NOT private.current_business_user_is_active()
  THEN RAISE EXCEPTION 'RC19_MEMBER_ACTOR_INVALID'; END IF;
  SELECT count(*) INTO actual_count FROM public.reports
    WHERE deleted_at IS NULL AND archived_at IS NULL;
  IF actual_count <> current_setting('rc19.expected_visible')::integer
    OR actual_count >= current_setting('rc19.expected_all')::integer
  THEN RAISE EXCEPTION 'RC19_MEMBER_READ_SCOPE_BROKEN'; END IF;
  foreign_report := nullif(current_setting('rc19.foreign_id', true), '');
  IF foreign_report IS NULL THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_FIXTURE_MISSING'; END IF;
  IF private.can_read_report(foreign_report)
    OR EXISTS (SELECT 1 FROM public.reports WHERE id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_revisions WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.report_images WHERE report_id = foreign_report)
    OR EXISTS (SELECT 1 FROM public.live_report_images WHERE report_id = foreign_report)
  THEN RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_READ_LEAK'; END IF;
  BEGIN
    PERFORM 1 FROM public.get_report_revisions(foreign_report);
    RAISE EXCEPTION 'RC19_MEMBER_FOREIGN_RPC_LEAK';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'REPORT_NOT_FOUND' THEN RAISE; END IF;
  END;
  own_report := nullif(current_setting('rc19.own_id', true), '');
  IF own_report IS NOT NULL THEN
    SELECT count(*) INTO direct_revisions
      FROM public.report_revisions WHERE report_id = own_report;
    SELECT count(*) INTO rpc_revisions
      FROM public.get_report_revisions(own_report);
    IF direct_revisions <> rpc_revisions
      THEN RAISE EXCEPTION 'RC19_MEMBER_OWN_RPC_MISMATCH'; END IF;
  END IF;
END $member_gate$;
ROLLBACK;

BEGIN READ ONLY;
-- leader: active reports, archive visibility and authorized revision RPC.
SELECT set_config('request.jwt.claim.sub',(
  SELECT auth_user_id::text FROM public.business_users
  WHERE system_permission = 'leader' AND status = 'active'
    AND account_status = 'active' AND auth_user_id IS NOT NULL
  ORDER BY id LIMIT 1
),true);
SELECT set_config('rc19.expected_active',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL
),true);
SELECT set_config('rc19.expected_archived',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NOT NULL OR archived_at IS NOT NULL
),true);
SELECT set_config('rc19.own_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SET LOCAL ROLE authenticated;
DO $elevated_gate$
DECLARE active_count integer; archive_count integer; allowed text;
DECLARE direct_count integer; rpc_count integer;
BEGIN
  IF private.current_system_permission() <> 'leader'
    OR NOT private.current_business_user_is_active()
  THEN RAISE EXCEPTION 'RC19_LEADER_ACTOR_INVALID'; END IF;
  SELECT count(*) INTO active_count FROM public.reports
    WHERE deleted_at IS NULL AND archived_at IS NULL;
  SELECT count(*) INTO archive_count FROM public.reports
    WHERE deleted_at IS NOT NULL OR archived_at IS NOT NULL;
  IF active_count <> current_setting('rc19.expected_active')::integer
    OR archive_count <> 0
  THEN RAISE EXCEPTION 'RC19_LEADER_VISIBILITY_MISMATCH'; END IF;
  allowed := nullif(current_setting('rc19.own_id', true), '');
  IF allowed IS NULL OR NOT private.can_read_report(allowed)
    THEN RAISE EXCEPTION 'RC19_LEADER_ALLOWED_FIXTURE_MISSING'; END IF;
  SELECT count(*) INTO direct_count FROM public.report_revisions WHERE report_id = allowed;
  SELECT count(*) INTO rpc_count FROM public.get_report_revisions(allowed);
  IF direct_count <> rpc_count
    THEN RAISE EXCEPTION 'RC19_LEADER_REVISION_RPC_MISMATCH'; END IF;
END $elevated_gate$;
ROLLBACK;

BEGIN READ ONLY;
-- admin: active reports, archive visibility and authorized revision RPC.
SELECT set_config('request.jwt.claim.sub',(
  SELECT auth_user_id::text FROM public.business_users
  WHERE system_permission = 'admin' AND status = 'active'
    AND account_status = 'active' AND auth_user_id IS NOT NULL
  ORDER BY id LIMIT 1
),true);
SELECT set_config('rc19.expected_active',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL
),true);
SELECT set_config('rc19.expected_archived',(
  SELECT count(*)::text FROM public.reports
  WHERE deleted_at IS NOT NULL OR archived_at IS NOT NULL
),true);
SELECT set_config('rc19.own_id',(
  SELECT id FROM public.reports
  WHERE deleted_at IS NULL AND archived_at IS NULL AND private.can_read_report(id)
  ORDER BY id LIMIT 1
),true);
SET LOCAL ROLE authenticated;
DO $elevated_gate$
DECLARE active_count integer; archive_count integer; allowed text;
DECLARE direct_count integer; rpc_count integer;
BEGIN
  IF private.current_system_permission() <> 'admin'
    OR NOT private.current_business_user_is_active()
  THEN RAISE EXCEPTION 'RC19_ADMIN_ACTOR_INVALID'; END IF;
  SELECT count(*) INTO active_count FROM public.reports
    WHERE deleted_at IS NULL AND archived_at IS NULL;
  SELECT count(*) INTO archive_count FROM public.reports
    WHERE deleted_at IS NOT NULL OR archived_at IS NOT NULL;
  IF active_count <> current_setting('rc19.expected_active')::integer
    OR archive_count <> current_setting('rc19.expected_archived')::integer
  THEN RAISE EXCEPTION 'RC19_ADMIN_VISIBILITY_MISMATCH'; END IF;
  allowed := nullif(current_setting('rc19.own_id', true), '');
  IF allowed IS NULL OR NOT private.can_read_report(allowed)
    THEN RAISE EXCEPTION 'RC19_ADMIN_ALLOWED_FIXTURE_MISSING'; END IF;
  SELECT count(*) INTO direct_count FROM public.report_revisions WHERE report_id = allowed;
  SELECT count(*) INTO rpc_count FROM public.get_report_revisions(allowed);
  IF direct_count <> rpc_count
    THEN RAISE EXCEPTION 'RC19_ADMIN_REVISION_RPC_MISMATCH'; END IF;
END $elevated_gate$;
ROLLBACK;

SELECT 'RC19_REPORT_RLS_STAGING_5_MEMBER_1_LEADER_1_ADMIN_SQL_SIM_PASS' AS rc19_result;
