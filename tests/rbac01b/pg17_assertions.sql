\set ON_ERROR_STOP on

-- A. No approved version: original Admin(4)/Leader(3)/Member(0) read scope unchanged.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $test$ DECLARE n int; d jsonb;
BEGIN
 SELECT count(*) INTO n FROM public.audit_logs;
 IF n<>3 THEN RAISE EXCEPTION 'LEGACY_LEADER_SCOPE_CHANGED %',n; END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE module='staff')<>0
 THEN RAISE EXCEPTION 'CROSS_MODULE_SCOPE_LEAK'; END IF;
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'LEGACY_PERMISSION_MISMATCH'; END IF;
 d:=public.get_audit_actor_page(1,20);
 IF (d->>'total')::integer<>2 THEN RAISE EXCEPTION 'LEGACY_DIRECT_RPC_CHANGED %',d; END IF;
END $test$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $test$ DECLARE n int; blocked boolean:=false;
BEGIN
 SELECT count(*) INTO n FROM public.audit_logs;
 IF n<>0 THEN RAISE EXCEPTION 'MEMBER_DIRECT_REST_LEAK %',n; END IF;
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'MEMBER_GRANT_BYPASS'; END IF;
 BEGIN PERFORM public.get_audit_actor_page(1,20);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'MEMBER_DIRECT_RPC_BYPASS'; END IF;
 blocked:=false;
 BEGIN PERFORM public.rbac01_effective_permission('staff.manage');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'UNSUPPORTED_PERMISSION_BYPASS'; END IF;
END $test$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $test$ DECLARE n int; d jsonb;
BEGIN
 SELECT count(*) INTO n FROM public.audit_logs;
 IF n<>4 THEN RAISE EXCEPTION 'ADMIN_SCOPE_CHANGED'; END IF;
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'ADMIN_BYPASS_CHANGED'; END IF;
 d:=public.get_audit_actor_page(1,20);
 IF (d->>'total')::integer<>3 THEN RAISE EXCEPTION 'ADMIN_RPC_SCOPE_CHANGED %',d; END IF;
END $test$;
ROLLBACK;

-- Test-only seed of independent approver. The real approval RPC remains always-deny.
WITH approved AS (
 INSERT INTO private.rbac01_role_default_versions
 (role,version,decisions,status,proposed_by,approved_by,approved_at)
 VALUES ('leader',1,'{"audit.view_team":"deny"}','approved','admin-a','admin-b',clock_timestamp())
 RETURNING *
)
INSERT INTO private.rbac01_audit_events(version_id,role,action,actor_business_user_id,at,after_state)
SELECT id,role,'approve',approved_by,approved_at,
       jsonb_build_object('status','approved','version',version)
FROM approved;

-- B. New request/session resolves most recent approved version immediately.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $test$ DECLARE n int; blocked boolean:=false;
BEGIN
 SELECT count(*) INTO n FROM public.audit_logs;
 IF n<>0 THEN RAISE EXCEPTION 'REVOKED_LEADER_DIRECT_REST_LEAK %',n; END IF;
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'REVOKED_ROLE_STILL_ALLOWED'; END IF;
 BEGIN PERFORM public.get_audit_actor_page(1,20);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'REVOKED_DIRECT_RPC_BYPASS'; END IF;
END $test$;
ROLLBACK;

-- B2. APPROVED DELTA for another permission MUST NOT override older audit DENY.
WITH approved AS (
 INSERT INTO private.rbac01_role_default_versions
 (role,version,decisions,status,proposed_by,approved_by,approved_at)
 VALUES ('leader',2,'{"shifts.view_open":"deny"}','approved','admin-a','admin-b',clock_timestamp())
 RETURNING *
)
INSERT INTO private.rbac01_audit_events(version_id,role,action,actor_business_user_id,at,after_state)
SELECT id,role,'approve',approved_by,approved_at,jsonb_build_object('status','approved','version',version) FROM approved;
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $test$ BEGIN
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
 OR (SELECT count(*) FROM public.audit_logs)<>0
 THEN RAISE EXCEPTION 'DELTA_LOST_PRIOR_DENY'; END IF;
END $test$;
ROLLBACK;

-- C. Client-side forged metadata can't defeat authoritative business user/approved version.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT set_config('request.jwt.claim.user_metadata','{"system_permission":"admin"}',true);
DO $test$ BEGIN
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'FORGED_USER_METADATA_ESCALATED'; END IF;
 IF (SELECT count(*) FROM public.audit_logs)<>0
 THEN RAISE EXCEPTION 'FORGED_JWT_METADATA_LEAK'; END IF;
END $test$;
ROLLBACK;

-- D. Other roles and modules remain identical after Leader's deny.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.audit_logs)<>4
 THEN RAISE EXCEPTION 'ADMIN_CHANGE_AFTER_LEADER_DENY'; END IF;
END $test$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
DO $test$ BEGIN
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'INACTIVE_USER_GRANT'; END IF;
 IF (SELECT count(*) FROM public.audit_logs)<>0
 THEN RAISE EXCEPTION 'INACTIVE_USER_READ'; END IF;
END $test$;
ROLLBACK;

-- E. Missing approval provenance is DENY, even for an apparent INHERIT.
INSERT INTO private.rbac01_role_default_versions
(role,version,decisions,status,proposed_by,approved_by,approved_at,source_version)
VALUES ('leader',3,'{"audit.view_team":"inherit"}','approved','admin-a','admin-b',clock_timestamp(),1);
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $test$ BEGIN
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
 OR (SELECT count(*) FROM public.audit_logs)<>0
 THEN RAISE EXCEPTION 'MISSING_APPROVAL_PROVENANCE_GRANTED'; END IF;
END $test$;
ROLLBACK;

-- F. Invalid decision is DENY, never silently inherit/allow.
WITH approved AS (
 INSERT INTO private.rbac01_role_default_versions
 (role,version,decisions,status,proposed_by,approved_by,approved_at)
 VALUES ('leader',4,'{"audit.view_team":"unexpected_allow"}','approved','admin-a','admin-b',clock_timestamp())
 RETURNING *
)
INSERT INTO private.rbac01_audit_events(version_id,role,action,actor_business_user_id,at,after_state)
SELECT id,role,'approve',approved_by,approved_at,jsonb_build_object('status','approved','version',version) FROM approved;
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $test$ BEGIN
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
 OR (SELECT count(*) FROM public.audit_logs)<>0
 THEN RAISE EXCEPTION 'INVALID_DECISION_WAS_GRANTED'; END IF;
END $test$;
ROLLBACK;

-- G. Explicit independently approved INHERIT restores legacy scope.
WITH approved AS (
 INSERT INTO private.rbac01_role_default_versions
 (role,version,decisions,status,proposed_by,approved_by,approved_at,source_version)
 VALUES ('leader',5,'{"audit.view_team":"inherit"}','approved','admin-a','admin-b',clock_timestamp(),1)
 RETURNING *
)
INSERT INTO private.rbac01_audit_events(version_id,role,action,actor_business_user_id,at,after_state)
SELECT id,role,'approve',approved_by,approved_at,jsonb_build_object('status','approved','version',version) FROM approved;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $test$ BEGIN
 IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM true
 OR (SELECT count(*) FROM public.audit_logs)<>3
 THEN RAISE EXCEPTION 'RESTORE_INHERIT_FAILED'; END IF;
 IF (public.get_audit_actor_page(1,20)->>'total')::integer<>2
 THEN RAISE EXCEPTION 'RESTORE_RPC_FAILED'; END IF;
END $test$;
ROLLBACK;

DO $check$ BEGIN
 IF has_function_privilege('anon','public.rbac01_effective_permission(text)','EXECUTE')
 THEN RAISE EXCEPTION 'ANON_RPC_LEAK'; END IF;
 IF has_table_privilege('authenticated','private.rbac01_role_default_versions','SELECT')
 THEN RAISE EXCEPTION 'PRIVATE_CONFIG_TABLE_LEAK'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.get_audit_actor_page(integer,integer)'::regprocedure)
 THEN RAISE EXCEPTION 'ACTOR_RPC_BYPASS_RLS'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE tablename='audit_logs' AND policyname='audit_logs_read')<>1
 THEN RAISE EXCEPTION 'LEGACY_POLICY_DUPE_OR_MISSING'; END IF;
END $check$;
SELECT 'RBAC01B_POSTGRES17_AUDIT_TEAM: PASS';
