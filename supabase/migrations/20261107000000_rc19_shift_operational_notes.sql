-- RC19 Additive Migration: Shift Operational Notes (P1 Durability)
-- Category tags: normal, attendance, swap, incident, sales, other
-- Durability contract:
--   - Exact shift and business_date alignment
--   - Required fields: shift_id, business_date, category, actual_event_time, affected_role, affected_user_id, note, author_id, version
--   - Scoped RLS via private.can_read_shift(shift_id) ensuring brand isolation
--   - Explicit author_id derivation in server RPC

create table if not exists public.shift_operational_notes (
  id text primary key default gen_random_uuid()::text,
  shift_id text not null references public.shifts(id) on delete cascade,
  business_date date not null,
  date date not null,
  category text not null check (category in ('normal', 'attendance', 'swap', 'incident', 'sales', 'other')),
  note text not null check (btrim(note) <> ''),
  author_id text not null references public.business_users(id) on delete restrict,
  author_name text null,
  author_role text null,
  actual_event_time timestamptz not null default statement_timestamp(),
  event_time timestamptz not null default statement_timestamp(),
  affected_role text null check (affected_role is null or affected_role in ('host', 'support', 'technical')),
  affected_user_id text null references public.business_users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null
);

create index if not exists shift_operational_notes_shift_idx
  on public.shift_operational_notes (shift_id, created_at desc);

create index if not exists shift_operational_notes_date_cat_idx
  on public.shift_operational_notes (business_date, category);

alter table public.shift_operational_notes enable row level security;

-- Brand-scoped RLS: notes are visible only to actors permitted to read the parent shift
create policy shift_operational_notes_select_policy on public.shift_operational_notes
  for select to authenticated
  using (
    deleted_at is null
    and (select private.can_read_shift(shift_id))
  );

-- Brand-scoped RLS insert: actor must be able to read shift, and author must be self or leader/admin
create policy shift_operational_notes_insert_policy on public.shift_operational_notes
  for insert to authenticated
  with check (
    (select private.can_read_shift(shift_id))
    and (
      author_id = (select auth.uid()::text)
      or exists (
        select 1 from public.business_users u
        where u.id = (select auth.uid()::text) and u.role in ('admin', 'lead', 'team_leader')
      )
    )
  );

grant select, insert, update on public.shift_operational_notes to authenticated;

-- Authoritative server RPC for adding shift operational notes
create or replace function public.add_shift_operational_note(
  p_shift_id text,
  p_business_date date,
  p_category text,
  p_note text,
  p_actual_event_time timestamptz default statement_timestamp(),
  p_affected_role text default null,
  p_affected_user_id text default null
)
returns public.shift_operational_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text;
  v_actor_name text;
  v_actor_role text;
  v_new_note public.shift_operational_notes;
  v_shift_exists boolean;
begin
  v_actor_id := private.require_shift_actor(false);

  if not private.can_read_shift(p_shift_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select exists (
    select 1 from public.shifts s
    where s.id = p_shift_id and s.deleted_at is null and s.archived_at is null
  ) into v_shift_exists;

  if not v_shift_exists then
    raise exception 'SHIFT_NOT_FOUND';
  end if;

  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'NOTE_EMPTY';
  end if;

  select full_name, coalesce(role, 'staff')
  into v_actor_name, v_actor_role
  from public.business_users
  where id = v_actor_id;

  insert into public.shift_operational_notes (
    shift_id,
    business_date,
    date,
    category,
    note,
    author_id,
    author_name,
    author_role,
    actual_event_time,
    event_time,
    affected_role,
    affected_user_id,
    version
  ) values (
    p_shift_id,
    p_business_date,
    p_business_date,
    p_category,
    btrim(p_note),
    v_actor_id,
    v_actor_name,
    v_actor_role,
    coalesce(p_actual_event_time, statement_timestamp()),
    coalesce(p_actual_event_time, statement_timestamp()),
    p_affected_role,
    p_affected_user_id,
    1
  ) returning * into v_new_note;

  return v_new_note;
end;
$$;
