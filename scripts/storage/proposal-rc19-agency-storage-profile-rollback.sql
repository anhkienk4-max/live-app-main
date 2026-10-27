-- ==============================================================================
-- PROPOSED ROLLBACK: proposal-rc19-agency-storage-profile-rollback.sql
-- Description: Revert storage_profile CHECK constraints back to original 7 profiles
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Safety: Fails closed if any active route or brand currently uses the new profile
-- ==============================================================================

BEGIN;

-- Lock safety: Fast fail if table lock cannot be acquired within 2s
SET LOCAL lock_timeout = '2s';

-- 1. Safety check: ensure NO records whatsoever (active, inactive, or soft-deleted) use TEMP_AGENCY_BRAND_PERIOD_CATEGORY
-- Reason: PostgreSQL ALTER TABLE ... ADD CONSTRAINT performs a table scan validating every row in the table.
-- Any row with the newer profile will cause the ADD CONSTRAINT statement to throw an exception.
DO $rollback_preflight$
DECLARE
  v_agency_routes_count integer;
  v_agency_brands_count integer;
BEGIN
  SELECT count(*) INTO v_agency_routes_count
  FROM public.operational_storage_routes
  WHERE storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY';

  IF v_agency_routes_count > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL-CLOSED: % route record(s) (including inactive rows) still contain storage_profile = ''TEMP_AGENCY_BRAND_PERIOD_CATEGORY''. Any existing row with this profile will violate the reverted check constraint. Delete or reassign these routes before rolling back.', v_agency_routes_count;
  END IF;

  SELECT count(*) INTO v_agency_brands_count
  FROM public.brands
  WHERE storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY';

  IF v_agency_brands_count > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL-CLOSED: % brand record(s) (including soft-deleted rows) still contain storage_profile = ''TEMP_AGENCY_BRAND_PERIOD_CATEGORY''. Any existing brand with this profile will violate the reverted check constraint. Update or clear brand storage_profile before rolling back.', v_agency_brands_count;
  END IF;
END
$rollback_preflight$;

-- 2. Revert public.operational_storage_routes constraint
ALTER TABLE public.operational_storage_routes
  DROP CONSTRAINT IF EXISTS operational_storage_routes_storage_profile_check;

ALTER TABLE public.operational_storage_routes
  ADD CONSTRAINT operational_storage_routes_storage_profile_check
  CHECK (storage_profile IN (
    'LEGACY_CATEGORY_PERIOD',
    'LEGACY_PLATFORM_CATEGORY_PERIOD',
    'LEGACY_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_CATEGORY_PERIOD',
    'CANONICAL_V1',
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
  ));

-- 3. Revert public.brands constraint
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
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
  ));

COMMIT;
