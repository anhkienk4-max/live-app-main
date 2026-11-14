DO $$
BEGIN
  IF current_database() <> 'c12_audit_rehearsal'
    OR shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database') <> 'CODEX_DISPOSABLE_C12_AUDIT_PG17' THEN
    RAISE EXCEPTION 'C12_DATABASE_IDENTITY_GUARD_FAILED';
  END IF;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public, private TO authenticated;

CREATE FUNCTION private.rbac_has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT coalesce(current_setting('c12.' || replace(p_permission, '.', '_'), true), 'false')::boolean $$;
GRANT EXECUTE ON FUNCTION private.rbac_has_permission(text) TO authenticated;

CREATE TABLE public.audit_logs (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  actor_auth_user_id uuid,
  actor_business_user_id text,
  actor_name text,
  actor_role text,
  module text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_name text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[] NOT NULL DEFAULT '{}',
  reason text,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'success',
  error_code text,
  correlation_id text NOT NULL DEFAULT gen_random_uuid()::text,
  related_records jsonb,
  metadata jsonb NOT NULL DEFAULT '{}',
  entity_exists boolean NOT NULL DEFAULT true
);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT TO authenticated USING (
  private.rbac_has_permission('audit.view')
  OR (private.rbac_has_permission('audit.view_team') AND module IN ('calendar','live','reports','campaigns','swaps','imports'))
);
GRANT SELECT ON public.audit_logs TO authenticated;

INSERT INTO public.audit_logs (id, created_at, actor_business_user_id, actor_name, actor_role, module, action, entity_type, entity_id, entity_name, after_data)
SELECT 'audit-' || lpad(n::text, 5, '0'),
  statement_timestamp() - (n / 10) * interval '1 second',
  CASE WHEN n % 2 = 0 THEN 'leader-1' ELSE 'admin-1' END,
  CASE WHEN n % 2 = 0 THEN 'Leader One' ELSE 'Admin One' END,
  CASE WHEN n % 2 = 0 THEN 'leader' ELSE 'admin' END,
  CASE WHEN n % 45000 < 30000 THEN 'calendar' ELSE 'settings' END,
  'update', 'shift', 'shift-' || lpad(n::text, 5, '0'), 'Synthetic shift ' || n,
  jsonb_build_object('brand_id', CASE WHEN n % 2 = 0 THEN 'brand-a' ELSE 'brand-b' END)
FROM generate_series(1, 45000) AS n;
ANALYZE public.audit_logs;

CREATE FUNCTION public.c12_assert(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN IF NOT coalesce(p_condition, false) THEN RAISE EXCEPTION 'C12_ASSERT_FAILED: %', p_message; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.c12_assert(boolean, text) TO authenticated;

CREATE FUNCTION public.c12_insert_late_event()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_id text := 'audit-added-after-snapshot-' || gen_random_uuid()::text;
BEGIN
  INSERT INTO public.audit_logs (id, created_at, actor_business_user_id, actor_name, actor_role, module, action, entity_type, entity_id, entity_name)
  VALUES (v_id, clock_timestamp(), 'admin-1', 'Admin One', 'admin', 'calendar', 'update', 'shift', 'shift-new', 'Synthetic concurrent event');
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.c12_insert_late_event() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.c12_insert_late_event() TO authenticated;
