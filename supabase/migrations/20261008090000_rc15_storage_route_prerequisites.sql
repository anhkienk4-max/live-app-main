-- RC1.5 forward-only prerequisite for Production baseline lacking RC1.3A.
-- This DOES NOT run/replay RC1.3A's old create_shift / update_shift RPC bodies.
-- No existing shift/brand classification or storage route is backfilled.
-- An operator must explicitly classify relevant shifts and configure routes before UAT.

alter table public.shifts
  add column if not exists execution_source text null;
alter table public.brands
  add column if not exists storage_profile text null;

-- Store the verified business actor and review timestamp in the same
-- brand UPDATE transaction; no anonymous/unattributed profile conversions.
alter table public.brands
  add column if not exists storage_profile_reviewed_by text
    references public.business_users(id) on delete set null;
alter table public.brands
  add column if not exists storage_profile_reviewed_at timestamptz;

do $route_prereq$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.shifts'::regclass
    and conname = 'shifts_execution_source_check'
  ) then
    alter table public.shifts add constraint shifts_execution_source_check
      check (execution_source in ('internal', 'agency'));
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.brands'::regclass
    and conname = 'brands_storage_profile_check'
  ) then
    alter table public.brands add constraint brands_storage_profile_check
      check (storage_profile in (
        'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD',
        'LEGACY_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_PERIOD_CATEGORY',
        'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1'
      ));
  end if;
end
$route_prereq$;

-- New brands only. Do not silently rewrite historic brand folder layouts.
alter table public.brands
  alter column storage_profile set default 'CANONICAL_V1';

create table if not exists public.operational_storage_routes (
  id text primary key default gen_random_uuid()::text,
  provider text not null
    check (provider in ('google_drive', 'onedrive')),
  execution_source text not null
    check (execution_source in ('internal', 'agency')),
  brand_id text not null references public.brands(id) on delete restrict,
  platform_id text null references public.platforms(id) on delete restrict,
  subbrand_key text null
    check (subbrand_key is null or btrim(subbrand_key) <> ''),
  storage_profile text not null
    check (storage_profile in (
      'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD',
      'LEGACY_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_PERIOD_CATEGORY',
      'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1'
    )),
  root_folder_id text not null check (btrim(root_folder_id) <> ''),
  base_folder_id text not null check (btrim(base_folder_id) <> ''),
  folder_labels jsonb not null default '{}'::jsonb
    check (jsonb_typeof(folder_labels) = 'object'),
  period_naming_style text not null check (btrim(period_naming_style) <> ''),
  period_label_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(period_label_overrides) = 'object'),
  folder_label_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(folder_label_overrides) = 'object'),
  active boolean not null default true,
  approved_by text references public.business_users(id) on delete set null,
  approved_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint operational_storage_routes_subbrand_profile_check
    check (
      (storage_profile in ('LEGACY_SUBBRAND_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_CATEGORY_PERIOD'))
      = (subbrand_key is not null)
    )
);

-- Treat NULL platform/subbrand as exact values, not wildcards.
create unique index if not exists operational_storage_routes_active_key_uidx
  on public.operational_storage_routes
  (provider, execution_source, brand_id, platform_id, subbrand_key)
  nulls not distinct where active;

alter table public.operational_storage_routes enable row level security;
revoke all on table public.operational_storage_routes from public, anon, authenticated;

comment on table public.operational_storage_routes is
  'Privileged provider routes. No default route seed. Route placement requires operator-approved exact keys.';
comment on column public.shifts.execution_source is
  'Nullable until explicit operator classification. NEVER infer existing shifts as internal/agency.';
