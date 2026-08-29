-- Core V1 timezone contract.  Existing local projections remain the display
-- contract; start_at/end_at are recalculated as absolute instants by IANA zone.
-- This migration is intentionally forward-only and does not rewrite existing rows.

alter table public.shifts drop constraint if exists shifts_timezone_check;
alter table public.shifts
  add constraint shifts_timezone_check check (btrim(timezone) <> '') not valid;

create or replace function private.set_shift_derived_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_cutoff_was_default boolean := false;
begin
  if new.timezone is null or btrim(new.timezone) = ''
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = new.timezone
    )
  then
    raise exception using errcode = '22023', message = 'SHIFT_TIMEZONE_INVALID';
  end if;
  if new.start_time = new.end_time then
    raise exception using errcode = '22023', message = 'SHIFT_DURATION_INVALID';
  end if;

  if tg_op = 'UPDATE' then
    old_cutoff_was_default := old.registration_cutoff_at = old.start_at - interval '6 hours';
  end if;

  new.end_date := new.date + case when new.end_time < new.start_time then 1 else 0 end;
  new.crosses_midnight := new.end_date > new.date;
  new.start_at := (new.date + new.start_time) at time zone new.timezone;
  new.end_at := (new.end_date + new.end_time) at time zone new.timezone;
  new.duration_minutes := (extract(epoch from (new.end_at - new.start_at)) / 60)::smallint;

  if new.registration_cutoff_at is null
    or (
      tg_op = 'UPDATE'
      and old_cutoff_was_default
      and (
        new.date is distinct from old.date
        or new.start_time is distinct from old.start_time
        or new.end_time is distinct from old.end_time
        or new.timezone is distinct from old.timezone
      )
    )
  then
    new.registration_cutoff_at := new.start_at - interval '6 hours';
  end if;
  return new;
end;
$$;

revoke all on function private.set_shift_derived_fields() from public, anon, authenticated;

comment on column public.shifts.timezone is
  'IANA business timezone used to derive canonical start_at/end_at timestamps.';
