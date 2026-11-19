-- READ-ONLY sanitized catalog snapshot. Run only against the explicitly selected project.
-- This file contains SELECT statements only; it never reads business row contents.
select current_setting('server_version') as postgres_version;
select count(*) as migration_count, max(version) as latest_version from supabase_migrations.schema_migrations;
select version, name from supabase_migrations.schema_migrations where version >= '20261101000000' order by version;
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname = any(array[
  'storage_resources','storage_resource_scopes','storage_resource_user_grants','storage_resource_edit_grants',
  'storage_resource_audit_events','attendance_photo_drive_folders','operational_storage_folder_locks',
  'operational_schedule_source_files','operational_storage_domain_folders','operational_storage_routes',
  'rc19_leader_brand_scopes','rc19_report_export_audit','report_artifact_delete_intents','shifts','reports','report_revisions','report_images'
]) order by c.relname;
select p.oid::regprocedure as function, r.rolname as owner, p.prosecdef as security_definer,
       p.proconfig as function_settings,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
where n.nspname in ('public','private') and (p.proname ilike '%storage_resource%' or p.proname ilike '%leader_brand%' or p.proname ilike '%report_export%' or p.proname ilike '%report_artifact_delete%')
order by 1;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename = any(array[
  'storage_resources','storage_resource_scopes','storage_resource_user_grants','storage_resource_audit_events','operational_storage_routes','shifts','reports','report_revisions','report_images'
]) order by tablename, policyname;
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name = any(array[
  'storage_resources','storage_resource_scopes','storage_resource_user_grants','storage_resource_audit_events','operational_storage_routes','shifts','reports','report_revisions','report_images'
]) and grantee in ('anon','authenticated','service_role') order by table_name,grantee,privilege_type;
select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in (
  'public.storage_resources'::regclass,'public.storage_resource_scopes'::regclass,
  'public.storage_resource_user_grants'::regclass,'public.storage_resource_audit_events'::regclass,
  'public.operational_storage_routes'::regclass,'public.shifts'::regclass
) order by 1,2;
select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('storage_resources','operational_storage_routes','shifts') order by tablename,indexname;
