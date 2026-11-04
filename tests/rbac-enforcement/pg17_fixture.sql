-- Deployable RBAC migrations on an isolated PostgreSQL 17 database only.
\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE TABLE public.business_users (
  id text PRIMARY KEY,
  auth_user_id uuid UNIQUE,
  system_permission text NOT NULL CHECK(system_permission IN ('member','leader','admin')),
  status text NOT NULL,
  account_status text NOT NULL,
  archived_at timestamptz,
  deleted_at timestamptz
);
INSERT INTO public.business_users(id,auth_user_id,system_permission,status,account_status) VALUES
 ('admin-a','00000000-0000-0000-0000-000000000011','admin','active','active'),
 ('admin-b','00000000-0000-0000-0000-000000000012','admin','active','active'),
 ('leader-a','00000000-0000-0000-0000-000000000021','leader','active','active'),
 ('member-a','00000000-0000-0000-0000-000000000031','member','active','active'),
 ('leader-inactive','00000000-0000-0000-0000-000000000022','leader','inactive','active');

CREATE OR REPLACE FUNCTION private.current_business_user_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id FROM public.business_users u WHERE u.auth_user_id=auth.uid()
    AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL LIMIT 1
$$;
CREATE OR REPLACE FUNCTION private.current_system_permission() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.system_permission FROM public.business_users u
  WHERE u.id=private.current_business_user_id()
$$;
GRANT USAGE ON SCHEMA public,auth,private TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(),private.current_business_user_id(),private.current_system_permission()
  TO anon,authenticated;

CREATE TABLE public.audit_logs (
  id text PRIMARY KEY,
  actor_business_user_id text,
  module text NOT NULL
);
INSERT INTO public.audit_logs(id,actor_business_user_id,module) VALUES
  ('log-reports','admin-a','reports'),('log-payroll','admin-a','payroll');
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.audit_logs TO authenticated;
CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT TO authenticated USING (
  private.current_system_permission()='admin'
  OR (private.current_system_permission()='leader'
    AND module IN ('calendar','live','reports','campaigns','swaps','imports'))
);

\i supabase/migrations/20261104085945_rc19_rbac01_role_permission_enforcement.sql
\i supabase/migrations/20261104085946_rc19_rbac02_account_permission_enforcement.sql

DO $$
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'RBAC_ENFORCEMENT_REQUIRES_POSTGRESQL_17';
  END IF;
  IF (SELECT enabled FROM private.rbac_runtime_gate WHERE id=true) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'RBAC_RUNTIME_GATE_MUST_START_DISABLED';
  END IF;
  IF (SELECT count(*) FROM private.rbac_permission_catalog) <> 39 THEN
    RAISE EXCEPTION 'RBAC_PERMISSION_CATALOG_PARITY_FAILED';
  END IF;
END;
$$;
