-- Minimal prerequisite schema for the RC19 05A migration chain tests.
-- This is a disposable test fixture, not a Production schema snapshot.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA private;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA private, storage TO anon, authenticated;
CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL);
CREATE TABLE storage.objects (bucket_id text NOT NULL, name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON storage.objects TO anon, authenticated;
INSERT INTO storage.buckets VALUES ('live-dashboard-images', true);
CREATE POLICY "live dashboard image public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'live-dashboard-images');

CREATE TABLE public.report_images (id text PRIMARY KEY, provider text, external_file_id text);
CREATE TABLE public.live_report_images (id text PRIMARY KEY, provider text, external_file_id text);
CREATE TABLE public.operational_files (
  id text PRIMARY KEY, scope_key text, category text, provider text, shift_id text,
  integrity_status text, external_file_id text, external_parent_id text,
  checksum_sha256 text, mime_type text, deleted_at timestamptz
);
CREATE TABLE public.shifts (
  id text PRIMARY KEY, status text, deleted_at timestamptz, archived_at timestamptz,
  import_batch_id text
);
CREATE TABLE public.schedule_import_batches (
  id text PRIMARY KEY, source text NOT NULL, status text NOT NULL,
  created_by text, deleted_at timestamptz
);
CREATE TABLE private.actor_context (
  singleton boolean PRIMARY KEY DEFAULT true,
  actor_id text,
  permission text,
  allowed_shift_id text
);
INSERT INTO private.actor_context (actor_id, permission, allowed_shift_id)
  VALUES ('business-1', 'leader', 'shift-1');
CREATE TABLE public.dashboard_updates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, shift_id text NOT NULL,
  time timestamptz NOT NULL, revenue numeric NOT NULL, gmv numeric, orders integer NOT NULL,
  peak_viewers integer NOT NULL, current_viewers integer NOT NULL, total_views integer,
  total_viewers integer, likes integer, comments integer, shares integer,
  screenshot_url text, screenshot_storage_path text, dashboard_platform text NOT NULL,
  normalized_metrics jsonb, ocr_review jsonb, raw_ocr_output text, notes text,
  created_by text, deleted_at timestamptz,
  CHECK (screenshot_storage_path IS NULL OR screenshot_storage_path LIKE 'dashboard/%')
);
GRANT SELECT ON public.dashboard_updates TO anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

CREATE FUNCTION public.upload_report_image_with_provider(
  text, text, text, text, text, bigint, text, text, text
) RETURNS public.report_images LANGUAGE plpgsql AS $$
DECLARE result public.report_images;
BEGIN
  INSERT INTO public.report_images(id, provider, external_file_id)
  VALUES ('report-image-1', $8, $9) RETURNING * INTO result;
  RETURN result;
END $$;
CREATE FUNCTION public.upsert_live_report_image_with_provider(jsonb)
  RETURNS public.live_report_images LANGUAGE plpgsql AS $$
DECLARE result public.live_report_images;
BEGIN
  INSERT INTO public.live_report_images(id, provider, external_file_id)
  VALUES ('live-image-1', $1->>'provider', $1->>'external_file_id') RETURNING * INTO result;
  RETURN result;
END $$;
CREATE FUNCTION private.current_business_user_id()
  RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT actor_id FROM private.actor_context LIMIT 1 $$;
CREATE FUNCTION private.current_system_permission()
  RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT permission FROM private.actor_context LIMIT 1 $$;
CREATE FUNCTION private.is_leader_or_admin()
  RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.current_system_permission() IN ('leader', 'admin') $$;
CREATE FUNCTION private.require_shift_actor(boolean)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id text;
BEGIN
  actor_id := private.current_business_user_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED'; END IF;
  IF $1 AND NOT private.is_leader_or_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;
  RETURN actor_id;
END $$;
CREATE FUNCTION private.can_read_shift(text)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM private.actor_context WHERE allowed_shift_id = $1) $$;
GRANT EXECUTE ON FUNCTION private.can_read_shift(text) TO anon, authenticated;
