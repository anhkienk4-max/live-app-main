-- RC19 Batch 01.3.1: Production-Compatible Canonical Shift Identity Unique Index
-- Issue #80, #161, #168: Shift Identity & Parallel Livestream Integrity Gate.
-- Replaces restrictive slot-only index with canonical identity index including Studio and Campaign discriminators.
-- Aligned 1:1 with TypeScript canonical normalization: trim().toLowerCase().replace(/\s+/g, ' ')

begin;

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
-- ROLLBACK & FORWARD-FIX RECOVERY PROTOCOL (For Emergency Operations):
-- ==============================================================================
-- Note on CREATE INDEX CONCURRENTLY:
-- In transactional migration runners (like Supabase CLI db push), CREATE INDEX CONCURRENTLY
-- cannot run inside an explicit transaction block (begin...commit).
-- For production zero-downtime execution outside migrations, run CONCURRENTLY without begin/commit.
--
-- Note on Rollback with Parallel Shifts:
-- If parallel shifts (same brand/platform/slot, distinct studios) were created under
-- shifts_active_identity_uidx, creating legacy shifts_active_slot_uidx directly will fail
-- with unique violation 23505.
-- NEVER delete or merge valid shifts (to protect staffing, registrations, reports, and payroll).
-- Instead, run the Safe Rollback Isolation Protocol below:
--
-- begin;
--   -- Soft-archive any conflicting parallel shifts created after upgrade:
--   with ranked_shifts as (
--     select id,
--       row_number() over (
--         partition by brand_id, platform_id, date, start_time, end_time
--         order by created_at asc
--       ) as slot_rank
--     from public.shifts
--     where deleted_at is null and archived_at is null
--   )
--   update public.shifts
--   set archived_at = now(),
--       deletion_reason = 'ROLLBACK_PARALLEL_SHIFT_PRESERVED'
--   where id in (select id from ranked_shifts where slot_rank > 1);
--
--   create unique index if not exists shifts_active_slot_uidx
--     on public.shifts (brand_id, platform_id, date, start_time, end_time)
--     where deleted_at is null and archived_at is null;
--
--   drop index if exists public.shifts_active_identity_uidx;
-- commit;
-- ==============================================================================
