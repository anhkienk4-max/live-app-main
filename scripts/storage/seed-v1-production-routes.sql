-- ==============================================================================
-- RC19 STO-01: PRODUCTION STORAGE ROUTE ACTIVATION SCRIPT (FULL CONTRACT PREFLIGHT)
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Scope: Schema-Compatible Storage Routes (14/21 routes)
-- Quarantined Agency Routes (7/21): Blocked pending Owner approval of
--   docs/storage/PROPOSAL_RC19_AGENCY_STORAGE_PROFILE_MIGRATION.md
-- Root Folder: 1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm (Google Drive)
--
-- APPROVAL PROTOCOL (P0 FAIL-CLOSED):
-- This script contains NO hardcoded approver ID.
-- The release operator MUST supply a verified, active Admin approver ID via:
--   Option A: Session setting (psql / direct connection):
--     SET LOCAL app.release_approver_id = '<VERIFIED_ADMIN_BUSINESS_USER_ID>';
--     SET LOCAL app.release_id = 'RC19-STO01-V1-RELEASE';
--   Option B: Temporary session table (compatible across SQL clients):
--     CREATE TEMP TABLE temp_release_approval_session (
--       approver_id text NOT NULL,
--       release_id text NOT NULL,
--       approval_notes text
--     );
--     INSERT INTO temp_release_approval_session VALUES ('<VERIFIED_ADMIN_BUSINESS_USER_ID>', 'RC19-STO01-V1-RELEASE', 'Approved by Operations Admin');
--
-- SAFETY & INTEGRITY RULES:
-- 1. NO hardcoded approver: Approver ID is dynamically supplied in controlled release context.
-- 2. Actor validation: Approver must exist in public.business_users, be active (not archived/deleted),
--    and possess Admin authority (system_permission = 'admin' OR role = 'admin').
-- 3. Fail-Closed: If approval actor is missing or invalid, preflight aborts immediately.
-- 4. NO silent skip: Preflight validates ALL contract parameters against existing active routes.
--    If an active route has ANY differing field, preflight FAILS CLOSED before insert.
-- 5. ON CONFLICT DO NOTHING applies ONLY to 100% verified identical routes (strict idempotency).
-- 6. Brand storage_profile check: Brands with reviewed storage_profile must match route profile.
-- 7. Atomic transaction: Any failure rolls back completely, leaving 0 partial state.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- PREFLIGHT VERIFICATION
-- ------------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing_brands text[];
  v_missing_platforms text[];
  v_approved_by text;
  v_release_id text;
  v_approver_exists boolean;
  v_approver_active boolean;
  v_approver_is_admin boolean;
  v_conflict_detail text;
BEGIN
  -- 0. Retrieve approver ID and release ID from session setting or temp table
  BEGIN
    v_approved_by := nullif(current_setting('app.release_approver_id', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_approved_by := NULL;
  END;

  IF v_approved_by IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_type = 'LOCAL TEMPORARY' AND table_name = 'temp_release_approval_session'
    ) THEN
      BEGIN
        EXECUTE 'SELECT approver_id FROM temp_release_approval_session LIMIT 1' INTO v_approved_by;
      EXCEPTION WHEN OTHERS THEN
        v_approved_by := NULL;
      END;
    END IF;
  END IF;

  BEGIN
    v_release_id := nullif(current_setting('app.release_id', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_release_id := NULL;
  END;

  IF v_release_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_type = 'LOCAL TEMPORARY' AND table_name = 'temp_release_approval_session'
    ) THEN
      BEGIN
        EXECUTE 'SELECT release_id FROM temp_release_approval_session LIMIT 1' INTO v_release_id;
      EXCEPTION WHEN OTHERS THEN
        v_release_id := NULL;
      END;
    END IF;
  END IF;

  -- 1. Validate approver ID is present (Fail-closed if missing)
  IF v_approved_by IS NULL OR trim(v_approved_by) = '' THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: No release approval actor provided. You must set app.release_approver_id (e.g., SET LOCAL app.release_approver_id = ''...'') or populate temp_release_approval_session before executing.';
  END IF;

  -- 2. Verify approver existence in public.business_users
  SELECT EXISTS(SELECT 1 FROM public.business_users WHERE id = v_approved_by)
  INTO v_approver_exists;

  IF NOT v_approver_exists THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: Required route approval actor (approved_by = %) does not exist in public.business_users.', v_approved_by;
  END IF;

  -- 3. Verify approver is active, not archived, not deleted
  SELECT EXISTS(
    SELECT 1 FROM public.business_users 
    WHERE id = v_approved_by 
      AND coalesce(status, 'active') = 'active'
      AND coalesce(account_status, 'active') = 'active'
      AND archived_at IS NULL 
      AND deleted_at IS NULL
  )
  INTO v_approver_active;

  IF NOT v_approver_active THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: Route approval actor (approved_by = %) is not active or has been archived/deleted.', v_approved_by;
  END IF;

  -- 4. Verify approver has Admin authority
  SELECT EXISTS(
    SELECT 1 FROM public.business_users 
    WHERE id = v_approved_by 
      AND (coalesce(system_permission, '') = 'admin' OR coalesce(role, '') = 'admin')
  )
  INTO v_approver_is_admin;

  IF NOT v_approver_is_admin THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: Route approval actor (approved_by = %) lacks Admin authority (system_permission or role must be admin).', v_approved_by;
  END IF;

  RAISE NOTICE 'APPROVAL VERIFIED: Approver ID: %, Release ID: %', v_approved_by, coalesce(v_release_id, 'UNSPECIFIED');

  -- 2. Verify existence of all 12 expected brands
  SELECT array_agg(expected.name)
  INTO v_missing_brands
  FROM (
    VALUES
      ('ASM AI Livestream'),
      ('Female AI livestream'),
      ('Male AI livestream'),
      ('Mars Snacking'),
      ('ASTROMAN'),
      ('Female'),
      ('X-men'),
      ('CUREL'),
      ('KATE'),
      ('KAO'),
      ('OPELLA'),
      ('Pepsico')
  ) AS expected(name)
  LEFT JOIN public.brands b ON b.name = expected.name AND b.deleted_at IS NULL
  WHERE b.id IS NULL;

  IF v_missing_brands IS NOT NULL AND array_length(v_missing_brands, 1) > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: Missing required brands in public.brands: %', array_to_string(v_missing_brands, ', ');
  END IF;

  -- 3. Verify existence of required platforms
  SELECT array_agg(expected.name)
  INTO v_missing_platforms
  FROM (
    VALUES
      ('Shopee Live'),
      ('TikTok Shop')
  ) AS expected(name)
  LEFT JOIN public.platforms p ON p.name = expected.name AND p.deleted_at IS NULL
  WHERE p.id IS NULL;

  IF v_missing_platforms IS NOT NULL AND array_length(v_missing_platforms, 1) > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: Missing required platforms in public.platforms: %', array_to_string(v_missing_platforms, ', ');
  END IF;

  -- 4. Verify Brand storage_profile policies (if already reviewed, must match expected profile)
  SELECT string_agg(format('%s (has %s, expected %s)', b.name, b.storage_profile, c.expected_profile), '; ')
  INTO v_conflict_detail
  FROM (
    VALUES
      ('ASM AI Livestream', 'CANONICAL_V1'),
      ('Female AI livestream', 'CANONICAL_V1'),
      ('Male AI livestream', 'CANONICAL_V1'),
      ('Mars Snacking', 'LEGACY_CATEGORY_PERIOD'),
      ('ASTROMAN', 'LEGACY_CATEGORY_PERIOD'),
      ('Female', 'LEGACY_CATEGORY_PERIOD'),
      ('X-men', 'LEGACY_CATEGORY_PERIOD'),
      ('CUREL', 'LEGACY_CATEGORY_PERIOD'),
      ('KATE', 'LEGACY_PERIOD_CATEGORY'),
      ('KAO', 'LEGACY_PERIOD_CATEGORY'),
      ('OPELLA', 'LEGACY_CATEGORY_PERIOD'),
      ('Pepsico', 'LEGACY_CATEGORY_PERIOD')
  ) AS c(brand_name, expected_profile)
  JOIN public.brands b ON b.name = c.brand_name AND b.deleted_at IS NULL
  WHERE b.storage_profile IS NOT NULL AND b.storage_profile <> c.expected_profile;

  IF v_conflict_detail IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: Brand storage_profile conflict detected: %', v_conflict_detail;
  END IF;

  -- 5. FULL ROUTE CONTRACT PREFLIGHT:
  -- Compare candidate routes against any existing active route for the same route key:
  -- (provider, execution_source, brand_id, platform_id, subbrand_key).
  -- Checks: storage_profile, root_folder_id, base_folder_id, folder_labels, period_naming_style,
  -- period_label_overrides, period_date_ranges, folder_label_overrides.
  -- Fails closed if ANY field differs.
  SELECT string_agg(
    format('[%s / %s / %s]: %s', 
      c.brand_name, 
      COALESCE(c.platform_name, 'All Platforms'), 
      c.execution_source,
      CASE 
        WHEN r.storage_profile <> c.storage_profile THEN format('profile mismatch (db=%s, candidate=%s)', r.storage_profile, c.storage_profile)
        WHEN r.root_folder_id <> c.root_folder_id THEN format('root_folder_id mismatch (db=%s, candidate=%s)', r.root_folder_id, c.root_folder_id)
        WHEN r.base_folder_id <> c.base_folder_id THEN format('base_folder_id mismatch (db=%s, candidate=%s)', r.base_folder_id, c.base_folder_id)
        WHEN r.folder_labels <> c.folder_labels THEN format('folder_labels mismatch (db=%s, candidate=%s)', r.folder_labels::text, c.folder_labels::text)
        WHEN r.period_naming_style <> c.period_naming_style THEN format('period_naming_style mismatch (db=%s, candidate=%s)', r.period_naming_style, c.period_naming_style)
        WHEN r.period_label_overrides <> c.period_label_overrides THEN format('period_label_overrides mismatch (db=%s, candidate=%s)', r.period_label_overrides::text, c.period_label_overrides::text)
        WHEN r.period_date_ranges <> c.period_date_ranges THEN format('period_date_ranges mismatch (db=%s, candidate=%s)', r.period_date_ranges::text, c.period_date_ranges::text)
        WHEN r.folder_label_overrides <> c.folder_label_overrides THEN format('folder_label_overrides mismatch (db=%s, candidate=%s)', r.folder_label_overrides::text, c.folder_label_overrides::text)
        ELSE 'unknown discrepancy'
      END
    ), 
    '; '
  )
  INTO v_conflict_detail
  FROM (
    VALUES
    ('ASM AI Livestream', NULL, 'internal', 'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '{}'::jsonb, 'THANG_M_DOT_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('Female AI livestream', NULL, 'internal', 'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '{}'::jsonb, 'THANG_M_DOT_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('Male AI livestream', NULL, 'internal', 'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '{}'::jsonb, 'THANG_M_DOT_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('Mars Snacking', NULL, 'internal', 'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1SuQhXZsNr7eArHVwf9NMTqR1TEHYqOC5', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_M_DASH_YEAR', '{"2026-01":{"dashboard":"tháng 1 - 2026","live_visual":"Tháng 1 - 2026"},"2026-02":{"dashboard":"THÁNG 02-2026","live_visual":"THÁNG 02-2026"},"2026-03":{"dashboard":"THÁNG 03 - 2026","live_visual":"THÁNG 03 - 2026"},"2026-04":{"dashboard":"THÁNG 04 - 2026","live_visual":"Tháng 04-2026"},"2026-05":{"dashboard":"THÁNG 05-2026","live_visual":"THÁNG 5.2026"},"2026-06":{"dashboard":"Tháng 6 - 2026","live_visual":"THÁNG 6-2026"},"2026-07":{"dashboard":"Tháng 7-2026","live_visual":"Tháng 7-2026"},"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"Tháng 9 - 2026"},"2026-10":{"dashboard":"Tháng 10 - 2026","live_visual":"THÁNG 10 -2026"}}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('Mars Snacking', NULL, 'agency', 'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '19cuLMvhVB8yfJslZUbLUdrsDLQ_vincE', '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_M_DOT_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('ASTROMAN', NULL, 'internal', 'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1J5rnrodawxZjngKCu-thqb9peoaaMGXE', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('Female', NULL, 'internal', 'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1QcV_-vU35f3g262h8CXgugCkSLfgBHsZ', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 6. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THÁNG 8.2026","live_visual":"THÁNG 8.2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('X-men', NULL, 'internal', 'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '16X2rvIuTGj_Raw2wA3bBtEAAJY53Sv_i', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 6. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THÁNG 8.2026","live_visual":"THÁNG 8.2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('CUREL', NULL, 'internal', 'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1v0qrSIT6f1pUQ8hJfbZDvJBV3s9P972-', '{"dashboard":"Dashboard","live_visual_internal":"Visibility","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"}}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('KATE', NULL, 'internal', 'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '15I5HIGnOcKiV60aKTrk0aTRfy8pmX6uX', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-06":{"dashboard":"KATE T6.2026","live_visual":"KATE T6.2026"},"2026-07":{"dashboard":"KATE T7.2026","live_visual":"KATE T7.2026"}}'::jsonb, '[]'::jsonb, '{"2026-07":{"dashboard":"Dashboard","live_visual":"Visibility"}}'::jsonb),
    ('KAO', NULL, 'internal', 'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1oq5p4_f69TuPmVP1oRfmHpErwwovKmB8', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-01":{"dashboard":"T1.2026","live_visual":"T1.2026"},"2026-03":{"dashboard":"T3.2026","live_visual":"T3.2026"},"2026-04":{"dashboard":"T4.2026","live_visual":"T4.2026"},"2026-05":{"dashboard":"T5.2026","live_visual":"T5.2026"},"2026-06":{"dashboard":"T6.2026 - KAO SIS","live_visual":"T6.2026 - KAO SIS"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"T8.2026 ","live_visual":"T8.2026 "},"2026-09":{"dashboard":"T9.2026","live_visual":"T9.2026"}}'::jsonb, '[]'::jsonb, '{"2026-01":{"dashboard":"Dashboard","live_visual":"Visibility"}}'::jsonb),
    ('OPELLA', 'Shopee Live', 'internal', 'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1ZxI1VB0x5K8eADDig9suD-4qPTMCK8f-', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 06. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"},"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('OPELLA', 'TikTok Shop', 'internal', 'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1Ww8oPGDLiadsXvY9yP0UUIdqkMI-s0jp', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THANG 8 2026","live_visual":"THANGS 8 2026"},"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb, '[]'::jsonb, '{}'::jsonb),
    ('Pepsico', NULL, 'internal', 'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1h4j2Khtde6ugA6BUBN1Y5mqn27buJACa', '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb, 'THANG_UPPER_M_DASH_YEAR', '{"2026-07":{"dashboard":"THÁNG 7_2026","live_visual":"THÁNG 7_2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"Tháng 9 - 2026"},"2026-10":{"dashboard":"Tháng 10 - 2026","live_visual":"Tháng 10 - 2026"}}'::jsonb, '[]'::jsonb, '{}'::jsonb)
  ) AS c(brand_name, platform_name, execution_source, storage_profile, root_folder_id, base_folder_id, folder_labels, period_naming_style, period_label_overrides, period_date_ranges, folder_label_overrides)
  JOIN public.brands b ON b.name = c.brand_name AND b.deleted_at IS NULL
  LEFT JOIN public.platforms p ON p.name = c.platform_name AND p.deleted_at IS NULL
  JOIN public.operational_storage_routes r ON r.provider = 'google_drive'
    AND r.execution_source = c.execution_source
    AND r.brand_id = b.id
    AND (r.platform_id IS NOT DISTINCT FROM p.id)
    AND (r.subbrand_key IS NULL)
    AND r.active = true
  WHERE (
    r.storage_profile <> c.storage_profile OR
    r.root_folder_id <> c.root_folder_id OR
    r.base_folder_id <> c.base_folder_id OR
    r.folder_labels <> c.folder_labels OR
    r.period_naming_style <> c.period_naming_style OR
    r.period_label_overrides <> c.period_label_overrides OR
    r.period_date_ranges <> c.period_date_ranges OR
    r.folder_label_overrides <> c.folder_label_overrides
  );

  IF v_conflict_detail IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: Conflicting active route configuration detected: %', v_conflict_detail;
  END IF;

  RAISE NOTICE 'PREFLIGHT PASSED: Approver verified, 12 brands verified, platforms verified, full route contracts verified.';
END
$preflight$;

-- ------------------------------------------------------------------------------
-- SCHEMA-VALID STORAGE ROUTES INSERTION (14 ROUTES)
-- ------------------------------------------------------------------------------
DO $seed$
DECLARE
  v_approved_by text;
BEGIN
  -- Retrieve approver ID from session setting or temp table
  BEGIN
    v_approved_by := nullif(current_setting('app.release_approver_id', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_approved_by := NULL;
  END;

  IF v_approved_by IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_type = 'LOCAL TEMPORARY' AND table_name = 'temp_release_approval_session'
    ) THEN
      BEGIN
        EXECUTE 'SELECT approver_id FROM temp_release_approval_session LIMIT 1' INTO v_approved_by;
      EXCEPTION WHEN OTHERS THEN
        v_approved_by := NULL;
      END;
    END IF;
  END IF;

  IF v_approved_by IS NULL OR trim(v_approved_by) = '' THEN
    RAISE EXCEPTION 'SEED FAIL-CLOSED: Route approval actor is missing at seed execution step.';
  END IF;
-- Route 1: ASM AI Livestream (All Platforms) [internal] -> CANONICAL_V1
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '{}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'ASM AI Livestream' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 2: Female AI livestream (All Platforms) [internal] -> CANONICAL_V1
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '{}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'Female AI livestream' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 3: Male AI livestream (All Platforms) [internal] -> CANONICAL_V1
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '{}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'Male AI livestream' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 4: Mars Snacking (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1SuQhXZsNr7eArHVwf9NMTqR1TEHYqOC5',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DASH_YEAR',
  '{"2026-01":{"dashboard":"tháng 1 - 2026","live_visual":"Tháng 1 - 2026"},"2026-02":{"dashboard":"THÁNG 02-2026","live_visual":"THÁNG 02-2026"},"2026-03":{"dashboard":"THÁNG 03 - 2026","live_visual":"THÁNG 03 - 2026"},"2026-04":{"dashboard":"THÁNG 04 - 2026","live_visual":"Tháng 04-2026"},"2026-05":{"dashboard":"THÁNG 05-2026","live_visual":"THÁNG 5.2026"},"2026-06":{"dashboard":"Tháng 6 - 2026","live_visual":"THÁNG 6-2026"},"2026-07":{"dashboard":"Tháng 7-2026","live_visual":"Tháng 7-2026"},"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"Tháng 9 - 2026"},"2026-10":{"dashboard":"Tháng 10 - 2026","live_visual":"THÁNG 10 -2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'Mars Snacking' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 5: Mars Snacking (All Platforms) [agency] -> LEGACY_PERIOD_CATEGORY
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'agency', b.id, NULL, NULL,
  'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '19cuLMvhVB8yfJslZUbLUdrsDLQ_vincE',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'Mars Snacking' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 6: ASTROMAN (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1J5rnrodawxZjngKCu-thqb9peoaaMGXE',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'ASTROMAN' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 7: Female (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1QcV_-vU35f3g262h8CXgugCkSLfgBHsZ',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 6. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THÁNG 8.2026","live_visual":"THÁNG 8.2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'Female' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 8: X-men (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '16X2rvIuTGj_Raw2wA3bBtEAAJY53Sv_i',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 6. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THÁNG 8.2026","live_visual":"THÁNG 8.2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'X-men' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 9: CUREL (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1v0qrSIT6f1pUQ8hJfbZDvJBV3s9P972-',
  '{"dashboard":"Dashboard","live_visual_internal":"Visibility","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'CUREL' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 10: KATE (All Platforms) [internal] -> LEGACY_PERIOD_CATEGORY
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '15I5HIGnOcKiV60aKTrk0aTRfy8pmX6uX',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"KATE T6.2026","live_visual":"KATE T6.2026"},"2026-07":{"dashboard":"KATE T7.2026","live_visual":"KATE T7.2026"}}'::jsonb,
  '[]'::jsonb,
  '{"2026-07":{"dashboard":"Dashboard","live_visual":"Visibility"}}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'KATE' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 11: KAO (All Platforms) [internal] -> LEGACY_PERIOD_CATEGORY
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1oq5p4_f69TuPmVP1oRfmHpErwwovKmB8',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-01":{"dashboard":"T1.2026","live_visual":"T1.2026"},"2026-03":{"dashboard":"T3.2026","live_visual":"T3.2026"},"2026-04":{"dashboard":"T4.2026","live_visual":"T4.2026"},"2026-05":{"dashboard":"T5.2026","live_visual":"T5.2026"},"2026-06":{"dashboard":"T6.2026 - KAO SIS","live_visual":"T6.2026 - KAO SIS"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"T8.2026 ","live_visual":"T8.2026 "},"2026-09":{"dashboard":"T9.2026","live_visual":"T9.2026"}}'::jsonb,
  '[]'::jsonb,
  '{"2026-01":{"dashboard":"Dashboard","live_visual":"Visibility"}}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'KAO' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 12: OPELLA (Shopee Live) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, (SELECT id FROM public.platforms WHERE name = 'Shopee Live' AND deleted_at IS NULL LIMIT 1), NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1ZxI1VB0x5K8eADDig9suD-4qPTMCK8f-',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 06. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"},"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'OPELLA' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 13: OPELLA (TikTok Shop) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, (SELECT id FROM public.platforms WHERE name = 'TikTok Shop' AND deleted_at IS NULL LIMIT 1), NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1Ww8oPGDLiadsXvY9yP0UUIdqkMI-s0jp',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THANG 8 2026","live_visual":"THANGS 8 2026"},"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'OPELLA' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 14: Pepsico (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active, approved_by, approved_at
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1h4j2Khtde6ugA6BUBN1Y5mqn27buJACa',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-07":{"dashboard":"THÁNG 7_2026","live_visual":"THÁNG 7_2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"Tháng 9 - 2026"},"2026-10":{"dashboard":"Tháng 10 - 2026","live_visual":"Tháng 10 - 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  v_approved_by,
  statement_timestamp()
FROM public.brands b
WHERE b.name = 'Pepsico' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

END
$seed$;

-- ------------------------------------------------------------------------------
-- POST-SEED VERIFICATION
-- ------------------------------------------------------------------------------
SELECT 
  r.id,
  b.name AS brand_name,
  COALESCE(p.name, 'All Platforms') AS platform_name,
  r.execution_source,
  r.storage_profile,
  r.base_folder_id,
  r.approved_by,
  r.approved_at,
  r.active
FROM public.operational_storage_routes r
JOIN public.brands b ON b.id = r.brand_id
LEFT JOIN public.platforms p ON p.id = r.platform_id
WHERE r.active = true
ORDER BY b.name, platform_name;

COMMIT;
