-- Executable P1B bootstrap failure-contract checks for an isolated local stack.
-- Prerequisites: schema migrations, p1b_auth_users.sql, and the production
-- bootstrap have already been applied. Run this in one psql session with:
--   SET app.p1b_fixture_mode = 'isolated-test';
-- The transactions below always roll back their Auth mutations.

\set ON_ERROR_STOP on

select current_setting('app.p1b_fixture_mode', true) = 'isolated-test'
  as p1b_fixture_mode_ok
\gset
\if :p1b_fixture_mode_ok
\else
  \echo 'p1b_bootstrap_negative.sql requires app.p1b_fixture_mode=isolated-test'
  select 1 / 0;
\endif

-- Missing required Auth user must fail closed.
begin;
delete from auth.users where id = '10000000-0000-4000-8000-000000000006'::uuid;
\set ON_ERROR_STOP off
\ir ../migrations/20260811112834_p1b_production_bootstrap.sql
\set missing_user_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :missing_user_rejected
\else
  \echo 'Expected bootstrap to reject a missing Auth user'
  select 1 / 0;
\endif

-- Incorrect server-controlled business ID metadata must fail closed.
begin;
update auth.users
set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{business_user_id}', '"999"'::jsonb)
where id = '10000000-0000-4000-8000-000000000001'::uuid;
\set ON_ERROR_STOP off
\ir ../migrations/20260811112834_p1b_production_bootstrap.sql
\set wrong_business_id_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :wrong_business_id_rejected
\else
  \echo 'Expected bootstrap to reject a wrong business_user_id'
  select 1 / 0;
\endif

-- Incorrect server-controlled permission metadata must fail closed.
begin;
update auth.users
set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{system_permission}', '"member"'::jsonb)
where id = '10000000-0000-4000-8000-000000000001'::uuid;
\set ON_ERROR_STOP off
\ir ../migrations/20260811112834_p1b_production_bootstrap.sql
\set wrong_permission_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :wrong_permission_rejected
\else
  \echo 'Expected bootstrap to reject a wrong system_permission'
  select 1 / 0;
\endif

-- Duplicate normalized email must fail closed. Supabase permits duplicate
-- emails for SSO identities, so this reproduces the production lookup hazard.
begin;
insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  created_at,
  updated_at,
  is_sso_user
)
select
  '10000000-0000-4000-8000-000000000099'::uuid,
  aud,
  role,
  upper(email),
  email_confirmed_at,
  raw_app_meta_data,
  statement_timestamp(),
  statement_timestamp(),
  true
from auth.users
where id = '10000000-0000-4000-8000-000000000001'::uuid;
\set ON_ERROR_STOP off
\ir ../migrations/20260811112834_p1b_production_bootstrap.sql
\set duplicate_email_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :duplicate_email_rejected
\else
  \echo 'Expected bootstrap to reject a duplicate normalized email'
  select 1 / 0;
\endif

-- A clean rerun remains valid after every negative case rolled back.
\ir ../migrations/20260811112834_p1b_production_bootstrap.sql

select (
  count(*) = 6
  and count(*) filter (where auth_user_id is not null) = 6
  and count(*) filter (where status = 'active' and account_status = 'active') = 6
) as bootstrap_restored
from public.business_users
\gset
\if :bootstrap_restored
  \echo '[OK] P1B bootstrap negative contracts'
\else
  \echo 'Bootstrap baseline was not restored after negative tests'
  select 1 / 0;
\endif
