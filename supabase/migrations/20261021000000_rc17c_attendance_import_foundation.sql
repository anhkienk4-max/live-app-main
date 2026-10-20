-- RC1.7C: Historical Attendance Import Staging & Provenance Ledger
-- TARGET ENVIRONMENT: LOCAL / STAGING TEST FIXTURES ONLY.
-- DO NOT RUN ON PRODUCTION WITHOUT EXPLICIT AUTHORIZATION.

-- 1. Create table for Attendance Import Batches
create table if not exists public.workforce_attendance_import_batches (
  id text primary key default gen_random_uuid()::text,
  source_type text not null check (source_type in ('google_sheets', 'excel_upload', 'csv_upload', 'shift_manager_control')),
  source_name text not null,
  source_fingerprint text not null, -- SHA-256 hash of raw input content for idempotency
  brand_id text references public.brands(id) on delete restrict,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  status text not null default 'draft' check (status in ('draft', 'staged', 'confirmed', 'failed', 'cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  matched_rows integer not null default 0 check (matched_rows >= 0),
  exception_rows integer not null default 0 check (exception_rows >= 0),
  drafted_segments integer not null default 0 check (drafted_segments >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references public.business_users(id),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version >= 1)
);

create index if not exists idx_attendance_import_batches_fingerprint
  on public.workforce_attendance_import_batches (source_fingerprint);

-- 2. Create table for Attendance Import Rows (Row-level Provenance)
create table if not exists public.workforce_attendance_import_rows (
  id text primary key default gen_random_uuid()::text,
  batch_id text not null references public.workforce_attendance_import_batches(id) on delete cascade,
  source_row_number integer not null check (source_row_number > 0),
  raw_payload jsonb not null,
  parsed_date date,
  parsed_start_time text,
  parsed_end_time text,
  parsed_start_at timestamptz,
  parsed_end_at timestamptz,
  raw_staff_name text,
  raw_role text,
  raw_notes text,
  matched_shift_id text references public.shifts(id) on delete set null,
  matched_staff_id text references public.business_users(id) on delete set null,
  operational_role text check (operational_role in ('host', 'support', 'technical')),
  coverage_kind text not null default 'planned' check (coverage_kind in ('planned', 'cover', 'replacement', 'extra')),
  evidence_kind text not null check (evidence_kind in ('actual_punch', 'supervisor_verified', 'missing_evidence')),
  status text not null default 'pending' check (status in ('pending', 'matched', 'exception', 'drafted', 'rejected')),
  exception_code text check (exception_code in (
    'SHIFT_NOT_FOUND',
    'STAFF_NOT_FOUND',
    'ROLE_AMBIGUOUS',
    'MISSING_EVIDENCE',
    'SHIFT_NOT_COMPLETED',
    'TIME_RANGE_INVALID',
    'OVERLAP_CONFLICT',
    'UNRESOLVED_PASS',
    'AMBIGUOUS_DATE_ORDER',
    'WEEKDAY_MISMATCH',
    'INVALID_CONTROL_STRUCTURE'
  )),
  exception_detail text,
  resulting_segment_id text references public.workforce_actual_segments(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint attendance_import_row_unique unique (batch_id, source_row_number)
);

create index if not exists idx_attendance_import_rows_batch_status
  on public.workforce_attendance_import_rows (batch_id, status);

create index if not exists idx_attendance_import_rows_shift
  on public.workforce_attendance_import_rows (matched_shift_id);

create index if not exists idx_attendance_import_rows_staff
  on public.workforce_attendance_import_rows (matched_staff_id);

-- 3. Row Level Security & RBAC
alter table public.workforce_attendance_import_batches enable row level security;
alter table public.workforce_attendance_import_rows enable row level security;

-- Service Role full access
drop policy if exists workforce_attendance_batches_service_role on public.workforce_attendance_import_batches;
create policy workforce_attendance_batches_service_role
  on public.workforce_attendance_import_batches
  for all to service_role using (true) with check (true);

drop policy if exists workforce_attendance_rows_service_role on public.workforce_attendance_import_rows;
create policy workforce_attendance_rows_service_role
  on public.workforce_attendance_import_rows
  for all to service_role using (true) with check (true);

-- Authenticated Admin and Leader access
drop policy if exists workforce_attendance_batches_admin_leader on public.workforce_attendance_import_batches;
create policy workforce_attendance_batches_admin_leader
  on public.workforce_attendance_import_batches
  for all to authenticated
  using (
    exists (
      select 1 from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.system_permission in ('admin', 'leader')
        and bu.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.system_permission in ('admin', 'leader')
        and bu.status = 'active'
    )
  );

drop policy if exists workforce_attendance_rows_admin_leader on public.workforce_attendance_import_rows;
create policy workforce_attendance_rows_admin_leader
  on public.workforce_attendance_import_rows
  for all to authenticated
  using (
    exists (
      select 1 from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.system_permission in ('admin', 'leader')
        and bu.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.system_permission in ('admin', 'leader')
        and bu.status = 'active'
    )
  );
