-- pg_dump --no-privileges drops these Production Storage table and routine ACLs from the schema-only baseline.
BEGIN;
SET ROLE postgres;

DO $c5_3_acl_baseline$
DECLARE
  expected record;
  function_oid oid;
  actual_acl text;
  database_marker text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'C5_3_ACL_RECONCILIATION_REQUIRES_POSTGRES';
  END IF;

  SELECT shobj_description(oid, 'pg_database')
    INTO database_marker
    FROM pg_database
   WHERE datname = current_database();

  IF database_marker IS DISTINCT FROM 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY' THEN
    RAISE EXCEPTION 'C5_3_ACL_RECONCILIATION_REFUSED_DATABASE:%', current_database();
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      ('public.storage_resources','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'),
      ('public.storage_resource_scopes','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'),
      ('public.storage_resource_user_grants','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'),
      ('public.storage_resource_audit_events','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}')
    ) AS t(signature, expected_acl)
  LOOP
    SELECT coalesce(c.relacl::text, 'default') INTO actual_acl
      FROM pg_class c WHERE c.oid = to_regclass(expected.signature);
    IF actual_acl NOT IN ('default', expected.expected_acl) THEN
      RAISE EXCEPTION 'C5_3_ACL_RECONCILIATION_UNEXPECTED_TABLE_ACL:%:%', expected.signature, actual_acl;
    END IF;
  END LOOP;

  FOR expected IN
    SELECT * FROM (VALUES
      ('private.guard_storage_resource_scope()','a7e953c68e8ca93f8b64dee8b448a56b',true,'{postgres=X/postgres}'),
      ('private.guard_storage_resource_attendance()','f2bc24fa1ba4de9abd1ce6c65f1a5794',true,'{postgres=X/postgres}'),
      ('private.audit_storage_resource_change()','0aee608717e10127e6856773669ca8c6',true,'{postgres=X/postgres}'),
      ('private.guard_storage_resource_grant()','8a249f67a35ee28017a995f9eacd3113',false,'{postgres=X/postgres}'),
      ('private.current_user_has_storage_resource_grant(text)','0b04c60fec0c305ddaa9201905461d9c',true,'{postgres=X/postgres,authenticated=X/postgres}'),
      ('public.storage_resource_registry_create(jsonb,jsonb)','6089619af11d4e76301da410a376599c',false,'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
      ('public.storage_resource_registry_set_grant(text,text,boolean)','cea81d2bc7937abdd51cb87e38205df2',false,'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
    ) AS f(signature, body_md5, security_definer, function_acl)
  LOOP
    function_oid := to_regprocedure(expected.signature);
    IF function_oid IS NULL OR NOT EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_roles r ON r.oid = p.proowner
       WHERE p.oid = function_oid
         AND r.rolname = 'postgres'
         AND p.prosecdef = expected.security_definer
         AND p.proconfig @> ARRAY['search_path=""']
         AND md5(replace(replace(p.prosrc, E'\r\n', E'\n'), E'\r', E'\n')) = expected.body_md5
    ) THEN
      RAISE EXCEPTION 'C5_3_ACL_RECONCILIATION_FUNCTION_DRIFT:%', expected.signature;
    END IF;

    SELECT coalesce(proacl::text, 'default')
      INTO actual_acl
      FROM pg_proc
     WHERE oid = function_oid;

    IF actual_acl NOT IN ('default', expected.function_acl) THEN
      RAISE EXCEPTION 'C5_3_ACL_RECONCILIATION_UNEXPECTED_ACL:%:%', expected.signature, actual_acl;
    END IF;
  END LOOP;
END
$c5_3_acl_baseline$;

REVOKE ALL ON FUNCTION private.guard_storage_resource_scope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_storage_resource_attendance() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_storage_resource_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_storage_resource_grant() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.current_user_has_storage_resource_grant(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_resource_registry_create(jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_resource_registry_set_grant(text,text,boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.current_user_has_storage_resource_grant(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_resource_registry_create(jsonb,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_resource_registry_set_grant(text,text,boolean) TO authenticated, service_role;

REVOKE ALL ON TABLE public.storage_resources, public.storage_resource_scopes,
  public.storage_resource_user_grants, public.storage_resource_audit_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.storage_resources, public.storage_resource_scopes,
  public.storage_resource_user_grants TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.storage_resources,
  public.storage_resource_scopes, public.storage_resource_user_grants TO authenticated;
GRANT ALL ON TABLE public.storage_resource_audit_events TO service_role;
GRANT SELECT ON TABLE public.storage_resource_audit_events TO authenticated;

DO $c5_3_acl_baseline_verify$
DECLARE
  expected record;
  actual_acl text;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('private.guard_storage_resource_scope()','{postgres=X/postgres}'),
      ('private.guard_storage_resource_attendance()','{postgres=X/postgres}'),
      ('private.audit_storage_resource_change()','{postgres=X/postgres}'),
      ('private.guard_storage_resource_grant()','{postgres=X/postgres}'),
      ('private.current_user_has_storage_resource_grant(text)','{postgres=X/postgres,authenticated=X/postgres}'),
      ('public.storage_resource_registry_create(jsonb,jsonb)','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
      ('public.storage_resource_registry_set_grant(text,text,boolean)','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
    ) AS f(signature, function_acl)
  LOOP
    SELECT coalesce(proacl::text, 'default')
      INTO actual_acl
      FROM pg_proc
     WHERE oid = to_regprocedure(expected.signature);
    IF actual_acl IS DISTINCT FROM expected.function_acl THEN
      RAISE EXCEPTION 'C5_3_ACL_RECONCILIATION_VERIFY_FAILED:%:%', expected.signature, actual_acl;
    END IF;
  END LOOP;
END
$c5_3_acl_baseline_verify$;

DO $c5_3_table_acl_verify$
DECLARE expected record; actual_acl text;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('public.storage_resources','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'),
      ('public.storage_resource_scopes','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'),
      ('public.storage_resource_user_grants','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'),
      ('public.storage_resource_audit_events','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}')
    ) AS t(signature, expected_acl)
  LOOP
    SELECT coalesce(c.relacl::text, 'default') INTO actual_acl
      FROM pg_class c WHERE c.oid = to_regclass(expected.signature);
    IF actual_acl IS DISTINCT FROM expected.expected_acl THEN
      RAISE EXCEPTION 'C5_3_ACL_RECONCILIATION_VERIFY_TABLE_FAILED:%:%', expected.signature, actual_acl;
    END IF;
  END LOOP;
END
$c5_3_table_acl_verify$;
COMMIT;
