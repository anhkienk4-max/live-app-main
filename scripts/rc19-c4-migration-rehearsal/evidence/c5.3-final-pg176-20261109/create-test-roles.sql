\set ON_ERROR_STOP on
SET ROLE postgres;
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'postgres'
     OR current_setting('server_version') NOT LIKE '17.6 %'
     OR current_setting('port') <> '55437'
     OR position('/home/anhkienk4/.codex/pg17.6-c5.3-rehearsal/socket' IN current_setting('unix_socket_directories')) = 0
     OR inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'REFUSED_NONLOCAL_C5_3_ROLE_FIXTURE_TARGET';
  END IF;
  IF to_regrole('authenticator') IS NULL
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('supabase_admin','supabase_storage_admin','dashboard_user')) THEN
    RAISE EXCEPTION 'REFUSED_UNEXPECTED_C5_3_INFRA_ROLE_STATE';
  END IF;
END
$guard$;

-- Match observed Production attributes without copying login credentials into the lab.
CREATE ROLE supabase_admin WITH SUPERUSER CREATEDB CREATEROLE INHERIT NOLOGIN BYPASSRLS;
CREATE ROLE supabase_storage_admin WITH NOSUPERUSER NOCREATEDB CREATEROLE NOINHERIT NOLOGIN NOBYPASSRLS;
CREATE ROLE dashboard_user WITH NOSUPERUSER CREATEDB CREATEROLE INHERIT NOLOGIN NOBYPASSRLS;
GRANT supabase_storage_admin TO authenticator;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='supabase_admin' AND rolsuper AND rolcreatedb
      AND rolcreaterole AND rolinherit AND rolbypassrls AND NOT rolcanlogin
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='supabase_storage_admin' AND NOT rolsuper
      AND NOT rolcreatedb AND rolcreaterole AND NOT rolinherit AND NOT rolbypassrls AND NOT rolcanlogin
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='dashboard_user' AND NOT rolsuper
      AND rolcreatedb AND rolcreaterole AND rolinherit AND NOT rolbypassrls AND NOT rolcanlogin
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles parent ON parent.oid=m.roleid
    JOIN pg_roles child ON child.oid=m.member
    WHERE parent.rolname='supabase_storage_admin' AND child.rolname='authenticator'
      AND NOT m.admin_option
  ) THEN
    RAISE EXCEPTION 'C5_3_INFRA_ROLE_FIXTURE_MISMATCH';
  END IF;
END
$verify$;
COMMIT;

SELECT 'C5_3_LOCAL_NOLOGIN_INFRA_ROLES: PASS';
