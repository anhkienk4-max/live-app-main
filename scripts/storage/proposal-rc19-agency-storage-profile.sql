-- ==============================================================================
-- PROPOSED MIGRATION: proposal-rc19-agency-storage-profile.sql
-- Description: Add TEMP_AGENCY_BRAND_PERIOD_CATEGORY to storage_profile CHECK constraints
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Safety: Backward-compatible, non-breaking, preserves all existing constraints
-- Note: PENDING OWNER REVIEW — DO NOT RUN DIRECTLY ON PRODUCTION WITHOUT OWNER APPROVAL
-- ==============================================================================

BEGIN;

-- Lock safety: Fast fail if table lock cannot be acquired within 2s
SET LOCAL lock_timeout = '2s';

-- 1. Update public.brands constraint
ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS brands_storage_profile_check;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_storage_profile_check
  CHECK (storage_profile IN (
    'LEGACY_CATEGORY_PERIOD',
    'LEGACY_PLATFORM_CATEGORY_PERIOD',
    'LEGACY_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_CATEGORY_PERIOD',
    'CANONICAL_V1',
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM',
    'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
  ));

-- 2. Update public.operational_storage_routes constraint
ALTER TABLE public.operational_storage_routes
  DROP CONSTRAINT IF EXISTS operational_storage_routes_storage_profile_check,
  DROP CONSTRAINT IF EXISTS operational_storage_routes_profile_check;

ALTER TABLE public.operational_storage_routes
  ADD CONSTRAINT operational_storage_routes_storage_profile_check
  CHECK (storage_profile IN (
    'LEGACY_CATEGORY_PERIOD',
    'LEGACY_PLATFORM_CATEGORY_PERIOD',
    'LEGACY_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_CATEGORY_PERIOD',
    'CANONICAL_V1',
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM',
    'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
  ));

COMMENT ON CONSTRAINT operational_storage_routes_storage_profile_check ON public.operational_storage_routes IS
  'Allowed storage routing profiles including agency shared root brand-segregated layout';

COMMIT;
