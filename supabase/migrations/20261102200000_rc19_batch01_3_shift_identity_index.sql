-- RC19 Batch 01.3.1: Production-Compatible Canonical Shift Identity Unique Index
-- Issue #80, #161, #168: Shift Identity & Parallel Livestream Integrity Gate.
-- Replaces restrictive slot-only index with canonical identity index including Studio and Campaign discriminators.
-- Aligned 1:1 with TypeScript canonical normalization: trim().toLowerCase().replace(/\s+/g, ' ')

begin;
set local lock_timeout = '5s';

-- Step 1: Define canonical shift qualifier normalization function
-- Fully compatible with TypeScript normalizeShiftQualifier contract:
-- 1. Trims leading/trailing whitespace
-- 2. Lowercases string
-- 3. Collapses multiple internal whitespace characters (\s+) to a single space
-- 4. Null-safe (NULL -> '')
create or replace function public.normalize_shift_qualifier(val text)
returns text
language sql
immutable
as $$
  select coalesce(regexp_replace(lower(btrim(val)), '\s+', ' ', 'g'), '');
$$;

comment on function public.normalize_shift_qualifier(text) is
  'RC19 Batch 01.3.1: Canonical identity qualifier normalization for Studio and Campaign. Equivalent to TypeScript trim().toLowerCase().replace(/\s+/g, '' '')';

-- Step 2: Pre-flight data integrity check
-- Ensure no active shifts in the live database violate the new canonical identity index
do $$
declare
  conflict_count integer;
begin
  select count(*) into conflict_count
  from (
    select
      brand_id,
      platform_id,
      date,
      start_time,
      end_time,
      public.normalize_shift_qualifier(studio) as studio_norm,
      public.normalize_shift_qualifier(campaign_id) as campaign_norm,
      count(*)
    from public.shifts
    where deleted_at is null and archived_at is null
    group by
      brand_id,
      platform_id,
      date,
      start_time,
      end_time,
      public.normalize_shift_qualifier(studio),
      public.normalize_shift_qualifier(campaign_id)
    having count(*) > 1
  ) conflicts;

  if conflict_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'CANNOT_UPGRADE_SHIFT_IDENTITY_INDEX: Existing active shifts contain conflicting canonical identities';
  end if;
end $$;

-- Step 3: Create new canonical shift identity unique index
-- Enables distinct parallel sessions with different studios or campaigns
-- Null-safe: empty/null studio or campaign is mapped to empty string, preventing unconstrained null duplicates
create unique index if not exists shifts_active_identity_uidx
  on public.shifts (
    brand_id,
    platform_id,
    date,
    start_time,
    end_time,
    (public.normalize_shift_qualifier(studio)),
    (public.normalize_shift_qualifier(campaign_id))
  )
  where deleted_at is null and archived_at is null;

-- Step 4: Safely drop legacy slot-only index
drop index if exists public.shifts_active_slot_uidx;

comment on index public.shifts_active_identity_uidx is
  'RC19 Batch 01.3.1: Canonical active shift identity index. Supports parallel sessions in distinct studios/campaigns while strictly preventing duplicate shifts.';

commit;

-- ==============================================================================
-- DISASTER RECOVERY & FORWARD-FIX PROTOCOL:
-- ==============================================================================
-- ARCHITECTURAL BOUNDARY: IRREVERSIBLE COMPATIBILITY UPGRADE
-- Once parallel shifts (same slot, distinct physical studios or campaigns) are created
-- under shifts_active_identity_uidx, legacy index shifts_active_slot_uidx CANNOT be
-- restored while preserving active business operations.
--
-- DO NOT ATTEMPT TO SOFT-ARCHIVE PARALLEL SHIFTS (e.g. UPDATE shifts SET archived_at = now()).
-- Soft-archived shifts disappear from active calendar queries (where deleted_at is null
-- and archived_at is null), causing operational data loss across Staffing, Check-in,
-- Attendance, Reports, and Payroll.
--
-- APPROVED DISASTER RECOVERY: FORWARD-FIX / APPLICATION ROLLBACK
-- 1. If an application bug is identified after deployment, roll back application code
--    to a version compatible with canonical identity. shifts_active_identity_uidx is a
--    strict superset of uniqueness constraints that permits parallel studios while
--    guaranteeing slot uniqueness for single-session shifts.
-- 2. If invalid duplicate shifts were imported due to bad input data, perform targeted
--    reconciliation or soft-deletion ONLY on the erroneous duplicate records after
--    verifying there are no approved registrations, reports, or payroll lines attached.
-- 3. Migration Pre-flight Guard:
--    Step 2 above enforces that no existing active shifts in the database violate
--    shifts_active_identity_uidx before creating the index.
-- ==============================================================================
