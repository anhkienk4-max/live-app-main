\set ON_ERROR_STOP on

-- Synthetic additions required by the exact one-shot manifest. The underlying
-- Reports/Auth/RLS baseline comes from the already-proven W12 fixture.
CREATE TABLE public.brands (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.platforms (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.campaigns (id text PRIMARY KEY, name text NOT NULL);
INSERT INTO public.brands VALUES ('brand-1', 'Release Brand');
INSERT INTO public.platforms VALUES ('platform-1', 'TikTok Shop');
INSERT INTO public.campaigns VALUES ('campaign-1', 'Release Campaign');

ALTER TABLE public.shifts
  ADD COLUMN date date NOT NULL DEFAULT current_date,
  ADD COLUMN start_time time NOT NULL DEFAULT time '10:00',
  ADD COLUMN title text NOT NULL DEFAULT 'Synthetic release shift',
  ADD COLUMN brand_id text REFERENCES public.brands(id),
  ADD COLUMN platform_id text REFERENCES public.platforms(id),
  ADD COLUMN campaign_id text REFERENCES public.campaigns(id),
  ADD COLUMN studio text,
  ADD COLUMN product_notes text,
  ADD COLUMN required_host_count integer NOT NULL DEFAULT 1,
  ADD COLUMN required_support_count integer NOT NULL DEFAULT 1,
  ADD COLUMN required_technical_count integer NOT NULL DEFAULT 1,
  ADD COLUMN start_at timestamptz NOT NULL DEFAULT statement_timestamp() - interval '1 hour';
UPDATE public.shifts SET brand_id = 'brand-1', platform_id = 'platform-1', campaign_id = 'campaign-1';
GRANT SELECT ON public.brands, public.platforms, public.campaigns,
  public.shifts, public.shift_registrations TO authenticated;

ALTER TABLE public.shift_registrations
  ADD COLUMN operational_role text NOT NULL DEFAULT 'host',
  ADD COLUMN source text NOT NULL DEFAULT 'self_registration',
  ADD COLUMN imported_name text;

ALTER TABLE public.reports
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  ADD COLUMN normalized_metrics jsonb,
  ADD COLUMN platform_metrics jsonb,
  ADD COLUMN revenue numeric,
  ADD COLUMN orders numeric;

CREATE FUNCTION private.filtered_shift_ids(p_scope text, p_filters jsonb)
RETURNS TABLE(id text, date date, start_time time, status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT shift.id, shift.date, shift.start_time, shift.status
  FROM public.shifts AS shift
  WHERE shift.deleted_at IS NULL AND shift.archived_at IS NULL
$$;

CREATE FUNCTION private.rc16k_report_metric(report public.reports, metric_key text)
RETURNS numeric
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT CASE metric_key
    WHEN 'revenue' THEN coalesce((report.normalized_metrics ->> 'revenue')::numeric, report.revenue)
    WHEN 'orders' THEN coalesce((report.normalized_metrics ->> 'orders')::numeric, report.orders)
    ELSE NULL
  END
$$;

CREATE FUNCTION public.get_shift_staffing_summary(p_shift_ids text[])
RETURNS TABLE(shift_id text, role text, approved integer, required integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT shift.id, demand.role, 0, demand.required
  FROM public.shifts AS shift
  CROSS JOIN LATERAL (VALUES
    ('host', shift.required_host_count),
    ('support', shift.required_support_count),
    ('technical', shift.required_technical_count)
  ) AS demand(role, required)
  WHERE shift.id = ANY(p_shift_ids)
$$;

CREATE TABLE public.dashboard_updates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  shift_id text NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  time timestamptz NOT NULL DEFAULT statement_timestamp(),
  revenue numeric NOT NULL DEFAULT 0,
  gmv numeric,
  orders integer NOT NULL DEFAULT 0,
  peak_viewers integer NOT NULL DEFAULT 0,
  current_viewers integer NOT NULL DEFAULT 0,
  total_views integer,
  total_viewers integer,
  likes integer,
  comments integer,
  shares integer,
  screenshot_url text,
  screenshot_storage_path text,
  dashboard_platform text NOT NULL DEFAULT 'other',
  normalized_metrics jsonb,
  ocr_review jsonb,
  raw_ocr_output text,
  notes text,
  created_by text REFERENCES public.business_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  deleted_at timestamptz
);
ALTER TABLE public.dashboard_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_updates_scoped_read ON public.dashboard_updates
  FOR SELECT TO authenticated USING ((SELECT private.can_read_shift(shift_id)));
GRANT SELECT ON public.dashboard_updates TO authenticated;
CREATE FUNCTION public.create_dashboard_update(p_data jsonb)
RETURNS public.dashboard_updates
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.create_dashboard_update(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_dashboard_update(jsonb) TO authenticated;

CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO supabase_migrations.schema_migrations(version, name)
SELECT '20000101' || lpad(value::text, 6, '0'), 'synthetic_baseline_' || value
FROM generate_series(1, 63) AS value;
INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES
  ('20261012000000', 'rc16_workforce_payroll_foundation'),
  ('20261012000001', 'rc16b_draft_payroll_correction'),
  ('20261012145735', 'p0_audit_privilege_hardening'),
  ('20261014173408', '20261012171503_rc16k_bounded_shift_lists'),
  ('20261017000000', 'rc17a_actual_staffing_audit');

DO $$ BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 68 THEN
    RAISE EXCEPTION 'SYNTHETIC_LEDGER_BASELINE_NOT_68';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261014190429', '20261014233900', '20261015154159', '20261019000000')) THEN
    RAISE EXCEPTION 'RELEASE_VERSION_ALREADY_APPLIED';
  END IF;
END $$;
