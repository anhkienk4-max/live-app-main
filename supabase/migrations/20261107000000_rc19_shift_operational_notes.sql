-- RC19 Additive Migration: Shift Operational Notes
-- Category tags: normal, attendance, swap, incident, sales, other
-- Preserves existing product_notes and supplemental_fields without conflict.

create table if not exists public.shift_operational_notes (
  id text primary key default gen_random_uuid()::text,
  shift_id text not null references public.shifts(id) on delete cascade,
  date date not null,
  category text not null check (category in ('normal', 'attendance', 'swap', 'incident', 'sales', 'other')),
  note text not null check (btrim(note) <> ''),
  author_id text not null references public.business_users(id) on delete restrict,
  author_name text null,
  author_role text null,
  event_time timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null
);

create index if not exists shift_operational_notes_shift_idx
  on public.shift_operational_notes (shift_id, created_at desc);

create index if not exists shift_operational_notes_date_cat_idx
  on public.shift_operational_notes (date, category);

alter table public.shift_operational_notes enable row level security;

-- Authenticated users can read notes for non-deleted shifts
create policy shift_operational_notes_select_policy on public.shift_operational_notes
  for select to authenticated
  using (deleted_at is null);

-- Assigned staff, Leaders, or Admins can insert notes
create policy shift_operational_notes_insert_policy on public.shift_operational_notes
  for insert to authenticated
  with check (
    author_id = (select auth.uid()::text)
    or exists (
      select 1 from public.business_users u
      where u.id = (select auth.uid()::text) and u.role in ('admin', 'lead', 'team_leader')
    )
  );

grant select, insert, update on public.shift_operational_notes to authenticated;
