\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN
  BEGIN
    PERFORM public.rc19_c515_request_overtime('missing-segment',statement_timestamp(),statement_timestamp()+interval '1 hour','weekday','day','test without an authenticated actor','receipt-1',pg_catalog.gen_random_uuid());
    RAISE EXCEPTION 'EXPECTED_OT_ACTOR_DENIAL_NOT_RAISED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'C515_OT_ACTOR_FORBIDDEN' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.rc19_c515_propose_cancellation_compensation('missing-shift','missing-staff','host','segment-1',NULL,'period-1','synthetic canceled shift','synthetic compensation proposal','receipt-1',1,pg_catalog.gen_random_uuid());
    RAISE EXCEPTION 'EXPECTED_COMPENSATION_ACTOR_DENIAL_NOT_RAISED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'C515_COMPENSATION_ACTOR_FORBIDDEN' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT p.proname, r.rolname AS owner, p.prosecdef AS security_definer, p.proconfig,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
WHERE p.proname IN ('rc19_c515_request_overtime','rc19_c515_decide_overtime_request',
  'rc19_c515_propose_cancellation_compensation','rc19_c515_decide_cancellation_compensation')
ORDER BY p.proname;
SELECT c.relname,c.relrowsecurity,
       has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('workforce_overtime_requests','workforce_cancellation_compensation_cases','workforce_payroll_adjustments')
ORDER BY c.relname;
