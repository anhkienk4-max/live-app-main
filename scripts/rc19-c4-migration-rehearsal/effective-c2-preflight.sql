DO $c2_reconciliation_preflight$
DECLARE
  expected record;
  relation_oid oid;
  actual text;
  expected_function record;
  function_oid oid;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'C2_RECONCILIATION_REQUIRES_POSTGRES_ROLE';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103195519') THEN
    RAISE EXCEPTION 'C2_RECONCILIATION_MIGRATION_HISTORY_CONFLICT';
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      ('storage_resources','105ec8409832205206cd22adbadf0bba','f0791d291f707f95c4d8ee24ae13f865','f22d57d29b6e69408ee54753618b0fb2','6456f697a2150fdd3a283d5b0b9d0eac','cefd04f743fd0e1b1089dda10aacaf0b'),
      ('storage_resource_scopes','a7532f2b3dd3735c597ec0abe9e83911','bf371993f1afa96cca9af1ee600912f7','224327c5d4095bb2cba1590710de640e','d34dabdb26f9d126af03c7fdcfd523cd','79190cb4cdf0373e69e3201cbc5fa888'),
      ('storage_resource_user_grants','ab8841118f6f0e993b71ce321caef224','bace05a1da4e5593016feded01fef940','916f125b888fcbbe322f035f223632b0','aaa71533b6d0c4235bbda4c369336118','75633994753540dea13c0d86b7e318e0'),
      ('storage_resource_audit_events','98a587f00edebef18c85cdb9a411206b','d0f877092579d65540cb05751b9c46ef','072f191d054b4765610316251a1c7a71','1c969ec4d6a86828abaf104674a13315','')
    ) AS b(table_name, columns_fp, constraints_fp, indexes_fp, policies_fp, triggers_fp)
  LOOP
    relation_oid := to_regclass(format('public.%I', expected.table_name));
    IF relation_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=relation_oid AND relrowsecurity
        AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres'
    ) THEN
      RAISE EXCEPTION 'C2_RECONCILIATION_TABLE_SECURITY_MISMATCH:%', expected.table_name;
    END IF;
    SELECT md5(string_agg(a.attnum||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||
      a.attnotnull::text||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),''), E'\n' ORDER BY a.attnum))
      INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=relation_oid AND a.attnum>0 AND NOT a.attisdropped;
    IF actual IS DISTINCT FROM expected.columns_fp THEN
      RAISE EXCEPTION 'C2_RECONCILIATION_COLUMNS_MISMATCH:%', expected.table_name;
    END IF;
    SELECT md5(string_agg(conname||'|'||contype::text||'|'||pg_get_constraintdef(oid,true),
      E'\n' ORDER BY conname)) INTO actual FROM pg_constraint WHERE conrelid=relation_oid;
    IF actual IS DISTINCT FROM expected.constraints_fp OR EXISTS (
      SELECT 1 FROM pg_constraint WHERE conrelid=relation_oid AND NOT convalidated
    ) THEN
      RAISE EXCEPTION 'C2_RECONCILIATION_CONSTRAINTS_MISMATCH:%', expected.table_name;
    END IF;
    SELECT md5(string_agg(indexrelid::regclass::text||'|'||pg_get_indexdef(indexrelid),
      E'\n' ORDER BY indexrelid::regclass::text)) INTO actual FROM pg_index WHERE indrelid=relation_oid;
    IF actual IS DISTINCT FROM expected.indexes_fp THEN
      RAISE EXCEPTION 'C2_RECONCILIATION_INDEXES_MISMATCH:%', expected.table_name;
    END IF;
    SELECT md5(string_agg(p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'||
      (SELECT array_to_string(array_agg(r.rolname ORDER BY r.rolname),',')
       FROM unnest(p.polroles) x(role_oid) JOIN pg_roles r ON r.oid=x.role_oid)||'|'||
      coalesce(pg_get_expr(p.polqual,p.polrelid,true),'')||'|'||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid,true),''), E'\n' ORDER BY p.polname))
      INTO actual FROM pg_policy p WHERE p.polrelid=relation_oid;
    IF actual IS DISTINCT FROM expected.policies_fp THEN
      RAISE EXCEPTION 'C2_RECONCILIATION_POLICIES_MISMATCH:%', expected.table_name;
    END IF;
    SELECT md5(string_agg(tgname||'|'||pg_get_triggerdef(oid,true)||'|'||tgenabled::text,
      E'\n' ORDER BY tgname)) INTO actual
      FROM pg_trigger WHERE tgrelid=relation_oid AND NOT tgisinternal;
    IF actual IS DISTINCT FROM nullif(expected.triggers_fp,'') THEN
      RAISE EXCEPTION 'C2_RECONCILIATION_TRIGGERS_MISMATCH:%', expected.table_name;
    END IF;
  END LOOP;

  IF to_regclass('public.storage_resource_edit_grants') IS NOT NULL
     OR to_regclass('public.attendance_photo_drive_folders') IS NOT NULL
     OR to_regclass('public.operational_storage_folder_locks') IS NOT NULL
     OR to_regprocedure('private.current_user_can_edit_storage_resource(text)') IS NOT NULL
     OR to_regprocedure('public.storage_resource_registry_editable_ids()') IS NOT NULL
     OR to_regprocedure('public.storage_resource_registry_set_edit_grant(text,text,text)') IS NOT NULL
     OR to_regprocedure('public.storage_resource_registry_edit(text,text)') IS NOT NULL
     OR to_regprocedure('public.acquire_operational_storage_folder_lock(text,uuid,integer)') IS NOT NULL
     OR to_regprocedure('public.release_operational_storage_folder_lock(text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'C2_RECONCILIATION_UNEXPECTED_PARTIAL_OBJECTS';
  END IF;

  FOR expected_function IN
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
    function_oid := to_regprocedure(expected_function.signature);
    IF function_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid=function_oid AND r.rolname='postgres'
        AND p.prosecdef=expected_function.security_definer
        AND p.proconfig @> ARRAY['search_path=""']
        AND md5(replace(replace(p.prosrc, E'\r\n', E'\n'), E'\r', E'\n'))=expected_function.body_md5
        AND coalesce(p.proacl::text,'default')=expected_function.function_acl
    ) THEN
      RAISE EXCEPTION 'C2_RECONCILIATION_FUNCTION_MISMATCH:%', expected_function.signature;
    END IF;
  END LOOP;

  IF (SELECT relacl::text FROM pg_class WHERE oid='public.storage_resources'::regclass)
       IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'
     OR (SELECT relacl::text FROM pg_class WHERE oid='public.storage_resource_scopes'::regclass)
       IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'
     OR (SELECT relacl::text FROM pg_class WHERE oid='public.storage_resource_user_grants'::regclass)
       IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'
     OR (SELECT relacl::text FROM pg_class WHERE oid='public.storage_resource_audit_events'::regclass)
       IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}' THEN
    RAISE EXCEPTION 'C2_RECONCILIATION_GRANTS_MISMATCH';
  END IF;

  IF EXISTS (SELECT 1 FROM public.storage_resources WHERE visibility='public')
     OR EXISTS (SELECT 1 FROM public.storage_resource_audit_events
       WHERE action NOT IN ('resource_insert','resource_update','resource_delete',
         'scope_insert','scope_update','scope_delete','grant_insert','grant_update','grant_delete')) THEN
    RAISE EXCEPTION 'C2_RECONCILIATION_EXISTING_DATA_INCOMPATIBLE';
  END IF;
END
$c2_reconciliation_preflight$;
