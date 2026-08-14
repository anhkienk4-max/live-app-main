-- TEST-ONLY fixture. This file is outside supabase/migrations and must never be
-- included in a production push. It creates no sign-in credential material.

do $$
begin
  if current_setting('app.p1b_fixture_mode', true) is distinct from 'isolated-test' then
    raise exception 'p1b_auth_users.sql requires app.p1b_fixture_mode=isolated-test';
  end if;
end;
$$;

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  created_at,
  updated_at
)
values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'authenticated', 'authenticated', 'admin@livestream.com', statement_timestamp(), '{"provider":"email","providers":["email"],"business_user_id":"1","system_permission":"admin"}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'authenticated', 'authenticated', 'leader@livestream.com', statement_timestamp(), '{"provider":"email","providers":["email"],"business_user_id":"2","system_permission":"leader"}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'authenticated', 'authenticated', 'host1@livestream.com', statement_timestamp(), '{"provider":"email","providers":["email"],"business_user_id":"3","system_permission":"member"}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'authenticated', 'authenticated', 'host2@livestream.com', statement_timestamp(), '{"provider":"email","providers":["email"],"business_user_id":"4","system_permission":"member"}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('10000000-0000-4000-8000-000000000005'::uuid, 'authenticated', 'authenticated', 'support1@livestream.com', statement_timestamp(), '{"provider":"email","providers":["email"],"business_user_id":"5","system_permission":"member"}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('10000000-0000-4000-8000-000000000006'::uuid, 'authenticated', 'authenticated', 'technical1@livestream.com', statement_timestamp(), '{"provider":"email","providers":["email"],"business_user_id":"6","system_permission":"member"}'::jsonb, statement_timestamp(), statement_timestamp())
on conflict (id) do update
set
  aud = excluded.aud,
  role = excluded.role,
  email = excluded.email,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  updated_at = excluded.updated_at;
