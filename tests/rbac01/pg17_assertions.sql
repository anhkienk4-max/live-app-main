\set ON_ERROR_STOP on

-- User with no valid privilege cannot list or propose even with spoofed inputs.
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $t$ DECLARE blocked boolean:=false;
BEGIN
 BEGIN PERFORM public.rbac01_list_role_defaults();
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'MEMBER_LIST_BYPASS'; END IF;
 blocked:=false;
 BEGIN PERFORM public.rbac01_propose_role_defaults('admin','{"shifts.register":"deny"}','forged role');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'MEMBER_PROPOSE_BYPASS'; END IF;
END $t$;
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $t$ DECLARE blocked boolean:=false; BEGIN
 BEGIN PERFORM public.rbac01_propose_role_defaults('member','{"shifts.register":"deny"}','forged admin');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'LEADER_PROPOSE_BYPASS'; END IF;
END $t$;
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
DO $t$ DECLARE blocked boolean:=false; BEGIN
 BEGIN PERFORM public.rbac01_list_role_defaults();
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'INACTIVE_ADMIN_BYPASS'; END IF;
END $t$;
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $t$ DECLARE v jsonb; v_id bigint; blocked boolean; c int;
BEGIN
 v:=public.rbac01_propose_role_defaults('member','{"shifts.register":"deny"}','safe synthetic proposal');
 v_id:=(v->>'id')::bigint;
 IF v->>'status'<>'proposed' OR v->>'effective'<>'false' OR v->>'version'<>'1' THEN
 RAISE EXCEPTION 'SHADOW_PROPOSAL_INVALID'; END IF;
 v:=public.rbac01_list_role_defaults();
 IF jsonb_array_length(v)<>1 THEN RAISE EXCEPTION 'ADMIN_CANNOT_READ_VERSION_HISTORY'; END IF;
 blocked:=false;
 BEGIN PERFORM public.rbac01_propose_role_defaults('member','{"staff.manage":"allow"}','forged escalation');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'ROLE_ESCALATION_ALLOWED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.rbac01_propose_role_defaults('admin','{"permissions.manage":"deny"}','last-admin attack');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'ADMIN_BOOTSTRAP_REMOVAL_ALLOWED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.rbac01_propose_role_defaults('member','{"service_role":"allow"}','provider attack');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'SERVICE_ROLE_GRANT_ALLOWED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.rbac01_approve_role_defaults(v_id);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'APPROVAL_ENABLED_WITHOUT_RLS_ATTESTATION'; END IF;
 v:=public.rbac01_rollback_role_defaults(v_id);
 IF v->>'status'<>'rolled_back' OR v->>'effective'<>'false' THEN RAISE EXCEPTION 'ROLLBACK_FAILED'; END IF;
 v:=public.rbac01_list_role_defaults();
 IF v->0->>'status'<>'rolled_back' THEN RAISE EXCEPTION 'VERSION_NOT_ROLLED_BACK'; END IF;
 blocked:=false;
 BEGIN PERFORM public.rbac01_rollback_role_defaults(v_id);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'REPLAY_ROLLBACK_ALLOWED'; END IF;
END $t$;
ROLLBACK;

-- RLS and grants assertions independent of synthetic Admin's shadow actions.
DO $check$ BEGIN
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
         WHERE oid='private.rbac01_role_default_versions'::regclass)
 OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
         WHERE oid='private.rbac01_audit_events'::regclass)
 THEN RAISE EXCEPTION 'RBAC01_RLS_NOT_FORCED'; END IF;
 IF has_table_privilege('authenticated','private.rbac01_role_default_versions','SELECT')
 OR has_table_privilege('authenticated','private.rbac01_role_default_versions','UPDATE')
 OR has_table_privilege('authenticated','private.rbac01_audit_events','SELECT')
 THEN RAISE EXCEPTION 'PRIVATE_TABLE_GRANT_LEAK'; END IF;
 IF has_function_privilege('anon','public.rbac01_propose_role_defaults(text,jsonb,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.rbac01_propose_role_defaults(text,jsonb,text)','EXECUTE')
 THEN RAISE EXCEPTION 'RPC_EXECUTE_GRANT_INVALID'; END IF;
END $check$;
SELECT 'RBAC01_POSTGRES17_SECURITY_PROPOSAL: PASS';
