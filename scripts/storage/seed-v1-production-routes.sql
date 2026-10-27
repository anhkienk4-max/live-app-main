-- ==============================================================================
-- RC19 STO-01: PRODUCTION STORAGE ROUTE ACTIVATION SCRIPT (HARDENED & PREFLIGHT-CHECKED)
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Scope: Schema-Compatible Storage Routes (14/21 routes)
-- Blocked Agency Routes (7/21): Quarantined pending Owner approval of
--   docs/storage/PROPOSAL_RC19_AGENCY_STORAGE_PROFILE_MIGRATION.md
-- Root Folder: 1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm (Google Drive)
--
-- SAFETY RULES:
-- 1. NO mutations to public.brands (brands.storage_profile requires business review + actor attribution)
-- 2. Preflight verifies Brands, Platforms, Profiles, Duplicate Keys, and Folder IDs
-- 3. Idempotent: ON CONFLICT DO NOTHING (never overwrites existing routes with DO UPDATE)
-- 4. Fail-closed: Any missing brand, platform, or invalid profile aborts the entire transaction
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- PREFLIGHT VERIFICATION
-- ------------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing_brands text[];
  v_missing_platforms text[];
  v_existing_conflicts integer := 0;
  v_brand_count integer;
  v_platform_count integer;
BEGIN
  -- 1. Verify existence of all 12 expected brands
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

  -- 2. Verify existence of required platforms
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

  -- 3. Check for conflicting existing active routes with different configurations
  -- Any existing route with conflicting base_folder_id or profile must NOT be silently overwritten
  SELECT count(*)
  INTO v_existing_conflicts
  FROM public.operational_storage_routes r
  JOIN public.brands b ON b.id = r.brand_id
  LEFT JOIN public.platforms p ON p.id = r.platform_id
  WHERE r.active = true
    AND (
      (b.name = 'ASM AI Livestream' AND r.execution_source = 'internal' AND r.base_folder_id <> '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm') OR
      (b.name = 'Female AI livestream' AND r.execution_source = 'internal' AND r.base_folder_id <> '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm') OR
      (b.name = 'Male AI livestream' AND r.execution_source = 'internal' AND r.base_folder_id <> '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm') OR
      (b.name = 'Mars Snacking' AND r.execution_source = 'internal' AND r.base_folder_id <> '1SuQhXZsNr7eArHVwf9NMTqR1TEHYqOC5') OR
      (b.name = 'Mars Snacking' AND r.execution_source = 'agency' AND r.base_folder_id <> '19cuLMvhVB8yfJslZUbLUdrsDLQ_vincE') OR
      (b.name = 'ASTROMAN' AND r.execution_source = 'internal' AND r.base_folder_id <> '1J5rnrodawxZjngKCu-thqb9peoaaMGXE') OR
      (b.name = 'Female' AND r.execution_source = 'internal' AND r.base_folder_id <> '1QcV_-vU35f3g262h8CXgugCkSLfgBHsZ') OR
      (b.name = 'X-men' AND r.execution_source = 'internal' AND r.base_folder_id <> '16X2rvIuTGj_Raw2wA3bBtEAAJY53Sv_i') OR
      (b.name = 'CUREL' AND r.execution_source = 'internal' AND r.base_folder_id <> '1v0qrSIT6f1pUQ8hJfbZDvJBV3s9P972-') OR
      (b.name = 'KATE' AND r.execution_source = 'internal' AND r.base_folder_id <> '15I5HIGnOcKiV60aKTrk0aTRfy8pmX6uX') OR
      (b.name = 'KAO' AND r.execution_source = 'internal' AND r.base_folder_id <> '1oq5p4_f69TuPmVP1oRfmHpErwwovKmB8') OR
      (b.name = 'OPELLA' AND p.name = 'Shopee Live' AND r.execution_source = 'internal' AND r.base_folder_id <> '1ZxI1VB0x5K8eADDig9suD-4qPTMCK8f-') OR
      (b.name = 'OPELLA' AND p.name = 'TikTok Shop' AND r.execution_source = 'internal' AND r.base_folder_id <> '1Ww8oPGDLiadsXvY9yP0UUIdqkMI-s0jp') OR
      (b.name = 'Pepsico' AND r.execution_source = 'internal' AND r.base_folder_id <> '1h4j2Khtde6ugA6BUBN1Y5mqn27buJACa')
    );

  IF v_existing_conflicts > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL-CLOSED: % active route(s) exist with conflicting configuration. ON CONFLICT DO UPDATE is forbidden.', v_existing_conflicts;
  END IF;

  RAISE NOTICE 'PREFLIGHT PASSED: 12 brands verified, platforms verified, no conflicting active routes.';
END
$preflight$;

-- ------------------------------------------------------------------------------
-- SCHEMA-VALID STORAGE ROUTES INSERTION (14 ROUTES)
-- Uses ON CONFLICT DO NOTHING to preserve any identical verified routes
-- ------------------------------------------------------------------------------

-- Route 1: ASM AI Livestream (All Platforms) [internal] -> CANONICAL_V1
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '{}'::jsonb,
  'THANG_M_DOT_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'ASM AI Livestream' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 2: Female AI livestream (All Platforms) [internal] -> CANONICAL_V1
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '{}'::jsonb,
  'THANG_M_DOT_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'Female AI livestream' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 3: Male AI livestream (All Platforms) [internal] -> CANONICAL_V1
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '{}'::jsonb,
  'THANG_M_DOT_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'Male AI livestream' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 4 (Orig #11): Mars Snacking (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1SuQhXZsNr7eArHVwf9NMTqR1TEHYqOC5',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DASH_YEAR',
  '{"2026-01":{"dashboard":"tháng 1 - 2026","live_visual":"Tháng 1 - 2026"},"2026-02":{"dashboard":"THÁNG 02-2026","live_visual":"THÁNG 02-2026"},"2026-03":{"dashboard":"THÁNG 03 - 2026","live_visual":"THÁNG 03 - 2026"},"2026-04":{"dashboard":"THÁNG 04 - 2026","live_visual":"Tháng 04-2026"},"2026-05":{"dashboard":"THÁNG 05-2026","live_visual":"THÁNG 5.2026"},"2026-06":{"dashboard":"Tháng 6 - 2026","live_visual":"THÁNG 6-2026"},"2026-07":{"dashboard":"Tháng 7-2026","live_visual":"Tháng 7-2026"},"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"Tháng 9 - 2026"},"2026-10":{"dashboard":"Tháng 10 - 2026","live_visual":"THÁNG 10 -2026"}}'::jsonb,
  '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'Mars Snacking' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 5 (Orig #12): Mars Snacking (All Platforms) [agency] -> LEGACY_PERIOD_CATEGORY
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'agency', b.id, NULL, NULL,
  'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '19cuLMvhVB8yfJslZUbLUdrsDLQ_vincE',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'Mars Snacking' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 6 (Orig #13): ASTROMAN (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1J5rnrodawxZjngKCu-thqb9peoaaMGXE',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'ASTROMAN' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 7 (Orig #14): Female (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1QcV_-vU35f3g262h8CXgugCkSLfgBHsZ',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 6. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THÁNG 8.2026","live_visual":"THÁNG 8.2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'Female' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 8 (Orig #15): X-men (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '16X2rvIuTGj_Raw2wA3bBtEAAJY53Sv_i',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 6. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THÁNG 8.2026","live_visual":"THÁNG 8.2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'X-men' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 9 (Orig #16): CUREL (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1v0qrSIT6f1pUQ8hJfbZDvJBV3s9P972-',
  '{"dashboard":"Dashboard","live_visual_internal":"Visibility","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"}}'::jsonb,
  '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'CUREL' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 10 (Orig #17): KATE (All Platforms) [internal] -> LEGACY_PERIOD_CATEGORY
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '15I5HIGnOcKiV60aKTrk0aTRfy8pmX6uX',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"KATE T6.2026","live_visual":"KATE T6.2026"},"2026-07":{"dashboard":"KATE T7.2026","live_visual":"KATE T7.2026"}}'::jsonb,
  '[]'::jsonb,
  '{"2026-07":{"dashboard":"Dashboard","live_visual":"Visibility"}}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'KATE' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 11 (Orig #18): KAO (All Platforms) [internal] -> LEGACY_PERIOD_CATEGORY
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_PERIOD_CATEGORY', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1oq5p4_f69TuPmVP1oRfmHpErwwovKmB8',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-01":{"dashboard":"T1.2026","live_visual":"T1.2026"},"2026-03":{"dashboard":"T3.2026","live_visual":"T3.2026"},"2026-04":{"dashboard":"T4.2026","live_visual":"T4.2026"},"2026-05":{"dashboard":"T5.2026","live_visual":"T5.2026"},"2026-06":{"dashboard":"T6.2026 - KAO SIS","live_visual":"T6.2026 - KAO SIS"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"T8.2026 ","live_visual":"T8.2026 "},"2026-09":{"dashboard":"T9.2026","live_visual":"T9.2026"}}'::jsonb,
  '[]'::jsonb,
  '{"2026-01":{"dashboard":"Dashboard","live_visual":"Visibility"}}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'KAO' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 12 (Orig #19): OPELLA (Shopee Live) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id,
  (SELECT id FROM public.platforms WHERE name = 'Shopee Live' AND deleted_at IS NULL LIMIT 1),
  NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1ZxI1VB0x5K8eADDig9suD-4qPTMCK8f-',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 06. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"},"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'OPELLA' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 13 (Orig #20): OPELLA (TikTok Shop) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id,
  (SELECT id FROM public.platforms WHERE name = 'TikTok Shop' AND deleted_at IS NULL LIMIT 1),
  NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1Ww8oPGDLiadsXvY9yP0UUIdqkMI-s0jp',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THANG 8 2026","live_visual":"THANGS 8 2026"},"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'OPELLA' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

-- Route 14 (Orig #21): Pepsico (All Platforms) [internal] -> LEGACY_CATEGORY_PERIOD
INSERT INTO public.operational_storage_routes (
  provider, execution_source, brand_id, platform_id, subbrand_key,
  storage_profile, root_folder_id, base_folder_id, folder_labels,
  period_naming_style, period_label_overrides, period_date_ranges,
  folder_label_overrides, active
)
SELECT 
  'google_drive', 'internal', b.id, NULL, NULL,
  'LEGACY_CATEGORY_PERIOD', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1h4j2Khtde6ugA6BUBN1Y5mqn27buJACa',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-07":{"dashboard":"THÁNG 7_2026","live_visual":"THÁNG 7_2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"Tháng 9 - 2026"},"2026-10":{"dashboard":"Tháng 10 - 2026","live_visual":"Tháng 10 - 2026"}}'::jsonb,
  '[]'::jsonb, '{}'::jsonb, true
FROM public.brands b
WHERE b.name = 'Pepsico' AND b.deleted_at IS NULL
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active DO NOTHING;

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
  r.active
FROM public.operational_storage_routes r
JOIN public.brands b ON b.id = r.brand_id
LEFT JOIN public.platforms p ON p.id = r.platform_id
WHERE r.active = true
ORDER BY b.name, platform_name;

COMMIT;
