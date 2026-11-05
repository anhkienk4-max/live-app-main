-- Deployable RBAC migrations on an isolated PostgreSQL 17 database only.
\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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
 ('leader-b','00000000-0000-0000-0000-000000000022','leader','active','active'),
 ('member-a','00000000-0000-0000-0000-000000000031','member','active','active'),
 ('staff-x','00000000-0000-0000-0000-000000000041','member','active','active'),
 ('staff-y','00000000-0000-0000-0000-000000000042','member','active','active'),
 ('leader-inactive','00000000-0000-0000-0000-000000000023','leader','inactive','active');

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
CREATE OR REPLACE FUNCTION private.current_business_user_is_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.current_business_user_id() IS NOT NULL
$$;
GRANT USAGE ON SCHEMA public,auth,private TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(),private.current_business_user_id(),private.current_system_permission(),private.current_business_user_is_active()
  TO anon,authenticated;
ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_users TO authenticated;
CREATE POLICY business_users_admin_all ON public.business_users FOR ALL TO authenticated
  USING (private.current_system_permission()='admin') WITH CHECK (private.current_system_permission()='admin');

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
CREATE TABLE public.swap_requests (id text PRIMARY KEY, status text NOT NULL, approved_by text);
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.swap_requests TO authenticated;
CREATE POLICY swap_requests_disposable_test_scope ON public.swap_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.shift_registrations (
  id text PRIMARY KEY,
  shift_id text NOT NULL,
  user_id text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  reviewed_by text
);
ALTER TABLE public.shift_registrations ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.shift_registrations TO authenticated;
CREATE POLICY shift_registrations_disposable_test_scope ON public.shift_registrations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.shift_registrations(id,shift_id,user_id,source,status,reviewed_by)
VALUES ('assignment-removal','shift-rbac','member-a','self_registration','approved','leader-a');

CREATE TABLE public.brands (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  deleted_at timestamptz
);
INSERT INTO public.brands(id) VALUES ('brand-x'),('brand-y');
CREATE TABLE public.shifts (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES public.brands(id),
  status text NOT NULL,
  registration_locked boolean NOT NULL DEFAULT false,
  end_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  host_id text,
  support_id text,
  technical_id text,
  deleted_at timestamptz,
  archived_at timestamptz
);
INSERT INTO public.shifts(id,brand_id,status,registration_locked,host_id)
VALUES ('shift-x','brand-x','completed',true,'staff-x'),('shift-y','brand-y','completed',true,'staff-y');
INSERT INTO public.shift_registrations(id,shift_id,user_id,source,status,reviewed_by)
VALUES ('assignment-member-x','shift-x','member-a','self_registration','approved','leader-a');
CREATE TABLE public.reports (
  id text PRIMARY KEY,
  shift_id text NOT NULL REFERENCES public.shifts(id),
  submitted_by text,
  metrics_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'confirmed',
  deleted_at timestamptz,
  archived_at timestamptz
);
INSERT INTO public.reports(id,shift_id,submitted_by) VALUES
  ('report-x','shift-x','staff-x'),('report-y','shift-y','staff-y'),('report-member-x','shift-x','member-a');
UPDATE public.reports SET status='draft';
CREATE TABLE public.report_revisions(id text PRIMARY KEY,report_id text NOT NULL REFERENCES public.reports(id));
INSERT INTO public.report_revisions VALUES ('revision-x','report-x'),('revision-y','report-y');
CREATE TABLE public.report_images(id text PRIMARY KEY,report_id text NOT NULL REFERENCES public.reports(id),deleted_at timestamptz,uploaded_by text);
INSERT INTO public.report_images(id,report_id,deleted_at,uploaded_by) VALUES
  ('image-x','report-x',NULL,'leader-a'),('image-y','report-y',NULL,'staff-y'),
  ('image-member','report-member-x',NULL,'member-a');
CREATE TABLE public.live_report_images(id text PRIMARY KEY,report_id text REFERENCES public.reports(id),uploaded_by text);
INSERT INTO public.live_report_images(id,report_id,uploaded_by) VALUES
  ('live-image-x','report-x','leader-a'),('live-image-y','report-y','staff-y'),
  ('live-image-orphan',NULL,NULL);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_report_images ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.reports,public.report_revisions,public.report_images,public.live_report_images TO authenticated;

CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO authenticated;
CREATE TABLE storage.objects(id text PRIMARY KEY,bucket_id text NOT NULL,name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON storage.objects TO authenticated;
INSERT INTO storage.objects VALUES
  ('storage-x','report-images','reports/report-x/evidence.jpg'),
  ('storage-y','report-images','reports/report-y/evidence.jpg');

\i supabase/migrations/20261104085945_rc19_rbac01_role_permission_enforcement.sql
\i supabase/migrations/20261104085946_rc19_rbac02_account_permission_enforcement.sql
\i supabase/migrations/20261104093735_rc19_rbac03_supported_permission_enforcement.sql
\i supabase/migrations/20261104110000_rc19_c3_scoped_action_catalog.sql
\i supabase/migrations/20261104113000_rc19_c3_staffing_permission_guard.sql
-- Simulate a stale permissive policy surviving from an older deployment.
DROP POLICY IF EXISTS "report-images-authenticated-read" ON storage.objects;
CREATE POLICY "report-images-read" ON storage.objects FOR SELECT
  USING (bucket_id='report-images');
\i supabase/migrations/20261104120000_rc19_c3_leader_brand_scope_reports.sql
\i supabase/migrations/20261104120000_rc19_c3_leader_brand_scope_reports.sql

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
  IF EXISTS (SELECT 1 FROM private.rbac_permission_catalog WHERE permission NOT IN (
      'audit.view_team','shifts.view_assigned','shifts.assign_staff','shifts.import','shifts.export',
      'reports.submit','reports.review','swaps.request','swaps.approve','attendance.record_own',
      'storage.upload','storage.edit_own','storage.delete')
    AND (cardinality(role_override_roles)>0 OR cardinality(account_override_roles)>0 OR cardinality(account_allow_roles)>0)) THEN
    RAISE EXCEPTION 'UNENFORCED_PERMISSION_CATALOG_ENTRY_WAS_UNLOCKED';
  END IF;
  IF (SELECT role_override_roles FROM private.rbac_permission_catalog WHERE permission='audit.view_team') <> ARRAY['leader']::text[]
    OR (SELECT account_override_roles FROM private.rbac_permission_catalog WHERE permission='audit.view_team') <> ARRAY['leader']::text[]
    OR (SELECT account_allow_roles FROM private.rbac_permission_catalog WHERE permission='audit.view_team') <> ARRAY['leader']::text[] THEN
    RAISE EXCEPTION 'SUPPORTED_AUDIT_PERMISSION_CATALOG_INVALID';
  END IF;
  IF (SELECT role_override_roles FROM private.rbac_permission_catalog WHERE permission='reports.submit') <> ARRAY['member','leader','admin']::text[]
    OR (SELECT account_allow_roles FROM private.rbac_permission_catalog WHERE permission='reports.submit') <> ARRAY['leader']::text[]
    OR (SELECT role_override_roles FROM private.rbac_permission_catalog WHERE permission='swaps.approve') <> ARRAY['leader','admin']::text[] THEN
    RAISE EXCEPTION 'SCOPED_ACTION_CATALOG_INVALID';
  END IF;
END;
$$;
