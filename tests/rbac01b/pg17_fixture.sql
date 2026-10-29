\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.business_users(
 id text primary key, auth_user_id uuid unique, system_permission text not null,
 status text not null, account_status text not null,
 archived_at timestamptz, deleted_at timestamptz
);
INSERT INTO public.business_users(id,auth_user_id,system_permission,status,account_status)
VALUES
 ('admin-a','00000000-0000-0000-0000-000000000011','admin','active','active'),
 ('admin-b','00000000-0000-0000-0000-000000000012','admin','active','active'),
 ('leader-a','00000000-0000-0000-0000-000000000002','leader','active','active'),
 ('member-a','00000000-0000-0000-0000-000000000003','member','active','active'),
 ('leader-disabled','00000000-0000-0000-0000-000000000004','leader','inactive','active');
CREATE OR REPLACE FUNCTION private.current_system_permission() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT u.system_permission FROM public.business_users u WHERE u.auth_user_id=auth.uid() AND
  u.status='active' AND u.account_status='active' AND u.deleted_at IS NULL AND u.archived_at IS NULL LIMIT 1 $$;
CREATE OR REPLACE FUNCTION private.current_business_user_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT u.id FROM public.business_users u WHERE u.auth_user_id=auth.uid() AND
  u.status='active' AND u.account_status='active' AND u.deleted_at IS NULL AND u.archived_at IS NULL LIMIT 1 $$;
CREATE OR REPLACE FUNCTION private.is_leader_or_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(private.current_system_permission() IN ('leader','admin'),false) $$;
CREATE TABLE public.audit_logs (
 id text PRIMARY KEY, actor_business_user_id text,actor_name text,module text not null
);
INSERT INTO public.audit_logs(id,actor_business_user_id,actor_name,module)
VALUES ('a-calendar','leader-a','Leader','calendar'),
('b-reports','leader-a','Leader','reports'),
('c-swaps','member-a','Member','swaps'),
('d-staff','admin-a','Admin','staff');
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT TO authenticated USING (
 (SELECT private.current_system_permission())='admin'
 OR ((SELECT private.current_system_permission())='leader'
 AND module=ANY(ARRAY['calendar','live','reports','campaigns','swaps','imports']::text[]))
);
GRANT USAGE ON SCHEMA auth,private,public TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
GRANT EXECUTE ON FUNCTION private.current_business_user_id(),
 private.current_system_permission(),private.is_leader_or_admin() TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
