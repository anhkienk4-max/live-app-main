-- Write-side P1B RLS persona tests for an isolated local stack.
-- Every mutation runs inside a transaction and is rolled back.

\set ON_ERROR_STOP on

select current_setting('app.p1b_fixture_mode', true) = 'isolated-test'
  as p1b_fixture_mode_ok
\gset
\if :p1b_fixture_mode_ok
\else
  \echo 'p1b_rls_write.sql requires app.p1b_fixture_mode=isolated-test'
  select 1 / 0;
\endif

-- Member cannot insert master data.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
\set ON_ERROR_STOP off
insert into public.brands (id, name, status)
values ('p1b-member-write', 'P1B member write', 'active');
\set member_insert_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :member_insert_rejected
\else
  \echo 'Member INSERT unexpectedly succeeded'
  select 1 / 0;
\endif

-- Member cannot update/delete shared rows or mutate another user's contact or
-- authorization fields. No matching UPDATE/DELETE policy means zero rows.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
with changed as (
  update public.brands set name = 'forbidden' where id = 'b1' returning id
)
select count(*) = 0 as member_update_denied from changed
\gset
with removed as (
  delete from public.brands where id = 'b1' returning id
)
select count(*) = 0 as member_delete_denied from removed
\gset
with changed as (
  update public.business_users
  set phone = '+0000000000', system_permission = 'admin'
  where id = '1'
  returning id
)
select count(*) = 0 as member_sensitive_update_denied from changed
\gset
rollback;
\if :member_update_denied
\else
  \echo 'Member UPDATE unexpectedly affected a row'
  select 1 / 0;
\endif
\if :member_delete_denied
\else
  \echo 'Member DELETE unexpectedly affected a row'
  select 1 / 0;
\endif
\if :member_sensitive_update_denied
\else
  \echo 'Member changed protected user fields'
  select 1 / 0;
\endif

-- Leader remains read-only in P1B.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
\set ON_ERROR_STOP off
insert into public.campaigns (
  id, name, brand_id, start_date, end_date, status
) values (
  'p1b-leader-write', 'P1B leader write', 'b1', current_date, current_date, 'draft'
);
\set leader_insert_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :leader_insert_rejected
\else
  \echo 'Leader INSERT unexpectedly succeeded'
  select 1 / 0;
\endif

-- Admin can create, update, and delete the four P1B tables.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
insert into public.business_users (
  id, email, full_name, role, system_permission, status, account_status
) values (
  'p1b-admin-user', 'p1b-admin-user@example.invalid', 'P1B admin user',
  'staff', 'member', 'active', 'active'
);
insert into public.brands (id, name, status)
values ('p1b-admin-brand', 'P1B admin brand', 'active');
insert into public.platforms (id, name, status)
values ('p1b-admin-platform', 'P1B admin platform', 'active');
insert into public.campaigns (
  id, name, brand_id, start_date, end_date, platform_ids, owner_id, status
) values (
  'p1b-admin-campaign', 'P1B admin campaign', 'p1b-admin-brand',
  current_date, current_date, array['p1b-admin-platform']::text[],
  'p1b-admin-user', 'draft'
);
update public.campaigns
set status = 'active'
where id = 'p1b-admin-campaign';
select count(*) = 1 as admin_update_ok
from public.campaigns
where id = 'p1b-admin-campaign' and status = 'active'
\gset
delete from public.campaigns where id = 'p1b-admin-campaign';
delete from public.platforms where id = 'p1b-admin-platform';
delete from public.brands where id = 'p1b-admin-brand';
delete from public.business_users where id = 'p1b-admin-user';
select
  not exists (select 1 from public.business_users where id = 'p1b-admin-user')
  and not exists (select 1 from public.brands where id = 'p1b-admin-brand')
  and not exists (select 1 from public.platforms where id = 'p1b-admin-platform')
  and not exists (select 1 from public.campaigns where id = 'p1b-admin-campaign')
  as admin_delete_ok
\gset
rollback;
\if :admin_update_ok
\else
  \echo 'Admin UPDATE contract failed'
  select 1 / 0;
\endif
\if :admin_delete_ok
\else
  \echo 'Admin DELETE contract failed'
  select 1 / 0;
\endif

-- Forging a permission claim cannot grant Member write access.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local request.jwt.claim.system_permission = 'admin';
\set ON_ERROR_STOP off
insert into public.brands (id, name, status)
values ('p1b-forged-write', 'P1B forged write', 'active');
\set forged_insert_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :forged_insert_rejected
  \echo '[OK] P1B RLS write personas'
\else
  \echo 'Client-controlled permission claim granted write access'
  select 1 / 0;
\endif
