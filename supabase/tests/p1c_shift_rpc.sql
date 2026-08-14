-- P1C Shift RPC, authorization, capacity, overlap, timezone and projection tests.
-- Every scenario is isolated in a transaction and rolled back.

\set ON_ERROR_STOP on

select current_setting('app.p1b_fixture_mode', true) = 'isolated-test'
  as p1c_fixture_mode_ok
\gset
\if :p1c_fixture_mode_ok
\else
  \echo 'p1c_shift_rpc.sql requires app.p1b_fixture_mode=isolated-test'
  select 1 / 0;
\endif

-- A Member cannot call management RPCs, even with a forged permission claim.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local request.jwt.claim.system_permission = 'admin';
\set ON_ERROR_STOP off
select public.create_shift(jsonb_build_object(
  'date', (current_date + 40)::text,
  'start_time', '10:00', 'end_time', '12:00',
  'brand_id', 'b1', 'platform_id', 'p1'
));
\set member_create_rejected :ERROR
\set ON_ERROR_STOP on
rollback;
\if :member_create_rejected
\else
  \echo 'Member or forged claim invoked create_shift'
  select 1 / 0;
\endif

-- Leader create/update/lock/reopen; overnight values are authoritative in
-- Asia/Ho_Chi_Minh and the default cutoff follows the derived start time.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select (public.create_shift(jsonb_build_object(
  'date', (current_date + 40)::text,
  'start_time', '23:30', 'end_time', '01:30',
  'brand_id', 'b1', 'platform_id', 'p1',
  'title', 'P1C overnight RPC shift'
))).id as overnight_id
\gset
select
  timezone = 'Asia/Ho_Chi_Minh'
  and crosses_midnight
  and end_date = date + 1
  and duration_minutes = 120
  and start_at at time zone 'Asia/Ho_Chi_Minh' = date + start_time
  and end_at at time zone 'Asia/Ho_Chi_Minh' = end_date + end_time
  and registration_cutoff_at = start_at - interval '6 hours'
  as overnight_timezone_ok
from public.shifts where id = :'overnight_id'
\gset
select (public.update_shift(:'overnight_id', '{"title":"P1C updated"}'::jsonb)).title = 'P1C updated'
  as leader_update_ok
\gset
select (public.set_shift_registration_lock(:'overnight_id', true)).registration_locked
  as leader_lock_ok
\gset
select not (public.set_shift_registration_lock(:'overnight_id', false)).registration_locked
  as leader_reopen_ok
\gset
rollback;
\if :overnight_timezone_ok
\else
  \echo 'Overnight Asia/Ho_Chi_Minh derivation failed'
  select 1 / 0;
\endif
\if :leader_update_ok
\else
  \echo 'Leader update_shift failed'
  select 1 / 0;
\endif
\if :leader_lock_ok
\else
  \echo 'Leader lock failed'
  select 1 / 0;
\endif
\if :leader_reopen_ok
\else
  \echo 'Leader reopen failed'
  select 1 / 0;
\endif

-- Self-registration derives the user from auth.uid. Leader approval updates
-- the compatibility projection; own cancellation clears it again.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select (public.register_for_shift('p1c-open', 'host')).id as own_registration_id
\gset
select user_id = '3' and status = 'pending' as self_registration_ok
from public.shift_registrations where id = :'own_registration_id'
\gset
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select (public.approve_shift_registration(:'own_registration_id', 'approved')).status = 'approved'
  as approval_ok
\gset
select host_id = '3' as approval_projection_ok from public.shifts where id = 'p1c-open'
\gset
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select (public.cancel_own_shift_registration(:'own_registration_id', 'cancelled by owner')).status = 'cancelled'
  as own_cancel_ok
\gset
select host_id is null as cancel_projection_ok from public.shifts where id = 'p1c-open'
\gset
rollback;
\if :self_registration_ok
\else
  \echo 'Self-registration did not derive the authenticated business user'
  select 1 / 0;
\endif
\if :approval_ok
\else
  \echo 'Leader approval failed'
  select 1 / 0;
\endif
\if :approval_projection_ok
\else
  \echo 'Approved registration did not synchronize host_id'
  select 1 / 0;
\endif
\if :own_cancel_ok
\else
  \echo 'Owner cancellation failed'
  select 1 / 0;
\endif
\if :cancel_projection_ok
\else
  \echo 'Cancelled registration did not clear host_id projection'
  select 1 / 0;
\endif

-- Capacity checks run after the shift row lock. Two pending requests may wait,
-- but only one approval may consume the single Host slot.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select (public.register_for_shift('p1c-capacity', 'host')).id as capacity_first_id
\gset
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000004';
select (public.register_for_shift('p1c-capacity', 'host')).id as capacity_second_id
\gset
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select public.approve_shift_registration(:'capacity_first_id');
\set ON_ERROR_STOP off
select public.approve_shift_registration(:'capacity_second_id');
\set capacity_overflow_error :ERROR
\set ON_ERROR_STOP on
rollback;
\if :capacity_overflow_error
\else
  \echo 'SHIFT_FULL was not enforced'
  select 1 / 0;
\endif

-- Pending registrations preserve the current overlap-blocking behavior.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select public.register_for_shift('p1c-overlap-a', 'host');
\set ON_ERROR_STOP off
select public.register_for_shift('p1c-overlap-b', 'host');
\set pending_overlap_error :ERROR
\set ON_ERROR_STOP on
rollback;
\if :pending_overlap_error
\else
  \echo 'SHIFT_CONFLICT did not include a pending registration'
  select 1 / 0;
\endif

-- Manual assignment and removal synchronize the Support projection. Role
-- eligibility remains mandatory for Leader/Admin targets.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select (public.manual_assign_shift_staff('p1c-open', '5', 'support', 'coverage')).id
  as manual_registration_id
\gset
select support_id = '5' as manual_projection_ok from public.shifts where id = 'p1c-open'
\gset
select (public.remove_shift_staffing(:'manual_registration_id', 'removed')).status = 'removed'
  as manual_remove_ok
\gset
select support_id is null as remove_projection_ok from public.shifts where id = 'p1c-open'
\gset
\set ON_ERROR_STOP off
select public.manual_assign_shift_staff('p1c-open', '3', 'support', null);
\set role_eligibility_error :ERROR
\set ON_ERROR_STOP on
rollback;
\if :manual_projection_ok
\else
  \echo 'Manual assignment did not synchronize support_id'
  select 1 / 0;
\endif
\if :manual_remove_ok
\else
  \echo 'Manual removal failed'
  select 1 / 0;
\endif
\if :remove_projection_ok
\else
  \echo 'Manual removal did not clear support_id'
  select 1 / 0;
\endif
\if :role_eligibility_error
  \echo '[OK] P1C Shift RPC, capacity/concurrency contract, timezone and projection tests'
\else
  \echo 'ROLE_NOT_QUALIFIED was not enforced'
  select 1 / 0;
\endif
