-- RC1.5 Storage Contract V2 (stage only; apply after code/test review).
-- Dedicated metadata-only index for general operational artifacts. Existing stored_files stays unchanged.
create table if not exists public.operational_files (
  id text primary key default gen_random_uuid()::text,
  scope_key text not null check (length(btrim(scope_key)) > 0),
  category text not null check (category in ('schedule_source', 'schedule_export', 'live_snapshot', 'video_recording', 'video_livecut', 'production_asset', 'content_script', 'content_brief', 'campaign_document', 'staffing_document', 'acceptance_document', 'payment_document', 'ai_output', 'system_export', 'sop_document')),
  brand_id text not null references public.brands(id) on delete restrict,
  platform_id text not null references public.platforms(id) on delete restrict,
  shift_id text references public.shifts(id) on delete restrict,
  campaign_id text references public.campaigns(id) on delete restrict,
  period_date date not null,
  execution_source text not null check (execution_source in ('internal', 'agency')),
  provider text not null check (provider in ('google_drive', 'onedrive')),
  external_file_id text not null,
  external_parent_id text not null,
  provider_metadata jsonb not null default '{}'::jsonb,
  folder_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}
  artifact_key text not null,
  uploaded_by text references public.business_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists operational_files_active_scope_checksum
  on public.operational_files(scope_key, category, artifact_key)
  where deleted_at is null;
create unique index if not exists operational_files_active_provider_object
  on public.operational_files(provider, external_file_id)
  where deleted_at is null;
create index if not exists operational_files_scope_created
  on public.operational_files(scope_key, created_at desc)
  where deleted_at is null;
create index if not exists operational_files_brand_month
  on public.operational_files(brand_id, platform_id, period_date, category)
  where deleted_at is null;

alter table public.operational_files enable row level security;
revoke all on table public.operational_files from public, anon, authenticated;
comment on table public.operational_files is
  'Metadata-only external provider artifacts for operational files. No binary/base64 content allowed; API access through permission-gated server routes.';
),
  integrity_status text not null default 'sha256_verified'
    check (integrity_status in ('sha256_verified', 'provider_reference')),
  constraint operational_files_integrity_contract check (
    (integrity_status = 'sha256_verified' and checksum_sha256 is not null and size_bytes > 0)
    or (integrity_status = 'provider_reference' and checksum_sha256 is null)
  ),
  artifact_key text not null,
  uploaded_by text references public.business_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists operational_files_active_scope_checksum
  on public.operational_files(scope_key, category, artifact_key)
  where deleted_at is null;
create unique index if not exists operational_files_active_provider_object
  on public.operational_files(provider, external_file_id)
  where deleted_at is null;
create index if not exists operational_files_scope_created
  on public.operational_files(scope_key, created_at desc)
  where deleted_at is null;
create index if not exists operational_files_brand_month
  on public.operational_files(brand_id, platform_id, period_date, category)
  where deleted_at is null;

alter table public.operational_files enable row level security;
revoke all on table public.operational_files from public, anon, authenticated;
comment on table public.operational_files is
  'Metadata-only external provider artifacts for operational files. No binary/base64 content allowed; API access through permission-gated server routes.';
