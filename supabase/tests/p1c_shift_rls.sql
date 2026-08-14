-- P1C Shift RLS persona tests. Run after the P1B fixtures and
-- fixtures/p1c_shift_data.sql in an isolated local database.

\set ON_ERROR_STOP on

select current_setting('app.p1b_fixture_mode', true) = 'isolated-test'
  as p1c_fixture_mode_ok
\gset
\if :p1c_fixture_mode_ok
\else
  \echo 'p1c_shift_rls.sql requires app.p1b_fixture_mode=isolated-test'
  select 1 / 0;
\endif

-- anon has no table grant.
begin;
set local role anon;
\set ON_ERROR_STOP off
select count(*) from public.shifts;
\set anon_read_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :anon_read_rejected
\else
  \echo 'Expected anon Shift SELECT to be denied'
  select 1 / 0;
\endif

-- Member sees open shifts plus own active registrations/compatibility
-- assignments, but not unrelated closed or completed shifts.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select
  exists (select 1 from public.shifts where id = 'p1c-open')
  and exists (select 1 from public.shifts where id = 'p1c-assigned')
  and not exists (select 1 from public.shifts where id = 'p1c-closed')
  and not exists (select 1 from public.shifts where id = 'p1c-completed')
  as member_shift_scope_ok
\gset
select
  exists (select 1 from public.shift_registrations where id = 'p1c-assigned-host')
  and not exists (select 1 from public.shift_registrations where id = 'p1c-closed-host')
  as member_registration_scope_ok
\gset
rollback;
\if :member_shift_scope_ok
\else
  \echo 'Member Shift SELECT scope broadened or lost own assignment'
  select 1 / 0;
\endif
\if :member_registration_scope_ok
\else
  \echo 'Member ShiftRegistration SELECT scope failed'
  select 1 / 0;
\endif

-- Leader sees every non-lifecycle shift; Admin additionally sees deleted rows.
begin;
insert into public.shifts (
  id, date, start_time, end_time, brand_id, platform_id, title,
  status, deleted_at, deleted_by
) values (
  'p1c-deleted', current_date + 38, '10:00', '12:00', 'b1', 'p1',
  'P1C deleted shift', 'cancelled', statement_timestamp(), '1'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select
  exists (select 1 from public.shifts where id = 'p1c-closed')
  and exists (select 1 from public.shifts where id = 'p1c-completed')
  and not exists (select 1 from public.shifts where id = 'p1c-deleted')
  as leader_read_ok
\gset
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select exists (select 1 from public.shifts where id = 'p1c-deleted') as admin_read_ok
\gset
rollback;
\if :leader_read_ok
\else
  \echo 'Leader Shift read scope failed'
  select 1 / 0;
\endif
\if :admin_read_ok
\else
  \echo 'Admin lifecycle Shift read failed'
  select 1 / 0;
\endif

-- Unmapped and inactive identities fail closed.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000999';
select count(*) = 0 as unmapped_hidden from public.shifts
\gset
rollback;
\if :unmapped_hidden
\else
  \echo 'Unmapped identity received Shift data'
  select 1 / 0;
\endif

begin;
update public.business_users set status = 'inactive' where id = '3';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select count(*) = 0 as inactive_hidden from public.shifts
\gset
rollback;
\if :inactive_hidden
\else
  \echo 'Inactive identity received Shift data'
  select 1 / 0;
\endif

-- Raw writes are denied to every API persona, including Admin. Mutations must
-- use the authenticated RPC contract.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
\set ON_ERROR_STOP off
insert into public.shifts (
  id, date, start_time, end_time, brand_id, platform_id, status
) values (
  'p1c-direct-write', current_date + 50, '10:00', '12:00', 'b1', 'p1', 'scheduled'
);
\set admin_direct_write_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :admin_direct_write_rejected
  \echo '[OK] P1C Shift RLS personas'
\else
  \echo 'Admin API identity bypassed the RPC-only write boundary'
  select 1 / 0;
\endif
