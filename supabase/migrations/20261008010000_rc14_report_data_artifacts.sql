create table if not exists public.stored_files (
  id text primary key default gen_random_uuid()::text,
  provider text not null check (provider in ('google_drive', 'onedrive')),
  external_file_id text not null,
  external_parent_id text,
  logical_category text not null check (logical_category in ('data_report', 'data_source')),
  folder_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  artifact_key text not null,
  report_id text not null references public.reports(id) on delete cascade,
  shift_id text not null references public.shifts(id) on delete cascade,
  report_version integer,
  uploaded_by text references public.business_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists stored_files_active_artifact_key_idx
  on public.stored_files(report_id, logical_category, artifact_key)
  where deleted_at is null;

create unique index if not exists stored_files_active_provider_object_idx
  on public.stored_files(provider, external_file_id)
  where deleted_at is null;

create index if not exists stored_files_report_category_created_idx
  on public.stored_files(report_id, logical_category, created_at desc)
  where deleted_at is null;

alter table public.stored_files enable row level security;

revoke all on table public.stored_files from anon;
revoke all on table public.stored_files from authenticated;

comment on table public.stored_files is
  'Metadata-only index for externally stored report data artifacts. Binary content must remain in the configured file provider.';
