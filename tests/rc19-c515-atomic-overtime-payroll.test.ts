import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = [
  'supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql',
  'supabase/migrations/20261012000001_rc16b_draft_payroll_correction.sql',
  'supabase/migrations/20261019000000_rc17b_rate_supersession_and_recalc.sql',
  'supabase/migrations/20261110115529_rc19_c515_payroll_second_precision.sql',
  'supabase/migrations/20261110130000_rc19_c515_payroll_approval_hold.sql',
  'supabase/migrations/20261110140000_rc19_c515_overtime_cancellation_approvals.sql',
  'supabase/migrations/20261118140000_rc19_w4_atomic_overtime_payroll_sync.sql',
  'supabase/migrations/20261118150000_rc19_w4_overtime_payroll_defect_fixes.sql',
]

async function setupMigratedPgDatabase(): Promise<PGlite> {
  const db = new PGlite()

  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'postgres') then
        create role postgres superuser login;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
      end if;
    end $$;

    create schema if not exists private;
    grant usage on schema private to authenticated;

    create table public.business_users (
      id text primary key,
      system_permission text not null,
      status text not null default 'active',
      account_status text not null default 'active',
      deleted_at timestamptz
    );

    create table public.shifts (
      id text primary key,
      date date not null,
      brand_id text not null,
      platform_id text not null default 'platform-1',
      status text not null default 'completed',
      deleted_at timestamptz
    );

    create table public.shift_registrations (
      id text primary key,
      shift_id text not null references public.shifts(id),
      user_id text not null references public.business_users(id),
      operational_role text not null,
      status text not null
    );

    create table public.reports (
      id text primary key,
      shift_id text not null references public.shifts(id),
      status text not null,
      metrics_confirmed boolean not null default false,
      deleted_at timestamptz,
      archived_at timestamptz
    );

    create table public.live_report_images (
      id text primary key,
      report_id text not null references public.reports(id),
      category text not null,
      provider text not null,
      external_file_id text,
      external_parent_id text,
      checksum_sha256 text
    );

    create table public.operational_files (
      id text primary key,
      shift_id text not null references public.shifts(id),
      brand_id text not null,
      platform_id text not null,
      integrity_status text not null,
      checksum_sha256 text not null,
      external_file_id text not null,
      external_parent_id text not null,
      deleted_at timestamptz
    );

    create table public.audit_logs (
      id bigserial primary key,
      entity_type text not null,
      entity_id text not null,
      actor_role text,
      actor_business_user_id text,
      before_data jsonb,
      after_data jsonb,
      created_at timestamptz not null default now()
    );

    create table public.self_attendance_events (
      id text primary key,
      request_id uuid not null unique,
      shift_id text not null references public.shifts(id),
      staff_id text not null references public.business_users(id),
      operational_role text not null,
      event_kind text not null
    );

    create table public.self_attendance_photo_evidence (
      id text primary key,
      request_id uuid not null unique,
      shift_id text not null references public.shifts(id),
      staff_id text not null references public.business_users(id),
      operational_role text not null,
      provider text not null default 'google_drive'
    );

    create table public.self_attendance_photo_evidence_revisions (
      id text primary key,
      attendance_event_id text not null references public.self_attendance_events(id),
      revision integer not null,
      request_id uuid not null
    );

    create table public.self_attendance_photo_review_events (
      id text primary key,
      attendance_event_id text not null references public.self_attendance_events(id),
      decision text not null,
      evidence_request_id uuid not null,
      evidence_revision integer not null,
      version integer not null
    );

    create or replace function private.current_business_user_id()
    returns text language sql stable as $$
      select nullif(current_setting('rc19.test_actor_id', true), '')
    $$;

    create or replace function private.current_business_user_is_active()
    returns boolean language sql stable as $$
      select coalesce(
        (select u.status = 'active' and u.account_status = 'active' and u.deleted_at is null
         from public.business_users u
         where u.id = private.current_business_user_id()),
        false
      )
    $$;

    create or replace function private.current_system_permission()
    returns text language sql stable as $$
      select coalesce(
        (select u.system_permission from public.business_users u
         where u.id = private.current_business_user_id()),
        nullif(current_setting('rc19.test_actor_role', true), '')
      )
    $$;

    create or replace function private.rc19_has_any_leader_brand_scope(p_brand text, p_scopes text[])
    returns boolean language sql stable as $$
      select p_brand = any(string_to_array(coalesce(nullif(current_setting('rc19.test_leader_brands', true), ''), 'brand-1'), ','))
    $$;

    create or replace function public.rbac01_effective_permission(p_perm text)
    returns boolean language sql stable as $$
      select private.current_system_permission() in ('admin', 'leader')
    $$;
  `)

  for (const relPath of MIGRATIONS) {
    const sql = readFileSync(relPath, 'utf8')
    await db.exec(sql)
  }

  await db.exec(`
    insert into public.business_users (id, system_permission) values
      ('admin-1', 'admin'),
      ('admin-2', 'admin'),
      ('leader-1', 'leader'),
      ('leader-2', 'leader'),
      ('staff-1', 'member');

    insert into public.workforce_rate_cards
      (id, staff_id, operational_role, effective_from, vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note)
    values
      ('rate-technical-default', null, 'technical', '2026-11-01', 100000, 15000, 'admin-2', now(), 'Approved November technical default rate card');

    insert into public.shifts (id, date, brand_id, status) values
      ('shift-draft', '2026-11-15', 'brand-1', 'completed'),
      ('shift-noprep', '2026-11-16', 'brand-1', 'completed'),
      ('shift-locked', '2026-10-15', 'brand-1', 'completed'),
      ('shift-locked-noprep', '2026-10-16', 'brand-1', 'completed'),
      ('shift-voided', '2026-11-17', 'brand-1', 'completed'),
      ('shift-term', '2026-11-18', 'brand-1', 'completed');

    insert into public.reports (id, shift_id, status, metrics_confirmed) values
      ('rep-draft', 'shift-draft', 'confirmed', true),
      ('rep-noprep', 'shift-noprep', 'confirmed', true),
      ('rep-locked', 'shift-locked', 'confirmed', true),
      ('rep-locked-noprep', 'shift-locked-noprep', 'confirmed', true),
      ('rep-voided', 'shift-voided', 'confirmed', true),
      ('rep-term', 'shift-term', 'confirmed', true);

    insert into public.live_report_images (id, report_id, category, provider, external_file_id, external_parent_id, checksum_sha256) values
      ('kv-draft', 'rep-draft', 'key_visual', 'google_drive', 'file-12345678', 'parent-12345678', repeat('a', 64)),
      ('kv-noprep', 'rep-noprep', 'key_visual', 'google_drive', 'file-12345679', 'parent-12345678', repeat('b', 64)),
      ('kv-locked', 'rep-locked', 'key_visual', 'google_drive', 'file-12345680', 'parent-12345678', repeat('c', 64)),
      ('kv-locked-np', 'rep-locked-noprep', 'key_visual', 'google_drive', 'file-12345681', 'parent-12345678', repeat('d', 64)),
      ('kv-voided', 'rep-voided', 'key_visual', 'google_drive', 'file-12345682', 'parent-12345678', repeat('e', 64)),
      ('kv-term', 'rep-term', 'key_visual', 'google_drive', 'file-12345683', 'parent-12345678', repeat('f', 64));

    insert into public.operational_files (id, shift_id, brand_id, platform_id, integrity_status, checksum_sha256, external_file_id, external_parent_id) values
      ('ev-draft', 'shift-draft', 'brand-1', 'platform-1', 'sha256_verified', repeat('1', 64), 'drive-file-1', 'drive-parent-1'),
      ('ev-noprep', 'shift-noprep', 'brand-1', 'platform-1', 'sha256_verified', repeat('2', 64), 'drive-file-2', 'drive-parent-1'),
      ('ev-locked', 'shift-locked', 'brand-1', 'platform-1', 'sha256_verified', repeat('3', 64), 'drive-file-3', 'drive-parent-1'),
      ('ev-locked-np', 'shift-locked-noprep', 'brand-1', 'platform-1', 'sha256_verified', repeat('4', 64), 'drive-file-4', 'drive-parent-1'),
      ('ev-voided', 'shift-voided', 'brand-1', 'platform-1', 'sha256_verified', repeat('5', 64), 'drive-file-5', 'drive-parent-1'),
      ('ev-term', 'shift-term', 'brand-1', 'platform-1', 'sha256_verified', repeat('6', 64), 'drive-file-6', 'drive-parent-1');

    insert into public.workforce_actual_segments (id, shift_id, staff_id, operational_role, event_kind, actual_start_at, actual_end_at, evidence_note, created_by, review_status)
    values
      ('seg-draft', 'shift-draft', 'staff-1', 'technical', 'worked', '2026-11-15T08:00:00Z', '2026-11-15T10:30:00Z', 'Verified technical shift segment draft', 'leader-1', 'draft'),
      ('seg-noprep', 'shift-noprep', 'staff-1', 'technical', 'worked', '2026-11-16T08:00:00Z', '2026-11-16T10:30:00Z', 'Verified technical shift segment noprep', 'leader-1', 'draft'),
      ('seg-locked', 'shift-locked', 'staff-1', 'technical', 'worked', '2026-10-15T08:00:00Z', '2026-10-15T10:30:00Z', 'Verified technical shift segment locked', 'leader-1', 'draft'),
      ('seg-voided', 'shift-voided', 'staff-1', 'technical', 'worked', '2026-11-17T08:00:00Z', '2026-11-17T10:30:00Z', 'Verified technical shift segment voided', 'leader-1', 'draft'),
      ('seg-term', 'shift-term', 'staff-1', 'technical', 'worked', '2026-11-18T08:00:00Z', '2026-11-18T10:30:00Z', 'Verified technical shift segment terminal', 'leader-1', 'draft');

    update public.workforce_actual_segments
    set review_status = 'approved',
        reviewed_by = 'admin-1',
        reviewed_at = now(),
        review_note = 'Approved technical actual segment',
        version = 2;

    insert into public.workforce_payroll_segment_decisions
      (segment_id, state, reviewed_by, preapproved_by, confirmed_by, confirmed_at, reason, missing_evidence, segment_version)
    values
      ('seg-draft', 'admin_confirmed', 'admin-1', 'leader-1', 'admin-2', now(), 'Approved payroll gate for draft test', '{}', 2),
      ('seg-noprep', 'admin_confirmed', 'admin-1', 'leader-1', 'admin-2', now(), 'Approved payroll gate for noprep test', '{}', 2),
      ('seg-voided', 'admin_confirmed', 'admin-1', 'leader-1', 'admin-2', now(), 'Approved payroll gate for voided test', '{}', 2),
      ('seg-term', 'admin_confirmed', 'admin-1', 'leader-1', 'admin-2', now(), 'Approved payroll gate for terminal test', '{}', 2);

    insert into public.workforce_rate_cards
      (id, staff_id, operational_role, effective_from, effective_through, vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note)
    values
      ('rate-oct-technical', null, 'technical', '2026-10-01', '2026-10-31', 100000, 15000, 'admin-2', now(), 'Approved October technical rate card');

    insert into public.workforce_payroll_periods (id, period_start, period_end, status, created_by)
    values
      ('period-nov-draft', '2026-11-01', '2026-11-30', 'draft', 'admin-2'),
      ('period-oct-locked', '2026-10-01', '2026-10-31', 'draft', 'admin-2');

    insert into public.workforce_payroll_lines
      (id, period_id, segment_id, rate_card_id, staff_id, operational_role,
       actual_minutes, payable_minutes, overtime_minutes,
       actual_seconds, payable_seconds, overtime_seconds,
       rate_vnd_per_hour, overtime_multiplier_basis_points, gross_vnd, calculation_version)
    values
      ('line-draft', 'period-nov-draft', 'seg-draft', 'rate-technical-default', 'staff-1', 'technical',
       150, 150, 0, 9000, 9000, 0, 100000, 15000, 250000, 'rc19-seconds-v1'),
      ('line-voided', 'period-nov-draft', 'seg-voided', 'rate-technical-default', 'staff-1', 'technical',
       150, 150, 0, 9000, 9000, 0, 100000, 15000, 250000, 'rc19-seconds-v1'),
      ('line-locked', 'period-oct-locked', 'seg-locked', 'rate-oct-technical', 'staff-1', 'technical',
       150, 150, 0, null, null, null, 100000, 15000, 250000, 'rc16-v1');

    select public.workforce_rc16b_correct_payroll_line(
      'period-nov-draft', 'line-voided', 1, gen_random_uuid(),
      'void_line', 'admin-1', 'Voiding duplicate draft line for A1 check'
    );

    select public.workforce_rc16_transition_payroll('period-oct-locked', 'draft', 'reviewed', 'admin-1', 'Review October payroll period before lock');
    select public.workforce_rc16_transition_payroll('period-oct-locked', 'reviewed', 'confirmed', 'admin-2', 'Confirm October payroll period before lock');
    select public.workforce_rc16_transition_payroll('period-oct-locked', 'confirmed', 'payroll_ready', 'admin-2', 'Mark October payroll period ready to lock');
    select public.workforce_rc16_transition_payroll('period-oct-locked', 'payroll_ready', 'locked', 'admin-2', 'Lock October payroll period permanently');

    -- Late-approved segment in already-locked October period with no payroll line yet
    insert into public.workforce_actual_segments (id, shift_id, staff_id, operational_role, event_kind, actual_start_at, actual_end_at, evidence_note, created_by, review_status)
    values
      ('seg-locked-noprep', 'shift-locked-noprep', 'staff-1', 'technical', 'worked', '2026-10-16T08:00:00Z', '2026-10-16T10:30:00Z', 'Late approved segment inside locked period', 'leader-1', 'draft');
    update public.workforce_actual_segments
    set review_status = 'approved', reviewed_by = 'admin-1', reviewed_at = now(), review_note = 'Late approval after October lock', version = 2
    where id = 'seg-locked-noprep';
  `)

  return db
}

async function runAsActor<T>(
  db: PGlite,
  actorId: string,
  fn: () => Promise<T>,
  leaderBrands = 'brand-1'
): Promise<T> {
  await db.exec(`
    select set_config('rc19.test_actor_id', '${actorId}', false);
    select set_config('rc19.test_leader_brands', '${leaderBrands}', false);
  `)
  return await fn()
}

test('Real migration SQL execution in PG17/PGlite: A1 locked period, absent draft line & pre-prep, draft sync, A2 leader idempotency, A3 terminal rejection & RLS', async () => {
  const db = await setupMigratedPgDatabase()

  const privRes = await db.query<{ can_select: boolean; can_exec: boolean }>(`
    select
      has_table_privilege('authenticated', 'public.workforce_overtime_requests', 'SELECT') as can_select,
      has_function_privilege('authenticated', 'public.rc19_c515_decide_overtime_request(uuid,integer,text,text,uuid)', 'EXECUTE') as can_exec
  `)
  assert.equal(privRes.rows[0].can_select, false, 'authenticated must NOT have direct SELECT on workforce_overtime_requests')
  assert.equal(privRes.rows[0].can_exec, true, 'authenticated must have EXECUTE on rc19_c515_decide_overtime_request')

  await assert.rejects(
    () => runAsActor(db, 'staff-1', () => db.query(`
      select * from public.rc19_c515_decide_overtime_request(gen_random_uuid(), 1, 'admin_confirm', 'Member should be forbidden', gen_random_uuid())
    `)),
    (err: Error) => err.message.includes('C515_OT_ACTOR_FORBIDDEN')
  )

  const reqDraftRes = await runAsActor(db, 'admin-2', () => db.query<{ id: string; version: number }>(`
    select id, version from public.rc19_c515_request_overtime(
      'seg-draft', '2026-11-15T10:00:00Z', '2026-11-15T10:30:00Z',
      'weekday', 'day', 'Extended broadcast by 30 minutes', 'ev-draft', '${'11111111-1111-4111-8111-000000000001'}'::uuid
    )
  `))
  const reqDraftId = reqDraftRes.rows[0].id
  assert.equal(reqDraftRes.rows[0].version, 1)

  // A2: Leader idempotency ('leader_preapprove' -> 'leader_preapproved')
  const leaderIdemKey = '22222222-2222-4222-8222-000000000001'
  const pre1 = await runAsActor(db, 'leader-1', () => db.query<{
    state: string; version: number; leader_preapproved_by: string
  }>(`
    select state, version, leader_preapproved_by from public.rc19_c515_decide_overtime_request(
      '${reqDraftId}'::uuid, 1, 'leader_preapprove', 'Leader verified OT logs', '${leaderIdemKey}'::uuid
    )
  `))
  assert.equal(pre1.rows[0].state, 'pending_admin_confirmation')
  assert.equal(pre1.rows[0].version, 2)
  assert.equal(pre1.rows[0].leader_preapproved_by, 'leader-1')

  const preRetry = await runAsActor(db, 'leader-1', () => db.query<{
    state: string; version: number; leader_preapproved_by: string
  }>(`
    select state, version, leader_preapproved_by from public.rc19_c515_decide_overtime_request(
      '${reqDraftId}'::uuid, 1, 'leader_preapprove', 'Leader verified OT logs', '${leaderIdemKey}'::uuid
    )
  `))
  assert.equal(preRetry.rows[0].version, 2)
  assert.equal(preRetry.rows[0].leader_preapproved_by, 'leader-1')

  const preEvents = await db.query<{ count: string }>(`
    select count(*)::text as count from public.workforce_overtime_request_events
    where request_id = '${reqDraftId}'::uuid and action = 'leader_preapproved'
  `)
  assert.equal(preEvents.rows[0].count, '1', 'Identical leader retry must NOT insert a second event')

  await assert.rejects(
    () => runAsActor(db, 'leader-1', () => db.query(`
      select * from public.rc19_c515_decide_overtime_request(
        '${reqDraftId}'::uuid, 1, 'leader_preapprove', 'Different conflicting reason', '${leaderIdemKey}'::uuid
      )
    `)),
    (err: Error) => err.message.includes('C515_OT_IDEMPOTENCY_CONFLICT')
  )

  await assert.rejects(
    () => runAsActor(db, 'leader-2', () => db.query(`
      select * from public.rc19_c515_decide_overtime_request(
        '${reqDraftId}'::uuid, 1, 'leader_preapprove', 'Leader verified OT logs', '${leaderIdemKey}'::uuid
      )
    `)),
    (err: Error) => err.message.includes('C515_OT_IDEMPOTENCY_CONFLICT')
  )

  // A1: Draft line synchronization passes triggers & exact VND rounding
  const confirmDraft = await runAsActor(db, 'admin-1', () => db.query<{
    state: string; version: number; rate_card_id: string
  }>(`
    select state, version, rate_card_id from public.rc19_c515_decide_overtime_request(
      '${reqDraftId}'::uuid, 2, 'admin_confirm', 'Admin confirms valid draft OT', '${'22222222-2222-4222-8222-000000000002'}'::uuid
    )
  `))
  assert.equal(confirmDraft.rows[0].state, 'admin_confirmed')
  assert.equal(confirmDraft.rows[0].version, 3)

  const lineDraft = (await db.query<{
    overtime_seconds: number; overtime_minutes: number; gross_vnd: string; net_vnd: string; version: number
  }>(`select overtime_seconds, overtime_minutes, gross_vnd::text, net_vnd::text, version from public.workforce_payroll_lines where id = 'line-draft'`)).rows[0]
  assert.equal(lineDraft.overtime_seconds, 1800)
  assert.equal(lineDraft.overtime_minutes, 30)
  assert.equal(lineDraft.gross_vnd, '275000')
  assert.equal(lineDraft.net_vnd, '275000')
  assert.equal(lineDraft.version, 2)

  // A3: Terminal rejection blocked on admin_confirmed AND rejected requests
  await assert.rejects(
    () => runAsActor(db, 'admin-1', () => db.query(`
      select * from public.rc19_c515_decide_overtime_request(
        '${reqDraftId}'::uuid, 3, 'reject', 'Cannot reject already confirmed OT', '${'22222222-2222-4222-8222-000000000003'}'::uuid
      )
    `)),
    (err: Error) => err.message.includes('C515_OT_INVALID_TRANSITION')
  )
  const afterRejectedFail = (await db.query<{ state: string; gross_vnd: string }>(`
    select r.state, l.gross_vnd::text from public.workforce_overtime_requests r
    join public.workforce_payroll_lines l on l.segment_id = r.segment_id
    where r.id = '${reqDraftId}'::uuid
  `)).rows[0]
  assert.equal(afterRejectedFail.state, 'admin_confirmed')
  assert.equal(afterRejectedFail.gross_vnd, '275000')

  const reqTermId = (await runAsActor(db, 'leader-1', () => db.query<{ id: string }>(`
    select id from public.rc19_c515_request_overtime(
      'seg-term', '2026-11-18T10:00:00Z', '2026-11-18T10:30:00Z',
      'weekday', 'day', 'OT request to be rejected cleanly', 'ev-term', '${'11111111-1111-4111-8111-000000000004'}'::uuid
    )
  `))).rows[0].id
  await runAsActor(db, 'admin-1', () => db.query(`
    select * from public.rc19_c515_decide_overtime_request(
      '${reqTermId}'::uuid, 1, 'reject', 'Denied after log inspection', '${'22222222-2222-4222-8222-000000000004'}'::uuid
    )
  `))
  const termEvent = (await db.query<{ from_state: string; to_state: string; action: string }>(`
    select from_state, to_state, action from public.workforce_overtime_request_events
    where request_id = '${reqTermId}'::uuid and action = 'rejected'
  `)).rows[0]
  assert.equal(termEvent.from_state, 'pending_admin_confirmation')
  assert.equal(termEvent.to_state, 'rejected')

  await assert.rejects(
    () => runAsActor(db, 'admin-1', () => db.query(`
      select * from public.rc19_c515_decide_overtime_request(
        '${reqTermId}'::uuid, 2, 'reject', 'Double reject must fail', '${'22222222-2222-4222-8222-000000000005'}'::uuid
      )
    `)),
    (err: Error) => err.message.includes('C515_OT_INVALID_TRANSITION')
  )

  // A1: Absent draft line (pre-preparation) allowed & incorporated later
  const reqNoPrepId = (await runAsActor(db, 'leader-1', () => db.query<{ id: string }>(`
    select id from public.rc19_c515_request_overtime(
      'seg-noprep', '2026-11-16T10:00:00Z', '2026-11-16T10:30:00Z',
      'weekday', 'day', 'OT before payroll line prepared', 'ev-noprep', '${'11111111-1111-4111-8111-000000000005'}'::uuid
    )
  `))).rows[0].id

  const confirmNoPrep = await runAsActor(db, 'admin-1', () => db.query<{ state: string }>(`
    select state from public.rc19_c515_decide_overtime_request(
      '${reqNoPrepId}'::uuid, 1, 'admin_confirm', 'Confirm OT before draft preparation', '${'22222222-2222-4222-8222-000000000006'}'::uuid
    )
  `))
  assert.equal(confirmNoPrep.rows[0].state, 'admin_confirmed')

  await db.query(`
    select public.workforce_rc17b_auto_calculate_draft_batch(
      'period-nov-draft',
      '${'33333333-3333-4333-8333-000000000001'}'::uuid,
      'admin-1',
      'Prepare pre-confirmed OT line',
      jsonb_build_array(jsonb_build_object(
        'segment_id', 'seg-noprep',
        'rate_card_id', 'rate-technical-default',
        'staff_id', 'staff-1',
        'operational_role', 'technical',
        'actual_minutes', 150,
        'payable_minutes', 150,
        'overtime_minutes', 30,
        'rate_vnd_per_hour', 100000,
        'overtime_multiplier_basis_points', 15000,
        'gross_vnd', 275000,
        'adjustment_vnd', 0
      )),
      '[]'::jsonb
    )
  `)
  const noprepLine = (await db.query<{
    overtime_seconds: number; gross_vnd: string; overtime_request_id: string
  }>(`select overtime_seconds, gross_vnd::text, overtime_request_id from public.workforce_payroll_lines where segment_id = 'seg-noprep'`)).rows[0]
  assert.equal(noprepLine.overtime_seconds, 1800)
  assert.equal(noprepLine.gross_vnd, '275000')
  assert.equal(noprepLine.overtime_request_id, reqNoPrepId)

  // A1: Locked period (with line AND without line) & voided line MUST fail closed!
  const reqLockedId = (await runAsActor(db, 'leader-1', () => db.query<{ id: string }>(`
    select id from public.rc19_c515_request_overtime(
      'seg-locked', '2026-10-15T10:00:00Z', '2026-10-15T10:30:00Z',
      'weekday', 'day', 'OT inside locked period with line', 'ev-locked', '${'11111111-1111-4111-8111-000000000006'}'::uuid
    )
  `))).rows[0].id

  await assert.rejects(
    () => runAsActor(db, 'admin-1', () => db.query(`
      select * from public.rc19_c515_decide_overtime_request(
        '${reqLockedId}'::uuid, 1, 'admin_confirm', 'Confirm inside locked period must fail', '${'22222222-2222-4222-8222-000000000007'}'::uuid
      )
    `)),
    (err: Error) => err.message.includes('C515_OT_PAYROLL_PERIOD_LOCKED')
  )
  const lockedState = (await db.query<{ state: string; overtime_minutes: number; gross_vnd: string; version: number }>(`
    select r.state, l.overtime_minutes, l.gross_vnd::text, l.version
    from public.workforce_overtime_requests r
    join public.workforce_payroll_lines l on l.segment_id = r.segment_id
    where r.id = '${reqLockedId}'::uuid
  `)).rows[0]
  assert.equal(lockedState.state, 'pending_admin_confirmation')
  assert.equal(lockedState.overtime_minutes, 0)
  assert.equal(lockedState.gross_vnd, '250000')
  assert.equal(lockedState.version, 1)

  const reqLockedNoPrepId = (await runAsActor(db, 'leader-1', () => db.query<{ id: string }>(`
    select id from public.rc19_c515_request_overtime(
      'seg-locked-noprep', '2026-10-16T10:00:00Z', '2026-10-16T10:30:00Z',
      'weekday', 'day', 'OT inside locked period without line', 'ev-locked-np', '${'11111111-1111-4111-8111-000000000007'}'::uuid
    )
  `))).rows[0].id
  await assert.rejects(
    () => runAsActor(db, 'admin-1', () => db.query(`
      select * from public.rc19_c515_decide_overtime_request(
        '${reqLockedNoPrepId}'::uuid, 1, 'admin_confirm', 'Confirm inside locked period noprep', '${'22222222-2222-4222-8222-000000000008'}'::uuid
      )
    `)),
    (err: Error) => err.message.includes('C515_OT_PAYROLL_PERIOD_LOCKED')
  )

  const reqVoidedId = (await runAsActor(db, 'leader-1', () => db.query<{ id: string }>(`
    select id from public.rc19_c515_request_overtime(
      'seg-voided', '2026-11-17T10:00:00Z', '2026-11-17T10:30:00Z',
      'weekday', 'day', 'OT on voided line must fail closed', 'ev-voided', '${'11111111-1111-4111-8111-000000000008'}'::uuid
    )
  `))).rows[0].id
  await assert.rejects(
    () => runAsActor(db, 'admin-1', () => db.query(`
      select * from public.rc19_c515_decide_overtime_request(
        '${reqVoidedId}'::uuid, 1, 'admin_confirm', 'Confirm on voided payroll line', '${'22222222-2222-4222-8222-000000000009'}'::uuid
      )
    `)),
    (err: Error) => err.message.includes('C515_OT_PAYROLL_LINE_VOIDED')
  )
})
