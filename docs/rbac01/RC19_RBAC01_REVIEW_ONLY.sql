-- RBAC-01 #103: VERSIONED ROLE-DEFAULT DRAFT PROPOSAL, REVIEW ONLY.
-- NOT in supabase/migrations. DO NOT APPLY TO PRODUCTION.
-- Non-granting shadow store; approval of effective overrides is intentionally
-- BLOCKED until ALL server, RLS, RPC, provider and Finance controls are migrated.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.rbac01_role_default_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 role text NOT NULL CHECK (role IN ('member','leader','admin')),
 version integer NOT NULL CHECK (version > 0),
 decisions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(decisions) = 'object'),
 status text NOT NULL CHECK (status IN ('proposed','approved','rolled_back')),
 proposed_by text NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_by text,
 approved_at timestamptz,
 rolled_back_by text,
 rolled_back_at timestamptz,
 source_version bigint,
 comment text NOT NULL DEFAULT '',
 UNIQUE (role,version),
 CONSTRAINT rbac01_approved_actor_independence CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_by <> proposed_by)),
 CONSTRAINT rbac01_approved_immutable CHECK (status <> 'approved' OR (approved_at IS NOT NULL AND rolled_back_at IS NULL))
);
CREATE TABLE IF NOT EXISTS private.rbac01_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 version_id bigint NOT NULL REFERENCES private.rbac01_role_default_versions(id),
 role text NOT NULL,
 action text NOT NULL CHECK (action IN ('propose','approve','rollback')),
 actor_business_user_id text NOT NULL,
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
 after_state jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE private.rbac01_role_default_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac01_role_default_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE private.rbac01_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rbac01_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.rbac01_role_default_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON private.rbac01_audit_events FROM PUBLIC, anon, authenticated;
-- Only function-owner is permitted to read/write; never grant tables directly.
-- SECURITY DEFINER used only after explicit authenticated business user lookup.
CREATE OR REPLACE FUNCTION public.rbac01_list_role_defaults()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_actor text;
BEGIN
 SELECT u.id INTO v_actor FROM public.business_users u
 WHERE u.auth_user_id=auth.uid() AND u.system_permission='admin'
   AND u.status='active' AND u.account_status='active'
   AND u.archived_at IS NULL AND u.deleted_at IS NULL;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id DESC)
 FROM (SELECT id,role,version,decisions,status,proposed_by,proposed_at,
 approved_by,approved_at,rolled_back_by,rolled_back_at,source_version,comment
 FROM private.rbac01_role_default_versions ORDER BY id DESC LIMIT 100) v),'[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.rbac01_propose_role_defaults(
 p_role text, p_decisions jsonb, p_comment text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_actor text; v_next_version int; v_id bigint; v_key text; v_value text;
BEGIN
 SELECT u.id INTO v_actor FROM public.business_users u
 WHERE u.auth_user_id=auth.uid() AND u.system_permission='admin'
   AND u.status='active' AND u.account_status='active'
   AND u.archived_at IS NULL AND u.deleted_at IS NULL;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_role NOT IN ('member','leader','admin') OR p_role IS NULL
 OR p_decisions IS NULL OR jsonb_typeof(p_decisions)<>'object'
 OR length(coalesce(p_comment,''))>500
 THEN RAISE EXCEPTION 'RBAC01_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 -- DELIBERATELY NO ESCALATION: proposals can only request deny or inherit.
 -- Unknown, privileged or nonlegacy keys are rejected at SQL boundary.
 FOR v_key,v_value IN SELECT key,value FROM jsonb_each_text(p_decisions)
 LOOP
  IF v_value NOT IN ('deny','inherit') OR v_key NOT IN (
   'shifts.view_assigned','shifts.view_open','shifts.register','shifts.cancel_registration',
   'shifts.approve_registration','shifts.assign_staff','shifts.edit','shifts.delete',
   'shifts.lock','shifts.import','shifts.export','reports.submit','reports.review',
   'reports.export','swaps.request','swaps.approve','swaps.export','profile.edit_own',
   'brands.manage','platforms.manage','campaigns.manage','campaigns.edit_operational',
   'settings.member','settings.leader','audit.view','audit.view_team'
  ) THEN RAISE EXCEPTION 'RBAC01_PRIVILEGE_ESCALATION_OR_UNKNOWN' USING ERRCODE='42501'; END IF;
  -- Only stage deny of permissions currently held by the target role.
  IF v_value='deny' AND NOT (
   (p_role='member' AND v_key IN (
     'shifts.view_assigned','shifts.view_open','shifts.register','shifts.cancel_registration',
     'reports.submit','swaps.request','profile.edit_own','settings.member'))
   OR (p_role='leader' AND v_key IN (
     'shifts.view_assigned','shifts.view_open','shifts.register','shifts.cancel_registration',
     'reports.submit','swaps.request','profile.edit_own','settings.member',
     'shifts.approve_registration','shifts.assign_staff','shifts.edit','shifts.lock',
     'shifts.import','shifts.export','reports.review','reports.export','swaps.approve',
     'swaps.export','settings.leader','campaigns.edit_operational','audit.view_team'))
   OR (p_role='admin' AND v_key IN (
     'shifts.view_assigned','shifts.view_open','shifts.register','shifts.cancel_registration',
     'reports.submit','swaps.request','profile.edit_own','settings.member',
     'shifts.approve_registration','shifts.assign_staff','shifts.edit','shifts.lock',
     'shifts.import','shifts.export','reports.review','reports.export','swaps.approve',
     'swaps.export','settings.leader','campaigns.edit_operational','audit.view_team',
     'brands.manage','platforms.manage','campaigns.manage','audit.view'))
  ) THEN RAISE EXCEPTION 'RBAC01_NOT_A_LEGACY_GRANT' USING ERRCODE='42501'; END IF;
 END LOOP;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:'||p_role,0));
 SELECT COALESCE(max(version),0)+1 INTO v_next_version
 FROM private.rbac01_role_default_versions WHERE role=p_role;
 INSERT INTO private.rbac01_role_default_versions (role,version,decisions,status,proposed_by,comment)
 VALUES (p_role,v_next_version,p_decisions,'proposed',v_actor,coalesce(p_comment,'')) RETURNING id INTO v_id;
 INSERT INTO private.rbac01_audit_events (version_id,role,action,actor_business_user_id,after_state)
 VALUES(v_id,p_role,'propose',v_actor,jsonb_build_object('status','proposed','version',v_next_version,'decisions',p_decisions));
 RETURN jsonb_build_object('id',v_id,'role',p_role,'version',v_next_version,'status','proposed','effective',false);
END; $$;

CREATE OR REPLACE FUNCTION public.rbac01_approve_role_defaults(p_version_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 -- This is a security barrier, NOT a TODO to remove casually.
 -- No approval/activation until DB RLS/RPC and server enforcement parity proven.
 RAISE EXCEPTION 'RBAC01_ENFORCEMENT_NOT_ATTESTED' USING ERRCODE='42501';
END; $$;

CREATE OR REPLACE FUNCTION public.rbac01_rollback_role_defaults(p_version_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_actor text; v_role text; v_before jsonb;
BEGIN
 SELECT u.id INTO v_actor FROM public.business_users u
 WHERE u.auth_user_id=auth.uid() AND u.system_permission='admin'
 AND u.status='active' AND u.account_status='active'
 AND u.archived_at IS NULL AND u.deleted_at IS NULL;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT v.role,to_jsonb(v) INTO v_role,v_before FROM private.rbac01_role_default_versions v
 WHERE v.id=p_version_id AND v.status='proposed' FOR UPDATE;
 IF v_role IS NULL THEN RAISE EXCEPTION 'RBAC01_ROLLBACK_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
 UPDATE private.rbac01_role_default_versions SET status='rolled_back',rolled_back_by=v_actor,
 rolled_back_at=clock_timestamp() WHERE id=p_version_id;
 INSERT INTO private.rbac01_audit_events(version_id,role,action,actor_business_user_id,before_state,after_state)
 VALUES(p_version_id,v_role,'rollback',v_actor,v_before,jsonb_build_object('status','rolled_back'));
 RETURN jsonb_build_object('id',p_version_id,'status','rolled_back','effective',false);
END; $$;

REVOKE ALL ON FUNCTION public.rbac01_list_role_defaults() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rbac01_propose_role_defaults(text,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rbac01_approve_role_defaults(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rbac01_rollback_role_defaults(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rbac01_list_role_defaults() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac01_propose_role_defaults(text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac01_approve_role_defaults(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac01_rollback_role_defaults(bigint) TO authenticated;
COMMIT;
