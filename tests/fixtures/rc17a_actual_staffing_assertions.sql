-- RC1.7A: Database Integration Assertions
-- Verifies draft creation, audit create, independent reviewer approve/reject,
-- correlation_id NOT NULL, self-approval prevention, double-approval prevention,
-- overlapping shift prevention, no-show conflict prevention, transaction rollback,
-- sensitive data redaction, and Leader RLS read permissions.

-- 1. Helper assertion functions
create or replace function public.rc17a_assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is distinct from true then
    raise exception 'RC17A_ASSERT_FAILED: %', p_label;
  end if;
  raise notice 'RC17A_PASS: %', p_label;
end;
$$;

create or replace function public.rc17a_assert_denied(p_command text, p_state text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_command;
  exception when others then
    if sqlstate = p_state or sqlerrm like '%' || p_state || '%' then
      raise notice 'RC17A_PASS: %', p_label;
      return;
    end if;
    raise;
  end;
  raise exception 'RC17A_EXPECTED_DENIAL: % (expected %)', p_label, p_state;
end;
$$;

-- Setup initial test data
insert into public.business_users (id, full_name, system_permission) values
  ('admin-1', 'Admin Operator', 'admin'),
  ('leader-creator', 'Leader Creator', 'leader'),
  ('leader-reviewer', 'Leader Reviewer', 'leader'),
  ('host-1', 'Official Host 1', 'member'),
  ('host-2', 'Official Host 2', 'member'),
  ('support-1', 'Assistant Support 1', 'member')
on conflict (id) do update set
  full_name = excluded.full_name,
  system_permission = excluded.system_permission;

insert into public.shifts (id, status, date, start_time, end_time, host_id, support_id) values
  ('shift-completed-1', 'completed', '2026-10-17', '19:00:00', '21:00:00', 'host-1', 'support-1'),
  ('shift-completed-2', 'completed', '2026-10-17', '20:00:00', '22:00:00', 'host-2', null),
  ('shift-scheduled-1', 'scheduled', '2026-10-18', '19:00:00', '21:00:00', 'host-1', null)
on conflict (id) do update set
  status = excluded.status;

-- TEST 1: Tạo phân đoạn draft và xác minh audit create + correlation_id NOT NULL
insert into public.workforce_actual_segments (
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, review_status, evidence_note, created_by
) values (
  'seg-draft-1', 'shift-completed-1', 'host-1', 'host', 'worked', 'planned',
  '2026-10-17 19:00:00+07', '2026-10-17 21:00:00+07', 'draft', 'Clock-in log verified on stream', 'leader-creator'
);

select public.rc17a_assert(
  (select count(*) = 1 from public.audit_logs where entity_id = 'seg-draft-1'),
  'Audit log created exactly once on draft insert'
);

select public.rc17a_assert(
  (select action = 'create' and module = 'calendar' and entity_type = 'workforce_actual_segment'
   from public.audit_logs where entity_id = 'seg-draft-1'),
  'Draft audit log has action = create and module = calendar'
);

select public.rc17a_assert(
  (select actor_business_user_id = 'leader-creator'
   from public.audit_logs where entity_id = 'seg-draft-1'),
  'Draft audit log actor is creator'
);

-- CONTRACT ASSERTION: correlation_id is NOT NULL, non-empty, and satisfies UUID v4 format
select public.rc17a_assert(
  (select correlation_id is not null
          and btrim(correlation_id) <> ''
          and correlation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   from public.audit_logs where entity_id = 'seg-draft-1'),
  'correlation_id satisfies actual database contract (NOT NULL, non-empty, UUID v4 format)'
);

select public.rc17a_assert(
  (select after_data->>'review_status' = 'draft' and before_data is null
   from public.audit_logs where entity_id = 'seg-draft-1'),
  'Draft audit log contains after_data draft status and null before_data'
);

-- TEST 2: Reviewer khác người tạo approve và xác minh audit action = approve
update public.workforce_actual_segments
set review_status = 'approved',
    reviewed_by = 'leader-reviewer',
    reviewed_at = statement_timestamp(),
    review_note = 'Evidence confirmed with video stream check',
    version = 2
where id = 'seg-draft-1' and version = 1;

select public.rc17a_assert(
  (select count(*) = 2 from public.audit_logs where entity_id = 'seg-draft-1'),
  'Audit log appends second record for approval'
);

select public.rc17a_assert(
  (select action = 'approve' and actor_business_user_id = 'leader-reviewer'
          and correlation_id is not null and btrim(correlation_id) <> ''
   from public.audit_logs where entity_id = 'seg-draft-1' order by created_at desc limit 1),
  'Approval audit log has action = approve, reviewer actor, and non-null correlation_id'
);

-- TEST 3: Reviewer khác người tạo reject và xác minh audit action = reject
insert into public.workforce_actual_segments (
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, review_status, evidence_note, created_by
) values (
  'seg-draft-2', 'shift-completed-1', 'support-1', 'support', 'worked', 'planned',
  '2026-10-17 19:00:00+07', '2026-10-17 21:00:00+07', 'draft', 'Support clock in evidence', 'leader-creator'
);

update public.workforce_actual_segments
set review_status = 'rejected',
    reviewed_by = 'leader-reviewer',
    reviewed_at = statement_timestamp(),
    review_note = 'Evidence rejected - support left early without authorization',
    version = 2
where id = 'seg-draft-2' and version = 1;

select public.rc17a_assert(
  (select action = 'reject' and actor_business_user_id = 'leader-reviewer'
          and correlation_id is not null
   from public.audit_logs where entity_id = 'seg-draft-2' order by created_at desc limit 1),
  'Rejection audit log has action = reject, reviewer actor, and non-null correlation_id'
);

-- TEST 4: Self-approval rejection (reviewed_by <> created_by)
insert into public.workforce_actual_segments (
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, review_status, evidence_note, created_by
) values (
  'seg-self-test', 'shift-completed-2', 'host-2', 'host', 'worked', 'planned',
  '2026-10-17 20:00:00+07', '2026-10-17 22:00:00+07', 'draft', 'Host 2 clock in note', 'leader-creator'
);

select public.rc17a_assert_denied(
  'update public.workforce_actual_segments set review_status = ''approved'', reviewed_by = ''leader-creator'', reviewed_at = statement_timestamp(), review_note = ''Self approval attempt'', version = 2 where id = ''seg-self-test''',
  '23514',
  'reviewed_actor_consistency blocks self-approval (reviewed_by = created_by)'
);

-- TEST 5: Double approval / Immutability rejection (WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE)
select public.rc17a_assert_denied(
  'update public.workforce_actual_segments set review_status = ''approved'', review_note = ''Double approval attempt'', version = 3 where id = ''seg-draft-1''',
  'P0001',
  'workforce_actual_guard blocks double approval / mutation of approved segment'
);

-- TEST 6: Incomplete shift approval rejection (WORKFORCE_SHIFT_NOT_COMPLETED)
insert into public.workforce_actual_segments (
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, review_status, evidence_note, created_by
) values (
  'seg-sched-test', 'shift-scheduled-1', 'host-1', 'host', 'worked', 'planned',
  '2026-10-18 19:00:00+07', '2026-10-18 21:00:00+07', 'draft', 'Premature attendance claim', 'leader-creator'
);

select public.rc17a_assert_denied(
  'update public.workforce_actual_segments set review_status = ''approved'', reviewed_by = ''leader-reviewer'', reviewed_at = statement_timestamp(), review_note = ''Premature approval attempt'', version = 2 where id = ''seg-sched-test''',
  'P0001',
  'workforce_actual_guard blocks approving segment on scheduled shift'
);

-- TEST 7: Cross-shift Overlap rejection (WORKFORCE_APPROVED_STAFF_OVERLAP)
-- seg-draft-1 is already approved for host-1 on shift-completed-1 (19:00 - 21:00)
-- Create seg on shift-completed-2 for host-1 (20:00 - 22:00) overlapping 20:00 - 21:00
insert into public.workforce_actual_segments (
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, review_status, evidence_note, created_by
) values (
  'seg-overlap-test', 'shift-completed-2', 'host-1', 'host', 'worked', 'planned',
  '2026-10-17 20:00:00+07', '2026-10-17 22:00:00+07', 'draft', 'Overlapping shift submission', 'leader-creator'
);

select public.rc17a_assert_denied(
  'update public.workforce_actual_segments set review_status = ''approved'', reviewed_by = ''leader-reviewer'', reviewed_at = statement_timestamp(), review_note = ''Overlapping approval attempt'', version = 2 where id = ''seg-overlap-test''',
  'P0001',
  'workforce_actual_guard blocks approving overlapping worked interval for same staff'
);

-- TEST 8: No-show conflict rejection (WORKFORCE_APPROVED_NO_SHOW_CONFLICT)
-- host-1 already has approved 'worked' on shift-completed-1
insert into public.workforce_actual_segments (
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, review_status, evidence_note, created_by
) values (
  'seg-noshow-test', 'shift-completed-1', 'host-1', 'host', 'no_show', 'planned',
  null, null, 'draft', 'Contradictory no-show claim', 'leader-creator'
);

select public.rc17a_assert_denied(
  'update public.workforce_actual_segments set review_status = ''approved'', reviewed_by = ''leader-reviewer'', reviewed_at = statement_timestamp(), review_note = ''No-show conflict approval attempt'', version = 2 where id = ''seg-noshow-test''',
  'P0001',
  'workforce_actual_guard blocks approving contradictory no-show on same shift'
);

-- TEST 9: Injected Audit Failure Transaction Rollback
create or replace function public.rc17a_test_fail_audit() returns trigger language plpgsql as $$
begin
  if new.reason like '%FORCE_AUDIT_FAILURE%' then
    raise exception 'RC17A_INJECTED_AUDIT_FAILURE';
  end if;
  return new;
end;
$$;

create trigger rc17a_test_fail_audit_trg before insert on public.audit_logs
for each row execute function public.rc17a_test_fail_audit();

insert into public.workforce_actual_segments (
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, review_status, evidence_note, created_by
) values (
  'seg-rollback-test', 'shift-completed-2', 'host-2', 'host', 'worked', 'planned',
  '2026-10-17 20:00:00+07', '2026-10-17 22:00:00+07', 'draft', 'Testing atomic rollback', 'leader-creator'
);

select public.rc17a_assert_denied(
  'update public.workforce_actual_segments set review_status = ''approved'', reviewed_by = ''leader-reviewer'', reviewed_at = statement_timestamp(), review_note = ''FORCE_AUDIT_FAILURE_TEST'', version = 2 where id = ''seg-rollback-test''',
  'P0001',
  'Injected audit failure aborts transaction'
);

-- Verify that seg-rollback-test remained in draft status and version 1!
select public.rc17a_assert(
  (select review_status = 'draft' and version = 1 from public.workforce_actual_segments where id = 'seg-rollback-test'),
  'Transaction rollback preserved unmutated draft state'
);

drop trigger rc17a_test_fail_audit_trg on public.audit_logs;
drop function public.rc17a_test_fail_audit();

-- TEST 10: Sensitive Data Redaction in audit_logs
insert into public.workforce_actual_segments (
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, review_status, evidence_note, created_by
) values (
  'seg-sensitive-test', 'shift-completed-2', 'host-2', 'host', 'worked', 'planned',
  '2026-10-17 20:00:00+07', '2026-10-17 22:00:00+07', 'draft', 'Valid evidence note for segment', 'leader-creator'
);

select public.rc17a_assert(
  (select after_data is not null and jsonb_typeof(after_data) = 'object'
          and not (after_data ? 'gross_vnd')
          and not (after_data ? 'rate_vnd_per_hour')
          and not (after_data ? 'net_vnd')
          and not (after_data ? 'salary')
          and not (after_data ? 'password')
          and not (after_data ? 'token')
   from public.audit_logs where entity_id = 'seg-sensitive-test'),
  'Audit log before/after data contains no financial payroll figures or sensitive credentials'
);

-- TEST 11: Leader RLS Read Permissions (module = 'calendar' readable, module = 'staff' restricted)
insert into public.audit_logs (
  actor_business_user_id, module, action, entity_type, entity_id, entity_name,
  changed_fields, source, correlation_id
) values (
  'admin-1', 'staff', 'update', 'business_user', 'host-1', 'host-1',
  '{}', 'manual', gen_random_uuid()::text
);

set role authenticated;
select set_config('rc17a.test_actor', 'leader-reviewer', true);

select public.rc17a_assert(
  (select count(*) > 0 from public.audit_logs where module = 'calendar'),
  'Leader CAN read calendar audit logs under audit_logs_read RLS'
);

select public.rc17a_assert(
  (select count(*) = 0 from public.audit_logs where module = 'staff'),
  'Leader CANNOT read staff audit logs under audit_logs_read RLS'
);

select set_config('rc17a.test_actor', 'admin-1', true);
select public.rc17a_assert(
  (select count(*) > 0 from public.audit_logs where module = 'staff'),
  'Admin CAN read staff audit logs under audit_logs_read RLS'
);

reset role;
