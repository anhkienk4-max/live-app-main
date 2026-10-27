-- Disposable PostgreSQL 17 CI fixture ONLY. No real staff or Production data.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table public.brands (id text primary key, name text not null);
create table public.business_users (
  id text primary key, auth_user_id uuid, email text,
  full_name text not null, system_permission text not null,
  status text not null
);
create table public.shifts (
  id text primary key, date date not null, start_time time not null,
  end_time time not null, status text not null, brand_id text,
  host_id text, support_id text, technical_id text
);
create table public.workforce_actual_segments (
  id text primary key default gen_random_uuid()::text,
  shift_id text not null references public.shifts(id),
  staff_id text not null references public.business_users(id),
  operational_role text not null,
  event_kind text not null,
  coverage_kind text not null,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  review_status text not null default 'draft',
  evidence_note text not null,
  created_by text not null references public.business_users(id),
  reviewed_by text references public.business_users(id),
  reviewed_at timestamptz, review_note text,
  constraint reviewed_actor_consistency check (
    (review_status='draft' and reviewed_at is null and reviewed_by is null)
    or (review_status in ('approved','rejected') and reviewed_by is not null
      and reviewed_at is not null and reviewed_by <> created_by)
  )
);

insert into public.brands(id,name) values('brand-1','Synthetic Brand');
insert into public.business_users(id,auth_user_id,email,full_name,system_permission,status) values
 ('admin-1',null,'admin@example.invalid','Synthetic Admin','admin','active'),
 ('worker-1',null,'worker1@example.invalid','Synthetic Worker 1','member','active'),
 ('worker-2',null,'worker2@example.invalid','Synthetic Worker 2','member','active');
insert into public.shifts(id,date,start_time,end_time,status,brand_id,host_id) values
 ('shift-1','2026-10-10','09:00','13:00','completed','brand-1','worker-1');

-- Force a reproducible no-row SELECT FOR UPDATE race.
create or replace function att01_pause_batch_insert() returns trigger
language plpgsql as $$ begin perform pg_sleep(1); return new; end; $$;
create trigger att01_race_batch before insert on public.workforce_attendance_import_batches
for each row execute function att01_pause_batch_insert();

-- Force both confirmations to pass read-side overlap checks before inserts,
-- unless a staff-scoped transaction lock serializes the operations.
create or replace function att01_pause_actual_insert() returns trigger
language plpgsql as $$ begin perform pg_sleep(1); return new; end; $$;
create trigger att01_race_actual before insert on public.workforce_actual_segments
for each row execute function att01_pause_actual_insert();
