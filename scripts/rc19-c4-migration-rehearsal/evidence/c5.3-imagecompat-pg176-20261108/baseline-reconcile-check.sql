WITH expected(signature, body_md5, function_acl) AS (
  VALUES
    ('private.guard_storage_resource_scope()','a7e953c68e8ca93f8b64dee8b448a56b','{postgres=X/postgres}'),
    ('private.guard_storage_resource_attendance()','f2bc24fa1ba4de9abd1ce6c65f1a5794','{postgres=X/postgres}'),
    ('private.audit_storage_resource_change()','0aee608717e10127e6856773669ca8c6','{postgres=X/postgres}'),
    ('private.guard_storage_resource_grant()','8a249f67a35ee28017a995f9eacd3113','{postgres=X/postgres}'),
    ('private.current_user_has_storage_resource_grant(text)','0b04c60fec0c305ddaa9201905461d9c','{postgres=X/postgres,authenticated=X/postgres}'),
    ('public.storage_resource_registry_create(jsonb,jsonb)','6089619af11d4e76301da410a376599c','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.storage_resource_registry_set_grant(text,text,boolean)','cea81d2bc7937abdd51cb87e38205df2','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
)
SELECT current_database() AS database_name,
       current_setting('server_version') AS postgresql_version,
       shobj_description(d.oid, 'pg_database') AS database_marker,
       expected.signature AS function_signature,
       md5(replace(replace(p.prosrc, E'\r\n', E'\n'), E'\r', E'\n')) AS normalized_body_md5,
       expected.body_md5 AS expected_body_md5,
       (p.prosecdef)::text AS security_definer,
       p.proconfig AS function_config,
       coalesce(p.proacl::text, 'default') AS actual_function_acl,
       expected.function_acl AS expected_function_acl
FROM pg_database d
CROSS JOIN expected
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
WHERE d.datname = current_database()
ORDER BY expected.signature;
