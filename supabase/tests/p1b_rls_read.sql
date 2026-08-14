-- Read-side P1B RLS persona tests for an isolated local stack.
-- Prerequisites: production bootstrap plus p1b_demo_master_data.sql.
-- Run in one psql session with app.p1b_fixture_mode=isolated-test.

\set ON_ERROR_STOP on

select current_setting('app.p1b_fixture_mode', true) = 'isolated-test'
  as p1b_fixture_mode_ok
\gset
\if :p1b_fixture_mode_ok
\else
  \echo 'p1b_rls_read.sql requires app.p1b_fixture_mode=isolated-test'
  select 1 / 0;
\endif

-- anon has no table grant and cannot read business data.
begin;
set local role anon;
\set ON_ERROR_STOP off
select count(*) from public.brands;
\set anon_read_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :anon_read_rejected
\else
  \echo 'Expected anon SELECT to be denied'
  select 1 / 0;
\endif

-- Member sees the active shared directory and active master data, including
-- the explicitly approved MVP team-wide email/phone fields.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select
  (select count(*) from public.business_users) = 6
  and (select count(email) from public.business_users) = 6
  and (select phone is not null from public.business_users where id = '3')
  and (select count(*) from public.brands) = 4
  and (select count(*) from public.platforms) = 4
  and (select count(*) from public.campaigns) = 3
  as member_read_ok
\gset
rollback;
\if :member_read_ok
\else
  \echo 'Member shared-read contract failed'
  select 1 / 0;
\endif

-- Leader has the same P1B shared-read scope as Member.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select
  (select count(*) from public.business_users) = 6
  and (select count(*) from public.brands) = 4
  and (select count(*) from public.platforms) = 4
  and (select count(*) from public.campaigns) = 3
  as leader_read_ok
\gset
rollback;
\if :leader_read_ok
\else
  \echo 'Leader shared-read contract failed'
  select 1 / 0;
\endif

-- Archived/deleted rows are hidden from Member but visible to Admin.
begin;
insert into public.brands (id, name, status, archived_at)
values ('p1b-rls-archived-brand', 'P1B archived test', 'active', statement_timestamp());

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select count(*) = 0 as member_archive_hidden
from public.brands
where id = 'p1b-rls-archived-brand'
\gset

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select count(*) = 1 as admin_archive_visible
from public.brands
where id = 'p1b-rls-archived-brand'
\gset
rollback;
\if :member_archive_hidden
\else
  \echo 'Member could read an archived row'
  select 1 / 0;
\endif
\if :admin_archive_visible
\else
  \echo 'Admin could not read an archived row'
  select 1 / 0;
\endif

-- An unmapped or inactive identity fails closed.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000999';
select count(*) = 0 as unmapped_hidden from public.brands
\gset
rollback;
\if :unmapped_hidden
\else
  \echo 'Unmapped identity received business data'
  select 1 / 0;
\endif

begin;
update public.business_users set status = 'inactive' where id = '3';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select count(*) = 0 as inactive_hidden from public.brands
\gset
rollback;
\if :inactive_hidden
\else
  \echo 'Inactive identity received business data'
  select 1 / 0;
\endif

-- A client-controlled permission claim cannot reveal archived data.
begin;
insert into public.brands (id, name, status, archived_at)
values ('p1b-rls-forged-brand', 'P1B forged claim test', 'active', statement_timestamp());
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local request.jwt.claim.system_permission = 'admin';
select count(*) = 0 as forged_claim_denied
from public.brands
where id = 'p1b-rls-forged-brand'
\gset
rollback;
\if :forged_claim_denied
  \echo '[OK] P1B RLS read personas'
\else
  \echo 'Client-controlled permission claim escalated access'
  select 1 / 0;
\endif
