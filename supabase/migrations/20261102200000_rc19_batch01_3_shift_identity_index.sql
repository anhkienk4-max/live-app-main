-- RC19 Batch 01.3: Production-Compatible Canonical Shift Identity Unique Index
-- Issue #80, #161, #168: Shift Identity & Parallel Livestream Integrity Gate.
-- Replaces restrictive slot-only index with canonical identity index including Studio and Campaign discriminators.

begin;

-- Step 1: Pre-flight data integrity check
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
      coalesce(lower(btrim(studio)), '') as studio_norm,
      coalesce(campaign_id, '') as campaign_norm,
      count(*)
    from public.shifts
    where deleted_at is null and archived_at is null
    group by
      brand_id,
      platform_id,
      date,
      start_time,
      end_time,
      coalesce(lower(btrim(studio)), ''),
      coalesce(campaign_id, '')
    having count(*) > 1
  ) conflicts;

  if conflict_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'CANNOT_UPGRADE_SHIFT_IDENTITY_INDEX: Existing active shifts contain conflicting canonical identities';
  end if;
end $$;

-- Step 2: Create new canonical shift identity unique index
-- Enables distinct parallel sessions with different studios or campaigns
-- Null-safe: empty/null studio or campaign is mapped to empty string, preventing unconstrained null duplicates
create unique index if not exists shifts_active_identity_uidx
  on public.shifts (
    brand_id,
    platform_id,
    date,
    start_time,
    end_time,
    (coalesce(lower(btrim(studio)), '')),
    (coalesce(campaign_id, ''))
  )
  where deleted_at is null and archived_at is null;

-- Step 3: Safely drop legacy slot-only index
drop index if exists public.shifts_active_slot_uidx;

comment on index public.shifts_active_identity_uidx is
  'RC19 Batch 01.3: Canonical active shift identity index. Supports parallel sessions in distinct studios/campaigns while strictly preventing duplicate shifts.';

commit;

-- ROLLBACK PLAN (for manual rollback if needed):
-- begin;
-- create unique index if not exists shifts_active_slot_uidx
--   on public.shifts (brand_id, platform_id, date, start_time, end_time)
--   where deleted_at is null and archived_at is null;
-- drop index if exists public.shifts_active_identity_uidx;
-- commit;
