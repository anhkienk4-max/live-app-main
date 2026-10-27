-- ==============================================================================
-- RC19 STO-01: PRODUCTION STORAGE ROUTE ACTIVATION SCRIPT
-- Generated from: config/storage-v1-production-routes.proposed.json
-- Root: 1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm (Google Drive)
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- ==============================================================================

BEGIN;

-- 1. Ensure brands storage_profile is classified appropriately
UPDATE public.brands 
SET storage_profile = 'CANONICAL_V1'
WHERE name = 'ASM AI Livestream'
  AND (storage_profile IS NULL OR storage_profile = 'CANONICAL_V1');
UPDATE public.brands 
SET storage_profile = 'CANONICAL_V1'
WHERE name = 'Female AI livestream'
  AND (storage_profile IS NULL OR storage_profile = 'CANONICAL_V1');
UPDATE public.brands 
SET storage_profile = 'CANONICAL_V1'
WHERE name = 'Male AI livestream'
  AND (storage_profile IS NULL OR storage_profile = 'CANONICAL_V1');
UPDATE public.brands 
SET storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
WHERE name = 'ASTROMAN'
  AND (storage_profile IS NULL OR storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY');
UPDATE public.brands 
SET storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
WHERE name = 'CUREL'
  AND (storage_profile IS NULL OR storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY');
UPDATE public.brands 
SET storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
WHERE name = 'Female'
  AND (storage_profile IS NULL OR storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY');
UPDATE public.brands 
SET storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
WHERE name = 'KATE'
  AND (storage_profile IS NULL OR storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY');
UPDATE public.brands 
SET storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
WHERE name = 'OPELLA'
  AND (storage_profile IS NULL OR storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY');
UPDATE public.brands 
SET storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
WHERE name = 'Pepsico'
  AND (storage_profile IS NULL OR storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY');
UPDATE public.brands 
SET storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
WHERE name = 'X-men'
  AND (storage_profile IS NULL OR storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY');
UPDATE public.brands 
SET storage_profile = 'LEGACY_CATEGORY_PERIOD'
WHERE name = 'Mars Snacking'
  AND (storage_profile IS NULL OR storage_profile = 'LEGACY_CATEGORY_PERIOD');
UPDATE public.brands 
SET storage_profile = 'LEGACY_PERIOD_CATEGORY'
WHERE name = 'KAO'
  AND (storage_profile IS NULL OR storage_profile = 'LEGACY_PERIOD_CATEGORY');

-- 2. Insert operational_storage_routes for approved brands and platforms

-- Route 1: ASM AI Livestream (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'CANONICAL_V1',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '{}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'ASM AI Livestream'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 2: Female AI livestream (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'CANONICAL_V1',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '{}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'Female AI livestream'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 3: Male AI livestream (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'CANONICAL_V1',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '{}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'Male AI livestream'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 4: ASTROMAN (All Platforms) [agency]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'agency',
  b.id,
  NULL,
  NULL,
  'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'ASTROMAN'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 5: CUREL (All Platforms) [agency]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'agency',
  b.id,
  NULL,
  NULL,
  'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'CUREL'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 6: Female (All Platforms) [agency]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'agency',
  b.id,
  NULL,
  NULL,
  'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'Female'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 7: KATE (All Platforms) [agency]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'agency',
  b.id,
  NULL,
  NULL,
  'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'KATE'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 8: OPELLA (All Platforms) [agency]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'agency',
  b.id,
  NULL,
  NULL,
  'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'OPELLA'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 9: Pepsico (All Platforms) [agency]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'agency',
  b.id,
  NULL,
  NULL,
  'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'Pepsico'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 10: X-men (All Platforms) [agency]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'agency',
  b.id,
  NULL,
  NULL,
  'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'X-men'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 11: Mars Snacking (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'LEGACY_CATEGORY_PERIOD',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1SuQhXZsNr7eArHVwf9NMTqR1TEHYqOC5',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DASH_YEAR',
  '{"2026-01":{"dashboard":"tháng 1 - 2026","live_visual":"Tháng 1 - 2026"},"2026-02":{"dashboard":"THÁNG 02-2026","live_visual":"THÁNG 02-2026"},"2026-03":{"dashboard":"THÁNG 03 - 2026","live_visual":"THÁNG 03 - 2026"},"2026-04":{"dashboard":"THÁNG 04 - 2026","live_visual":"Tháng 04-2026"},"2026-05":{"dashboard":"THÁNG 05-2026","live_visual":"THÁNG 5.2026"},"2026-06":{"dashboard":"Tháng 6 - 2026","live_visual":"THÁNG 6-2026"},"2026-07":{"dashboard":"Tháng 7-2026","live_visual":"Tháng 7-2026"},"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"Tháng 9 - 2026"},"2026-10":{"dashboard":"Tháng 10 - 2026","live_visual":"THÁNG 10 -2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'Mars Snacking'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 12: Mars Snacking (All Platforms) [agency]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'agency',
  b.id,
  NULL,
  NULL,
  'LEGACY_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '19cuLMvhVB8yfJslZUbLUdrsDLQ_vincE',
  '{"dashboard":"DASHBOARD","live_visual_agency":"VISUAL HOST","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_M_DOT_YEAR',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'Mars Snacking'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 13: ASTROMAN (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'LEGACY_CATEGORY_PERIOD',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1J5rnrodawxZjngKCu-thqb9peoaaMGXE',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'ASTROMAN'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 14: Female (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'LEGACY_CATEGORY_PERIOD',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1QcV_-vU35f3g262h8CXgugCkSLfgBHsZ',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 6. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THÁNG 8.2026","live_visual":"THÁNG 8.2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'Female'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 15: X-men (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'LEGACY_CATEGORY_PERIOD',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '16X2rvIuTGj_Raw2wA3bBtEAAJY53Sv_i',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 6. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THÁNG 8.2026","live_visual":"THÁNG 8.2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'X-men'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 16: CUREL (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'LEGACY_CATEGORY_PERIOD',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1v0qrSIT6f1pUQ8hJfbZDvJBV3s9P972-',
  '{"dashboard":"Dashboard","live_visual_internal":"Visibility","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'CUREL'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 17: KATE (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'LEGACY_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '15I5HIGnOcKiV60aKTrk0aTRfy8pmX6uX',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"KATE T6.2026","live_visual":"KATE T6.2026"},"2026-07":{"dashboard":"KATE T7.2026","live_visual":"KATE T7.2026"}}'::jsonb,
  '[]'::jsonb,
  '{"2026-07":{"dashboard":"Dashboard","live_visual":"Visibility"}}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'KATE'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 18: KAO (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'LEGACY_PERIOD_CATEGORY',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1oq5p4_f69TuPmVP1oRfmHpErwwovKmB8',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-01":{"dashboard":"T1.2026","live_visual":"T1.2026"},"2026-03":{"dashboard":"T3.2026","live_visual":"T3.2026"},"2026-04":{"dashboard":"T4.2026","live_visual":"T4.2026"},"2026-05":{"dashboard":"T5.2026","live_visual":"T5.2026"},"2026-06":{"dashboard":"T6.2026 - KAO SIS","live_visual":"T6.2026 - KAO SIS"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"T8.2026 ","live_visual":"T8.2026 "},"2026-09":{"dashboard":"T9.2026","live_visual":"T9.2026"}}'::jsonb,
  '[]'::jsonb,
  '{"2026-01":{"dashboard":"Dashboard","live_visual":"Visibility"}}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'KAO'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 19: OPELLA (Shopee Live) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  (SELECT id FROM public.platforms WHERE name = 'Shopee Live' LIMIT 1),
  NULL,
  'LEGACY_CATEGORY_PERIOD',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1ZxI1VB0x5K8eADDig9suD-4qPTMCK8f-',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-06":{"dashboard":"THÁNG 6. 2026","live_visual":"THÁNG 06. 2026"},"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"Tháng 8 - 2026","live_visual":"Tháng 8 - 2026"},"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'OPELLA'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 20: OPELLA (TikTok Shop) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  (SELECT id FROM public.platforms WHERE name = 'TikTok Shop' LIMIT 1),
  NULL,
  'LEGACY_CATEGORY_PERIOD',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1Ww8oPGDLiadsXvY9yP0UUIdqkMI-s0jp',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-07":{"dashboard":"THÁNG 7. 2026","live_visual":"THÁNG 7. 2026"},"2026-08":{"dashboard":"THANG 8 2026","live_visual":"THANGS 8 2026"},"2026-09":{"dashboard":"THÁNG 9. 2026","live_visual":"THÁNG 9. 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'OPELLA'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- Route 21: Pepsico (All Platforms) [internal]
INSERT INTO public.operational_storage_routes (
  provider,
  execution_source,
  brand_id,
  platform_id,
  subbrand_key,
  storage_profile,
  root_folder_id,
  base_folder_id,
  folder_labels,
  period_naming_style,
  period_label_overrides,
  period_date_ranges,
  folder_label_overrides,
  active
)
SELECT 
  'google_drive',
  'internal',
  b.id,
  NULL,
  NULL,
  'LEGACY_CATEGORY_PERIOD',
  '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  '1h4j2Khtde6ugA6BUBN1Y5mqn27buJACa',
  '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
  'THANG_UPPER_M_DASH_YEAR',
  '{"2026-07":{"dashboard":"THÁNG 7_2026","live_visual":"THÁNG 7_2026"},"2026-09":{"dashboard":"Tháng 9 - 2026","live_visual":"Tháng 9 - 2026"},"2026-10":{"dashboard":"Tháng 10 - 2026","live_visual":"Tháng 10 - 2026"}}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
FROM public.brands b
WHERE b.name = 'Pepsico'
ON CONFLICT (provider, execution_source, brand_id, platform_id, subbrand_key) 
WHERE active 
DO UPDATE SET
  storage_profile = EXCLUDED.storage_profile,
  root_folder_id = EXCLUDED.root_folder_id,
  base_folder_id = EXCLUDED.base_folder_id,
  folder_labels = EXCLUDED.folder_labels,
  period_naming_style = EXCLUDED.period_naming_style,
  period_label_overrides = EXCLUDED.period_label_overrides,
  period_date_ranges = EXCLUDED.period_date_ranges,
  folder_label_overrides = EXCLUDED.folder_label_overrides,
  updated_at = statement_timestamp();

-- 3. Verification query to confirm activated routes count
SELECT 
  r.id,
  b.name AS brand_name,
  p.name AS platform_name,
  r.execution_source,
  r.storage_profile,
  r.base_folder_id,
  r.active
FROM public.operational_storage_routes r
JOIN public.brands b ON b.id = r.brand_id
LEFT JOIN public.platforms p ON p.id = r.platform_id
WHERE r.active = true
ORDER BY b.name, p.name;

COMMIT;
