-- RC19 Batch 05A.4: activate the verified domain registry and add metadata-only
-- receipts/audit for independent raw schedules and the admin Drive UAT probe.
BEGIN;

ALTER TABLE public.operational_storage_domain_folders
  DROP CONSTRAINT IF EXISTS operational_storage_domain_folders_access_classification_check;
ALTER TABLE public.operational_storage_domain_folders
  ADD CONSTRAINT operational_storage_domain_folders_access_classification_check
    CHECK (access_classification IN (
      'shared', 'pending_restriction_no_sensitive_upload',
      'shared_schema_template_only', 'restricted_verified'
    ));

UPDATE public.operational_storage_domain_folders
SET access_classification = 'pending_restriction_no_sensitive_upload',
    updated_at = statement_timestamp()
WHERE folder_path IN (
  '00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/01_RAW_XLSX_CSV',
  '00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/05_STAFFING_EXPORTS',
  '00_ADA_OPS_PLATFORM/03_LIVE_REPORTS',
  '00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/05_DATA_EXPORT_BACKUPS'
);

UPDATE public.operational_storage_domain_folders
SET active = true,
    updated_at = statement_timestamp()
WHERE verified_created = true;

CREATE TABLE IF NOT EXISTS public.operational_schedule_source_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL CHECK (batch_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  provider text NOT NULL DEFAULT 'google_drive' CHECK (provider = 'google_drive'),
  external_file_id text,
  external_parent_id text,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  folder_path text NOT NULL CHECK (btrim(folder_path) <> ''),
  file_name text NOT NULL CHECK (btrim(file_name) <> ''),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  reconciliation_status text NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'provider_verified', 'failed_cleaned', 'reconciliation_required')),
  uploaded_by text NOT NULL CHECK (btrim(uploaded_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT operational_schedule_source_files_batch_checksum_key UNIQUE (batch_id, checksum_sha256),
  CONSTRAINT operational_schedule_source_files_provider_reference_check
    CHECK (
      (external_file_id IS NULL AND external_parent_id IS NULL)
      OR (nullif(btrim(external_file_id), '') IS NOT NULL
        AND nullif(btrim(external_parent_id), '') IS NOT NULL)
    ),
  CONSTRAINT operational_schedule_source_files_verified_reference_check
    CHECK (reconciliation_status <> 'provider_verified'
      OR (nullif(btrim(external_file_id), '') IS NOT NULL
        AND nullif(btrim(external_parent_id), '') IS NOT NULL))
);
ALTER TABLE public.operational_schedule_source_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_schedule_source_files FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.operational_schedule_source_files TO service_role;

CREATE TABLE IF NOT EXISTS public.operational_storage_drive_probe_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_user_id text NOT NULL CHECK (btrim(actor_auth_user_id) <> ''),
  actor_business_user_id text,
  actor_role text NOT NULL CHECK (actor_role = 'admin'),
  mode text NOT NULL CHECK (mode IN ('metadata', 'upload_readback')),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'passed', 'failed')),
  folder_id text NOT NULL CHECK (folder_id = '1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P'),
  expected_parent_id text NOT NULL CHECK (expected_parent_id = '177g-GBHRY06rHx9ID8rpQOqR-uve9-kj'),
  provider_file_id text,
  provider_parent_id text,
  checksum_sha256 text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
  folder_can_add_children boolean,
  readback_verified boolean NOT NULL DEFAULT false,
  cleanup_status text NOT NULL DEFAULT 'not_started'
    CHECK (cleanup_status IN ('not_started', 'not_applicable', 'trashed', 'pending_reconciliation', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  completed_at timestamptz,
  CONSTRAINT operational_storage_drive_probe_parent_check
    CHECK (provider_parent_id IS NULL OR btrim(provider_parent_id) <> '')
);
CREATE INDEX IF NOT EXISTS operational_storage_drive_probe_runs_actor_created_idx
  ON public.operational_storage_drive_probe_runs (actor_auth_user_id, created_at DESC);
ALTER TABLE public.operational_storage_drive_probe_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_storage_drive_probe_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.operational_storage_drive_probe_runs TO service_role;

CREATE TABLE IF NOT EXISTS public.operational_storage_drive_probe_rate_limits (
  actor_auth_user_id text PRIMARY KEY CHECK (btrim(actor_auth_user_id) <> ''),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);
ALTER TABLE public.operational_storage_drive_probe_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_storage_drive_probe_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.operational_storage_drive_probe_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.claim_operational_storage_drive_probe_rate_limit(
  p_actor_auth_user_id text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed integer;
  request_time timestamptz := statement_timestamp();
BEGIN
  IF nullif(btrim(p_actor_auth_user_id), '') IS NULL
    OR p_limit < 1 OR p_limit > 10
    OR p_window_seconds < 30 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STORAGE_PROBE_RATE_LIMIT_INPUT_INVALID';
  END IF;

  INSERT INTO public.operational_storage_drive_probe_rate_limits AS current_limit
    (actor_auth_user_id, window_started_at, request_count)
  VALUES (p_actor_auth_user_id, request_time, 1)
  ON CONFLICT (actor_auth_user_id) DO UPDATE
  SET window_started_at = CASE
        WHEN current_limit.window_started_at <= request_time - make_interval(secs => p_window_seconds)
          THEN request_time ELSE current_limit.window_started_at END,
      request_count = CASE
        WHEN current_limit.window_started_at <= request_time - make_interval(secs => p_window_seconds)
          THEN 1 ELSE current_limit.request_count + 1 END
  WHERE current_limit.window_started_at <= request_time - make_interval(secs => p_window_seconds)
    OR current_limit.request_count < p_limit;

  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_operational_storage_drive_probe_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_operational_storage_drive_probe_rate_limit(text, integer, integer)
  TO service_role;

COMMENT ON TABLE public.operational_storage_domain_folders IS
  'Metadata-only allowlist for exact verified ADA Ops Drive folders. Sensitive routes require restricted_verified classification.';
COMMENT ON TABLE public.operational_schedule_source_files IS
  'Metadata-only receipt for original schedule files, independent of any shift or execution_source.';
COMMENT ON TABLE public.operational_storage_drive_probe_runs IS
  'Admin-only controlled synthetic Drive probe audit; stores identifiers and checksums, never file bytes or credentials.';

COMMIT;
