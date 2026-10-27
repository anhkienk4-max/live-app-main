-- Synthetic Postgres 17 fixture for RBAC-01. NO Production tokens or users.
\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.business_users (
 id text primary key, auth_user_id uuid unique, system_permission text not null,
 status text not null, account_status text not null,
 archived_at timestamptz, deleted_at timestamptz
);
INSERT INTO public.business_users(id,auth_user_id,system_permission,status,account_status)
VALUES
 ('synthetic-admin-a','00000000-0000-0000-0000-000000000011','admin','active','active'),
 ('synthetic-admin-b','00000000-0000-0000-0000-000000000012','admin','active','active'),
 ('synthetic-leader','00000000-0000-0000-0000-000000000002','leader','active','active'),
 ('synthetic-member','00000000-0000-0000-0000-000000000003','member','active','active'),
 ('synthetic-suspended','00000000-0000-0000-0000-000000000004','admin','inactive','active');
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
