-- TEST-ONLY P1C fixture. It is outside supabase/migrations and cannot be pushed
-- as production migration data.

do $$
begin
  if current_setting('app.p1b_fixture_mode', true) is distinct from 'isolated-test' then
    raise exception 'p1c_shift_data.sql requires app.p1b_fixture_mode=isolated-test';
  end if;
end;
$$;

insert into public.shifts (
  id, date, start_time, end_time, brand_id, platform_id, title,
  registration_locked, status, updated_by
)
values
  ('p1c-open', current_date + 30, '10:00', '12:00', 'b1', 'p1', 'P1C open shift', false, 'scheduled', '1'),
  ('p1c-closed', current_date + 31, '10:00', '12:00', 'b1', 'p1', 'P1C closed shift', true, 'scheduled', '1'),
  ('p1c-assigned', current_date + 32, '10:00', '12:00', 'b1', 'p1', 'P1C assigned shift', true, 'scheduled', '1'),
  ('p1c-completed', current_date + 33, '10:00', '12:00', 'b1', 'p1', 'P1C completed shift', true, 'completed', '1'),
  ('p1c-capacity', current_date + 34, '10:00', '12:00', 'b1', 'p1', 'P1C capacity shift', false, 'scheduled', '1'),
  ('p1c-overlap-a', current_date + 35, '10:00', '12:00', 'b1', 'p1', 'P1C overlap A', false, 'scheduled', '1'),
  ('p1c-overlap-b', current_date + 35, '11:00', '13:00', 'b2', 'p2', 'P1C overlap B', false, 'scheduled', '1'),
  ('p1c-reject', current_date + 37, '10:00', '12:00', 'b1', 'p1', 'P1C reject shift', false, 'scheduled', '1')
on conflict (id) do nothing;

insert into public.shift_registrations (
  id, shift_id, user_id, operational_role, status, source,
  reviewed_by, reviewed_at
)
values
  ('p1c-assigned-host', 'p1c-assigned', '3', 'host', 'approved', 'legacy_assignment', '1', statement_timestamp()),
  ('p1c-closed-host', 'p1c-closed', '4', 'host', 'approved', 'legacy_assignment', '1', statement_timestamp())
on conflict (id) do nothing;
