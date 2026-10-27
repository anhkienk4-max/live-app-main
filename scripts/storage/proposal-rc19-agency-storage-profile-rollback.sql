-- ==============================================================================
-- PROPOSED ROLLBACK: proposal-rc19-agency-storage-profile-rollback.sql
-- Description: Revert storage_profile CHECK constraints back to original 7 profiles
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Safety: Fails closed if any active route or brand currently uses the new profile
-- ==============================================================================

BEGIN;

-- 1. Safety check: ensure no active routes use TEMP_AGENCY_BRAND_PERIOD_CATEGORY
DO $rollback_preflight$
DECLARE
  v_active_agency_routes integer;
  v_active_agency_brands integer;
BEGIN
  SELECT count(*) INTO v_active_agency_routes
  FROM public.operational_storage_routes
  WHERE storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY' AND active = true;

  IF v_active_agency_routes > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL-CLOSED: % active route(s) still use TEMP_AGENCY_BRAND_PERIOD_CATEGORY. Deactivate them first.', v_active_agency_routes;
  END IF;

  SELECT count(*) INTO v_active_agency_brands
  FROM public.brands
  WHERE storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY' AND deleted_at IS NULL;

  IF v_active_agency_brands > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL-CLOSED: % brand(s) still use TEMP_AGENCY_BRAND_PERIOD_CATEGORY. Clear brand profile first.', v_active_agency_brands;
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
