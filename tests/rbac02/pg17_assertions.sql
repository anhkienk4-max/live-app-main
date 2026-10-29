\set ON_ERROR_STOP on

-- The independent database gate starts OFF and blocks direct RPC writes.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $test$ DECLARE denied boolean:=false; latest jsonb;
BEGIN
  IF private.rbac01b_audit_team_allowed() IS DISTINCT FROM true THEN RAISE EXCEPTION 'GATE_OFF_CHANGED_BASELINE'; END IF;
  BEGIN PERFORM public.rbac02_list_account_overrides();
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'DB_GATE_OFF_LIST_ALLOWED'; END IF;
  denied:=false;
  BEGIN PERFORM public.rbac02_set_account_override('leader-a','audit.view_team','deny','test reason',NULL,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'DB_GATE_OFF_WRITE_ALLOWED'; END IF;
END $test$;
ROLLBACK;

-- Only a privileged disposable-test setup changes the DB gate.
UPDATE private.rbac02_runtime_gate SET enabled=true,changed_at=clock_timestamp() WHERE id=true;

-- Authenticated Admin can deny, reset, and ALLOW only within role baseline.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $test$
DECLARE result jsonb; denied boolean:=false; latest jsonb;
BEGIN
  SELECT value INTO latest FROM jsonb_array_elements(public.rbac02_list_account_overrides()) AS value
    WHERE value->>'target_id'='leader-a';
  IF latest->>'effective'<>'true' THEN RAISE EXCEPTION 'LEADER_BASELINE_NOT_ALLOWED'; END IF;
  result:=public.rbac02_set_account_override('leader-a','audit.view_team','deny','approved test restriction',NULL,0);
  IF (result->>'version')::int<>1 OR result->>'decision'<>'deny' OR result->>'effective'<>'false'
    THEN RAISE EXCEPTION 'DENY_OVERRIDE_RESULT_INVALID %',result; END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  IF public.rbac01_effective_permission('audit.view_team') IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'LEADER_RLS_HELPER_IGNORED_DENY'; END IF;
  BEGIN PERFORM public.get_audit_actor_page(1,20);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'LEADER_RPC_IGNORED_DENY'; END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
  result:=public.rbac02_reset_account_override('leader-a','audit.view_team','restore baseline test',1);
  IF (result->>'version')::int<>2 OR result->>'decision'<>'reset' OR result->>'effective'<>'true'
    THEN RAISE EXCEPTION 'RESET_RESULT_INVALID %',result; END IF;
  result:=public.rbac02_set_account_override('leader-a','audit.view_team','allow','restore leader grant',NULL,2);
  IF result->>'effective'<>'true' OR (result->>'version')::int<>3
    THEN RAISE EXCEPTION 'IN_BASELINE_ALLOW_FAILED %',result; END IF;
  result:=public.rbac02_set_account_override('leader-a','audit.view_team','deny','short expiry test',clock_timestamp()+interval '2 seconds',3);
  PERFORM pg_catalog.pg_sleep(2.1);
  SELECT value INTO latest FROM jsonb_array_elements(public.rbac02_list_account_overrides()) AS value
    WHERE value->>'target_id'='leader-a';
  IF latest->>'effective'<>'true' THEN RAISE EXCEPTION 'EXPIRED_LATEST_OVERRIDE_REVIVED_OLDER_DENY'; END IF;
  denied:=false;
  BEGIN PERFORM public.rbac02_set_account_override('leader-a','audit.view_team','deny','stale version test',NULL,3);
  EXCEPTION WHEN serialization_failure THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'STALE_VERSION_WAS_ACCEPTED'; END IF;
  SELECT value INTO latest FROM jsonb_array_elements(public.rbac02_list_account_overrides()) AS value
    WHERE value->>'target_id'='leader-a';
  IF latest->>'target_id'<>'leader-a' OR jsonb_array_length(latest->'history')<>4
    THEN RAISE EXCEPTION 'AUDIT_HISTORY_MISSING %',latest; END IF;
END $test$;
ROLLBACK;

-- Member, anon, inactive actors, forged role metadata and unsupported permissions deny.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT set_config('request.jwt.claim.user_metadata','{"system_permission":"admin"}',true);
DO $test$ DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.rbac02_set_account_override('leader-a','audit.view_team','deny','member forgery',NULL,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'MEMBER_DIRECT_RPC_BYPASS'; END IF;
  denied:=false;
  BEGIN PERFORM private.rbac02_effective_for_business_user('member-a','audit.view_team');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'AUTHENTICATED_CALLER_CAN_CHOOSE_TARGET'; END IF;
END $test$;
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
DO $test$ DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.rbac02_set_account_override('leader-a','audit.view_team','deny','inactive actor',NULL,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'INACTIVE_ACTOR_ACCEPTED'; END IF;
END $test$;
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $test$ DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.rbac02_set_account_override('leader-a','audit.view_team','deny','leader actor',NULL,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'LEADER_DIRECT_RPC_BYPASS'; END IF;
END $test$;
ROLLBACK;

BEGIN; SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $test$ DECLARE denied boolean:=false;
BEGIN
  BEGIN PERFORM public.rbac02_list_account_overrides();
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'ANON_RPC_GRANT'; END IF;
END $test$;
ROLLBACK;

-- Self edit, unsupported permission, Member target, inactive target and forged DB actor fail.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $test$ DECLARE denied boolean:=false; latest jsonb;
BEGIN
  BEGIN PERFORM public.rbac02_set_account_override('admin-a','audit.view_team','deny','self edit test',NULL,0);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'SELF_EDIT_ACCEPTED'; END IF;
  denied:=false;
  BEGIN PERFORM public.rbac02_set_account_override('leader-a','payroll.admin','allow','forged permission',NULL,0);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'UNSUPPORTED_PERMISSION_ACCEPTED'; END IF;
  denied:=false;
  BEGIN PERFORM public.rbac02_set_account_override('member-a','audit.view_team','allow','member escalation',NULL,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'MEMBER_TARGET_ACCEPTED'; END IF;
  denied:=false;
  BEGIN PERFORM public.rbac02_set_account_override('leader-disabled','audit.view_team','deny','inactive target',NULL,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'INACTIVE_TARGET_ACCEPTED'; END IF;
  IF has_table_privilege('authenticated','private.rbac02_account_permission_versions','SELECT')
    OR has_table_privilege('authenticated','private.rbac02_account_permission_versions','INSERT')
    THEN RAISE EXCEPTION 'PRIVATE_OVERRIDE_TABLE_EXPOSED'; END IF;
  denied:=false;
  BEGIN UPDATE private.rbac02_account_permission_versions SET reason='tamper';
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'DIRECT_REST_HISTORY_MUTATION'; END IF;
END $test$;
ROLLBACK;

-- A verified role-level DENY is a hard boundary; account ALLOW cannot bypass it.
WITH approved AS (
  INSERT INTO private.rbac01_role_default_versions
    (role,version,decisions,status,proposed_by,approved_by,approved_at)
  VALUES ('leader',1,'{"audit.view_team":"deny"}','approved','admin-a','admin-b',clock_timestamp())
  RETURNING *
)
INSERT INTO private.rbac01_audit_events(version_id,role,action,actor_business_user_id,at,after_state)
SELECT id,role,'approve',approved_by,approved_at,
  jsonb_build_object('status','approved','version',version) FROM approved;
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $test$ DECLARE denied boolean:=false; latest jsonb;
BEGIN
  SELECT value INTO latest FROM jsonb_array_elements(public.rbac02_list_account_overrides()) AS value
    WHERE value->>'target_id'='leader-a';
  IF latest->>'effective'<>'false' THEN RAISE EXCEPTION 'ROLE_DENY_OVERRIDDEN'; END IF;
  BEGIN PERFORM public.rbac02_set_account_override('leader-a','audit.view_team','allow','cannot override role deny',NULL,4);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'ACCOUNT_ALLOW_BYPASSED_ROLE_DENY'; END IF;
END $test$;
ROLLBACK;

DO $check$ BEGIN
  IF has_function_privilege('anon','public.rbac02_list_account_overrides()','EXECUTE')
    OR has_function_privilege('anon','public.rbac02_set_account_override(text,text,text,text,timestamptz,integer)','EXECUTE')
    THEN RAISE EXCEPTION 'ANON_FUNCTION_GRANT'; END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.rbac02_set_account_override(text,text,text,text,timestamptz,integer)'::regprocedure) IS DISTINCT FROM true
    OR NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL unnest(p.proconfig) config
      WHERE p.oid='public.rbac02_set_account_override(text,text,text,text,timestamptz,integer)'::regprocedure
        AND config LIKE 'search_path=%')
    THEN RAISE EXCEPTION 'SECURITY_DEFINER_OR_SEARCH_PATH_MISSING'; END IF;
  IF (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.rbac02_account_permission_versions'::regclass) IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'OVERRIDE_RLS_NOT_FORCED'; END IF;
END $check$;
SELECT 'RBAC02_POSTGRES17_ACCOUNT_OVERRIDE_SECURITY: PASS';
