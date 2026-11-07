-- RC19 Additive Migration: Shift Operational Notes (P1 Durability + Brand Security)
-- Category tags: normal, attendance, swap, incident, sales, other
-- Durability contract:
--   - Exact shift and business_date alignment
--   - Required fields: shift_id, business_date, category, actual_event_time, affected_role, affected_user_id, note, author_id, version
--   - Fail-closed authorization:
--       * Admin: system-wide read and write
--       * Leader: strictly assigned Brand scope via rc19_leader_brand_scopes (shifts.read / shifts.manage)
--       * Member: only notes on shifts they are assigned to (host/support/technical or approved/manually_assigned registration)
--   - Explicit server-derived author_id in server RPC

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.business_users') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.rc19_leader_brand_scopes') IS NULL
    OR to_regprocedure('private.current_business_user_id()') IS NULL
    OR to_regprocedure('private.current_system_permission()') IS NULL
    OR to_regprocedure('private.current_business_user_is_active()') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL THEN
    RAISE EXCEPTION 'SHIFT_NOTES_DEPENDENCIES_MISSING: apply C3 Leader Brand Scope and shift identity dependencies first';
  END IF;

  IF to_regclass('public.shift_operational_notes') IS NOT NULL
    OR to_regprocedure('private.can_read_shift_operational_notes(text)') IS NOT NULL
    OR to_regprocedure('private.can_write_shift_operational_notes(text)') IS NOT NULL
    OR to_regprocedure('public.add_shift_operational_note(text,date,text,text,timestamp with time zone,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'SHIFT_NOTES_UNEXPECTED_OBJECT: reconcile existing shift note objects before applying this migration';
  END IF;
END;
$$;

create table public.shift_operational_notes (
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

create index shift_operational_notes_shift_idx
  on public.shift_operational_notes (shift_id, created_at desc);

create index shift_operational_notes_date_cat_idx
  on public.shift_operational_notes (business_date, category);

alter table public.shift_operational_notes enable row level security;

-- Brand-scoped Read Authorization
create function private.can_read_shift_operational_notes(p_shift_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.current_business_user_id();
  v_permission text := private.current_system_permission();
  v_shift record;
begin
  if v_actor_id is null or not private.current_business_user_is_active() then
    return false;
  end if;

  if v_permission = 'admin' then
    return true;
  end if;

  select id, brand_id, host_id, support_id, technical_id, deleted_at, archived_at
  into v_shift
  from public.shifts
  where id = p_shift_id;

  if not found or v_shift.deleted_at is not null or v_shift.archived_at is not null then
    return false;
  end if;

  -- Leader: strictly scoped to Brand via rc19_leader_brand_scopes
  if v_permission = 'leader' then
    return coalesce(
      private.rc19_has_any_leader_brand_scope(v_shift.brand_id, array['shifts.read', 'shifts.manage']::text[]),
      false
    );
  end if;

  -- Member: only permitted if actively assigned to the shift
  if v_permission = 'member' then
    return coalesce(
      (
        v_actor_id = v_shift.host_id
        or v_actor_id = v_shift.support_id
        or v_actor_id = v_shift.technical_id
        or exists (
          select 1 from public.shift_registrations r
          where r.shift_id = p_shift_id
            and r.user_id = v_actor_id
            and r.status in ('approved', 'manually_assigned')
        )
      ),
      false
    );
  end if;

  return false;
end;
$$;

-- Brand-scoped Write Authorization
create function private.can_write_shift_operational_notes(p_shift_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.current_business_user_id();
  v_permission text := private.current_system_permission();
  v_shift record;
begin
  if v_actor_id is null or not private.current_business_user_is_active() then
    return false;
  end if;

  if v_permission = 'admin' then
    return true;
  end if;

  select id, brand_id, host_id, support_id, technical_id, deleted_at, archived_at
  into v_shift
  from public.shifts
  where id = p_shift_id;

  if not found or v_shift.deleted_at is not null or v_shift.archived_at is not null then
    return false;
  end if;

  -- Leader: strictly scoped to Brand via rc19_leader_brand_scopes
  if v_permission = 'leader' then
    return coalesce(
      private.rc19_has_any_leader_brand_scope(v_shift.brand_id, array['shifts.manage', 'shifts.read']::text[]),
      false
    );
  end if;

  -- Member: only permitted if actively assigned to the shift
  if v_permission = 'member' then
    return coalesce(
      (
        v_actor_id = v_shift.host_id
        or v_actor_id = v_shift.support_id
        or v_actor_id = v_shift.technical_id
        or exists (
          select 1 from public.shift_registrations r
          where r.shift_id = p_shift_id
            and r.user_id = v_actor_id
            and r.status in ('approved', 'manually_assigned')
        )
      ),
      false
    );
  end if;

  return false;
end;
$$;

revoke all on function private.can_read_shift_operational_notes(text) from public, anon, service_role;
revoke all on function private.can_write_shift_operational_notes(text) from public, anon, authenticated, service_role;
grant execute on function private.can_read_shift_operational_notes(text) to authenticated;

-- Row-level reads are scoped; all writes must pass through the actor-derived RPC below.
create policy shift_operational_notes_select_policy on public.shift_operational_notes
  for select to authenticated
  using (
    deleted_at is null
    and private.can_read_shift_operational_notes(shift_id)
);

revoke all on table public.shift_operational_notes from public, anon, authenticated, service_role;
grant select on table public.shift_operational_notes to authenticated;

-- Authoritative server RPC for adding shift operational notes
create function public.add_shift_operational_note(
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
  v_shift record;
  v_new_note public.shift_operational_notes;
begin
  v_actor_id := private.require_shift_actor(false);
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if not private.can_write_shift_operational_notes(p_shift_id) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null;

  if not found then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_business_date is null or v_shift.date <> p_business_date then
    raise exception 'BUSINESS_DATE_MISMATCH' using errcode = '22023';
  end if;

  if p_category is null or p_category not in ('normal', 'attendance', 'swap', 'incident', 'sales', 'other') then
    raise exception 'INVALID_CATEGORY' using errcode = '22023';
  end if;

  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'NOTE_EMPTY' using errcode = '22023';
  end if;

  if p_affected_role is not null and p_affected_role not in ('host', 'support', 'technical') then
    raise exception 'INVALID_AFFECTED_ROLE' using errcode = '22023';
  end if;

  if p_affected_user_id is not null then
    if not exists (
      select 1 from public.business_users u
      where u.id = p_affected_user_id and u.status = 'active'
    ) then
      raise exception 'AFFECTED_USER_NOT_FOUND' using errcode = '22023';
    end if;
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

revoke all on function public.add_shift_operational_note(text, date, text, text, timestamptz, text, text) from public, anon, service_role;
grant execute on function public.add_shift_operational_note(text, date, text, text, timestamptz, text, text) to authenticated;

COMMIT;
