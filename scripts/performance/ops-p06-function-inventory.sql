-- P0.6 Database FUNCTION CATALOG parity. STRICTLY READ-ONLY.
-- Execute separately on Production and Clean Staging. Compare by signature,
-- then compare fingerprint and grants (body equality != semantic equality).
-- Does not return source code, personal records, secrets or salaries.
select
 n.nspname || '.' || p.proname || '(' ||
   pg_get_function_identity_arguments(p.oid) || ')' as signature,
 md5(pg_get_functiondef(p.oid)) as definition_md5,
 p.prosecdef as security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private')
order by signature;
