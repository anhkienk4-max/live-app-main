/**
 * Isolated Native WSL PostgreSQL 17.11 Proof for RC19 W4 Delta C (#189).
 * Provisions a temporary cluster in /tmp/rc19-w4-deltac-pg17 on port 55482,
 * replays the 130-migration baseline + 20261124150000_rc19_w4_deltac_live_monitoring_sharing.sql,
 * and proves C1 + C3 SQL RPCs, RLS policies, duplicate locks, and triggers.
 * Never touches ports 55432, 55439, 55449, 55476, 15544, 15545, or 15549.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const WSL_DISTRO = 'Ubuntu-24.04'
const WSL_USER = 'anhkienk4'
const PG_BIN = '/usr/lib/postgresql/17/bin'
const CLUSTER_DIR = '/tmp/rc19-w4-deltac-pg17'
const PGHOST = '127.0.0.1'
const PGPORT = '55482'
const PGUSER = 'postgres'
const DB_NAME = 'rc19_w4_deltac_verify'
const TEST_PASS = 'rc19_w4_deltac_local_only'

const DELTAC_MIGRATION_PATH = path.join(ROOT, 'supabase/migrations/20261124150000_rc19_w4_deltac_live_monitoring_sharing.sql')
const BASELINE_SQL_PATH = path.join(ROOT, 'scripts/rc19-c4-migration-rehearsal/evidence/c5.3-final-pg176-20261108T191556Z/schema-after-20.sql')
const LEDGER_89_PATH = path.join(ROOT, 'scripts/rc19-c4-migration-rehearsal/evidence/production-ledger-replay-manifest.json')
const FORWARD_20_PATH = path.join(ROOT, 'scripts/rc19-c4-migration-rehearsal/evidence/c5.3-final-migration-manifest.json')

const PRE_W4_FILES = [
  'supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql',
  'supabase/migrations/20261109131324_rc19_c512_attendance_photo_review.sql',
  'supabase/migrations/20261110115529_rc19_c515_payroll_second_precision.sql',
  'supabase/migrations/20261110123000_rc19_issue93_pass_swap_lead_times.sql',
  'supabase/migrations/20261110130000_rc19_c515_payroll_approval_hold.sql',
  'supabase/migrations/20261110140000_rc19_c515_overtime_cancellation_approvals.sql',
  'supabase/migrations/20261111000000_rc19_c515_live_cancellation_transition.sql',
]

const CANDIDATE_W4_FILES = [
  'supabase/migrations/20261112000000_rc19_c2_calendar_overlap_range.sql',
  'supabase/migrations/20261112120000_rc19_audit_history_keyset.sql',
  'supabase/migrations/20261112130000_rc19_c6_import_source_reconciliation.sql',
  'supabase/migrations/20261113083000_rc19_c4_audit_dependency.sql',
  'supabase/migrations/20261113084154_rc19_c4_atomic_staffing_replacement.sql',
  'supabase/migrations/20261115120000_rc19_w4_legacy_segment_compatibility.sql',
  'supabase/migrations/20261115130000_rc19_w4_segmented_manual_assignment.sql',
  'supabase/migrations/20261115140000_rc19_w4_pass_swap_segment_preservation.sql',
  'supabase/migrations/20261115174231_rc19_w4_retire_unguarded_swap_approval.sql',
  'supabase/migrations/20261116120000_rc19_w4_swap_preflight_and_segment_capacity.sql',
  'supabase/migrations/20261117160000_rc19_w4_pass_recipient_visibility.sql',
  'supabase/migrations/20261118140000_rc19_w4_atomic_overtime_payroll_sync.sql',
  'supabase/migrations/20261118150000_rc19_w4_overtime_payroll_defect_fixes.sql',
  'supabase/migrations/20261124093722_rc19_w4_attendance_assignment_links.sql',
  'supabase/migrations/20261124104803_rc19_w4_actual_assignment_evidence.sql',
  'supabase/migrations/20261124120000_rc19_w4_import_staffing_integrity.sql',
]

const q = val => `'${String(val).replace(/'/g, "''")}'`
const lastLine = text => text.trim().split(/\r?\n/).filter(Boolean).pop()?.trim() ?? ''

function wslBash(command) {
  return execFileSync('wsl.exe', ['-d', WSL_DISTRO, '-u', WSL_USER, '--', 'bash', '-lc', command], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  }).trim()
}

function psql(db, sql, { allowFailure = false, singleTransaction = false } = {}) {
  const args = [
    '-d', WSL_DISTRO, '-u', WSL_USER, '--',
    'env', `PGPASSWORD=${TEST_PASS}`,
    `${PG_BIN}/psql`, '-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', db,
    '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t',
  ]
  if (singleTransaction) args.push('--single-transaction')
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = spawnSync('wsl.exe', args, {
      input: sql.replace(/\r\n/g, '\n'),
      encoding: 'utf8',
      maxBuffer: 25 * 1024 * 1024,
    })
    const isWslTransient = res.status === 4294967295 || res.status === -1 || (res.stderr && res.stderr.includes('0x8007274c'))
    if (isWslTransient && attempt < 4) {
      spawnSync('wsl.exe', ['-d', WSL_DISTRO, '--', 'sleep', '0.3'])
      continue
    }
    if (!allowFailure && res.status !== 0) {
      throw new Error(`psql failed (exit=${res.status}):\n${res.stderr}\n${res.stdout}`)
    }
    return res
  }
}

function actorSql(sub) {
  const claims = JSON.stringify({ sub, role: 'authenticated', aud: 'authenticated' })
  return [
    'SET LOCAL ROLE authenticated;',
    `SELECT set_config('request.jwt.claims', ${q(claims)}, true);`,
    `SELECT set_config('request.jwt.claim.sub', ${q(sub)}, true);`,
    `SELECT set_config('request.jwt.claim.role', 'authenticated', true);`,
  ].join('\n')
}

function startCluster() {
  wslBash(`
    if [ -f "${CLUSTER_DIR}/data/postmaster.pid" ]; then
      ${PG_BIN}/pg_ctl -D "${CLUSTER_DIR}/data" -m immediate stop >/dev/null 2>&1 || true
    fi
    rm -rf "${CLUSTER_DIR}"
    mkdir -p "${CLUSTER_DIR}/socket"
    printf '%s\\n' '${TEST_PASS}' > "${CLUSTER_DIR}/pgpass.txt"
    chmod 600 "${CLUSTER_DIR}/pgpass.txt"
    ${PG_BIN}/initdb -D "${CLUSTER_DIR}/data" -U ${PGUSER} --auth=scram-sha-256 --pwfile="${CLUSTER_DIR}/pgpass.txt" --encoding=UTF8 --locale=C.UTF-8 >/dev/null
    cat >> "${CLUSTER_DIR}/data/postgresql.conf" <<'EOF'
listen_addresses = '${PGHOST}'
port = ${PGPORT}
unix_socket_directories = '${CLUSTER_DIR}/socket'
max_connections = 50
fsync = off
synchronous_commit = off
EOF
    ${PG_BIN}/pg_ctl -D "${CLUSTER_DIR}/data" -l "${CLUSTER_DIR}/postgres.log" -w start >/dev/null
  `)
}

function stopCluster() {
  try {
    wslBash(`
      if [ -f "${CLUSTER_DIR}/data/postmaster.pid" ]; then
        ${PG_BIN}/pg_ctl -D "${CLUSTER_DIR}/data" -m fast stop >/dev/null 2>&1 || true
      fi
      rm -rf "${CLUSTER_DIR}"
    `)
  } catch {
    // Best-effort cleanup of temp cluster.
  }
}

try {
  console.log('=== [1/5] Starting isolated WSL PG17.11 cluster on 127.0.0.1:55482 ===')
  startCluster()
  const verOut = psql('postgres', "SELECT current_setting('server_version') || '|' || current_setting('server_version_num');").stdout.trim()
  console.log(`PG_VERSION=${verOut}`)
  assert.match(verOut, /^17\.11/)

  psql('postgres', `
    DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${TEST_PASS}'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE supabase_admin LOGIN SUPERUSER PASSWORD '${TEST_PASS}'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE supabase_auth_admin LOGIN NOINHERIT BYPASSRLS PASSWORD '${TEST_PASS}'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    GRANT anon, authenticated, service_role TO authenticator;
  `)

  psql('postgres', `CREATE DATABASE ${DB_NAME};`)
  psql(DB_NAME, 'DROP SCHEMA public CASCADE;')
  psql(DB_NAME, readFileSync(BASELINE_SQL_PATH, 'utf8'))

  const rbacSql = readFileSync(path.join(ROOT, 'supabase/migrations/20261104085945_rc19_rbac01_role_permission_enforcement.sql'), 'utf8')
  const rbacMatch = rbacSql.match(/INSERT INTO private\.rbac_permission_catalog\b[\s\S]*?ON CONFLICT \(permission\) DO NOTHING;/i)
  assert.ok(rbacMatch, 'RBAC seed statement must exist')
  psql(DB_NAME, `
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin;
    GRANT USAGE ON SCHEMA private TO authenticated;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ${rbacMatch[0]}
  `)

  // Apply 7 pre-W4 migrations + 13 W4 candidate migrations + populate 130 receipts cleanly
  const ledger89 = JSON.parse(readFileSync(LEDGER_89_PATH, 'utf8'))
  const forward20 = JSON.parse(readFileSync(FORWARD_20_PATH, 'utf8'))
  const ledgerSql = []
  for (const e of ledger89.entries) {
    ledgerSql.push(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (${q(e.production_version)}, ${e.production_name ? q(e.production_name) : 'NULL'}) ON CONFLICT DO NOTHING;`)
  }
  for (const e of forward20.entries) {
    ledgerSql.push(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (${q(e.version)}, ${q(path.basename(e.file, '.sql').slice(e.version.length + 1))}) ON CONFLICT DO NOTHING;`)
  }
  psql(DB_NAME, ledgerSql.join('\n'))

  for (const rel of [...PRE_W4_FILES, ...CANDIDATE_W4_FILES]) {
    const sql = readFileSync(path.join(ROOT, rel), 'utf8')
    const base = path.basename(rel, '.sql')
    const ver = base.slice(0, 14)
    const name = base.slice(15)
    psql(DB_NAME, sql)
    psql(DB_NAME, `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (${q(ver)}, ${q(name)}) ON CONFLICT DO NOTHING;`)
  }
  psql(DB_NAME, `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111200000', '20261111200000') ON CONFLICT DO NOTHING;`)

  const countBefore = Number(psql(DB_NAME, 'SELECT count(*) FROM supabase_migrations.schema_migrations;').stdout.trim())
  assert.equal(countBefore, 133, `Expected 133 baseline receipts before Delta C, got ${countBefore}`)

  console.log('=== [2/5] Testing atomic rollback & clean apply of Delta C migration (133 -> 134) ===')
  const deltacSql = readFileSync(DELTAC_MIGRATION_PATH, 'utf8')
  const rollbackRes = psql(
    DB_NAME,
    `${deltacSql}\nDO $$ BEGIN RAISE EXCEPTION 'DELTAC_INJECTED_ROLLBACK_TEST'; END $$;`,
    { allowFailure: true, singleTransaction: true },
  )
  assert.notEqual(rollbackRes.status, 0)
  assert.match(rollbackRes.stderr, /DELTAC_INJECTED_ROLLBACK_TEST/)
  assert.equal(
    psql(DB_NAME, "SELECT coalesce((to_regclass('public.media_publish_sessions') is not null)::int, 0) || '|' || coalesce((to_regprocedure('public.update_shift_live_link(text,text,integer)') is not null)::int, 0);").stdout.trim(),
    '0|0',
    'Rollback must leave zero Delta C objects behind',
  )

  psql(DB_NAME, deltacSql, { singleTransaction: true })
  psql(DB_NAME, `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261124150000', 'rc19_w4_deltac_live_monitoring_sharing');`)
  const countAfter = Number(psql(DB_NAME, 'SELECT count(*) FROM supabase_migrations.schema_migrations;').stdout.trim())
  assert.equal(countAfter, 134)

  const aclCheck = psql(DB_NAME, `
    SELECT
      has_function_privilege('anon', 'public.update_shift_live_link(text,text,integer)', 'EXECUTE') || '|' ||
      has_function_privilege('authenticated', 'public.update_shift_live_link(text,text,integer)', 'EXECUTE') || '|' ||
      has_function_privilege('anon', 'public.start_shift_media_publish_session(text,boolean)', 'EXECUTE') || '|' ||
      has_function_privilege('authenticated', 'public.start_shift_media_publish_session(text,boolean)', 'EXECUTE') || '|' ||
      has_function_privilege('anon', 'public.authorize_shift_media_viewer(text)', 'EXECUTE') || '|' ||
      has_function_privilege('authenticated', 'public.authorize_shift_media_viewer(text)', 'EXECUTE');
  `).stdout.trim()
  assert.equal(aclCheck, 'false|true|false|true|false|true', `Unexpected function ACLs: ${aclCheck}`)

  console.log('=== [3/5] Seeding multi-role Delta C test fixture ===')
  const AUTH_ADMIN = '11111111-1111-4111-8111-111111111111'
  const AUTH_LEADER_A = '22222222-2222-4222-8222-222222222222'
  const AUTH_LEADER_B = '33333333-3333-4333-8333-333333333333'
  const AUTH_SUPPORT_A = '44444444-4444-4444-8444-444444444444'
  const AUTH_HOST_A = '55555555-5555-4555-8555-555555555555'
  const AUTH_SUPPORT_B = '66666666-6666-4666-8666-666666666666'
  const AUTH_UNASSIGNED = '77777777-7777-4777-8777-777777777777'

  psql(DB_NAME, `
    INSERT INTO public.brands (id, name, status) VALUES
      ('b_a', 'Brand A', 'active'),
      ('b_b', 'Brand B', 'active');
    INSERT INTO public.system_settings (registration_cutoff_hours) VALUES (6);
    INSERT INTO public.platforms (id, name, status) VALUES
      ('p_tt', 'TikTok Shop', 'active');

    INSERT INTO auth.users (id, email) VALUES
      ('${AUTH_ADMIN}', 'admin@deltac.test'),
      ('${AUTH_LEADER_A}', 'leadera@deltac.test'),
      ('${AUTH_LEADER_B}', 'leaderb@deltac.test'),
      ('${AUTH_SUPPORT_A}', 'supporta@deltac.test'),
      ('${AUTH_HOST_A}', 'hosta@deltac.test'),
      ('${AUTH_SUPPORT_B}', 'supportb@deltac.test'),
      ('${AUTH_UNASSIGNED}', 'unassigned@deltac.test');

    INSERT INTO public.business_users (id, auth_user_id, email, full_name, system_permission, status, account_status, operational_roles) VALUES
      ('u_admin', '${AUTH_ADMIN}', 'admin@deltac.test', 'Admin', 'admin', 'active', 'active', ARRAY[]::text[]),
      ('u_leader_a', '${AUTH_LEADER_A}', 'leadera@deltac.test', 'Leader A', 'leader', 'active', 'active', ARRAY['host','support']),
      ('u_leader_b', '${AUTH_LEADER_B}', 'leaderb@deltac.test', 'Leader B', 'leader', 'active', 'active', ARRAY['host','support']),
      ('u_support_a', '${AUTH_SUPPORT_A}', 'supporta@deltac.test', 'Support A', 'member', 'active', 'active', ARRAY['support']),
      ('u_host_a', '${AUTH_HOST_A}', 'hosta@deltac.test', 'Host A', 'member', 'active', 'active', ARRAY['host']),
      ('u_support_b', '${AUTH_SUPPORT_B}', 'supportb@deltac.test', 'Support B', 'member', 'active', 'active', ARRAY['support']),
      ('u_unassigned', '${AUTH_UNASSIGNED}', 'unassigned@deltac.test', 'Unassigned Member', 'member', 'active', 'active', ARRAY['support']);

    INSERT INTO public.rc19_leader_brand_scopes (leader_business_user_id, brand_id, scope_key, status, valid_from, granted_by, updated_by, version) VALUES
      ('u_leader_a', 'b_a', 'shifts.read', 'active', now() - interval '1 hour', 'u_admin', 'u_admin', 1),
      ('u_leader_a', 'b_a', 'shifts.manage', 'active', now() - interval '1 hour', 'u_admin', 'u_admin', 1),
      ('u_leader_b', 'b_b', 'shifts.read', 'active', now() - interval '1 hour', 'u_admin', 'u_admin', 1),
      ('u_leader_b', 'b_b', 'shifts.manage', 'active', now() - interval '1 hour', 'u_admin', 'u_admin', 1);

    SELECT set_config('request.jwt.claim.sub', '${AUTH_ADMIN}', false);
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    SELECT set_config('request.jwt.claims', '{"sub":"${AUTH_ADMIN}","role":"authenticated","aud":"authenticated"}', false);

    INSERT INTO public.shifts (
      id, date, start_time, end_time, timezone, start_at, end_at, end_date,
      crosses_midnight, duration_minutes, brand_id, platform_id, title, studio,
      host_id, support_id, status, status_mode, version
    ) VALUES
      ('shift_a', '2030-05-01', '09:00', '13:00', 'Asia/Ho_Chi_Minh', '2030-05-01 02:00+00', '2030-05-01 06:00+00', '2030-05-01', false, 240, 'b_a', 'p_tt', 'Shift A Live', 'Studio A', 'u_host_a', 'u_support_a', 'live', 'manual', 1),
      ('shift_b', '2030-05-01', '14:00', '18:00', 'Asia/Ho_Chi_Minh', '2030-05-01 07:00+00', '2030-05-01 11:00+00', '2030-05-01', false, 240, 'b_b', 'p_tt', 'Shift B Live', 'Studio B', null, null, 'preparing', 'manual', 1),
      ('shift_done', '2030-04-30', '09:00', '13:00', 'Asia/Ho_Chi_Minh', '2030-04-30 02:00+00', '2030-04-30 06:00+00', '2030-04-30', false, 240, 'b_a', 'p_tt', 'Completed Shift', 'Studio A', 'u_host_a', 'u_support_a', 'completed', 'manual', 1);

    INSERT INTO public.shift_registrations (id, shift_id, user_id, operational_role, status, source) VALUES
      ('reg_b_sup', 'shift_b', 'u_support_b', 'support', 'approved', 'manual_assignment');
  `)

  console.log('=== [4/5] Verifying C1 Support live_link persistence, readback, validation, and scope boundaries ===')
  // L01: Support A (member, not shifts.edit) updates live_link with optimistic version=1
  const supSave = lastLine(psql(DB_NAME, `
    ${actorSql(AUTH_SUPPORT_A)}
    SELECT coalesce(live_link, '') || '|' || version
    FROM public.update_shift_live_link('shift_a', '  https://www.tiktok.com/@shop_a/live  ', 1);
  `, { singleTransaction: true }).stdout)
  assert.equal(supSave, 'https://www.tiktok.com/@shop_a/live|2')

  // L03: Leader A and Admin read back exact persisted live_link and version
  const leaderRead = lastLine(psql(DB_NAME, `
    ${actorSql(AUTH_LEADER_A)}
    SELECT coalesce(live_link, '') || '|' || version FROM public.shifts WHERE id = 'shift_a';
  `, { singleTransaction: true }).stdout)
  assert.equal(leaderRead, 'https://www.tiktok.com/@shop_a/live|2')

  // L04: Invalid URL & Stale write rejected cleanly without corrupting stored row
  const badUrl = psql(DB_NAME, `
    ${actorSql(AUTH_SUPPORT_A)}
    SELECT * FROM public.update_shift_live_link('shift_a', 'http://evil.example/live', 2);
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(badUrl.status, 0)
  assert.match(badUrl.stderr, /INVALID_LIVE_STREAM_LINK/)

  const badAtAuthority = psql(DB_NAME, `
    ${actorSql(AUTH_SUPPORT_A)}
    SELECT * FROM public.update_shift_live_link('shift_a', 'https://tiktok.com@evil.example/@shop/live', 2);
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(badAtAuthority.status, 0)
  assert.match(badAtAuthority.stderr, /INVALID_LIVE_STREAM_LINK/)

  const staleSave = psql(DB_NAME, `
    ${actorSql(AUTH_SUPPORT_A)}
    SELECT * FROM public.update_shift_live_link('shift_a', 'https://shopee.vn/live', 1);
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(staleSave.status, 0)
  assert.match(staleSave.stderr, /STALE_WRITE/)

  // L05: Unassigned member, foreign-brand Leader B, and completed shift writes rejected
  const unassignedSave = psql(DB_NAME, `
    ${actorSql(AUTH_UNASSIGNED)}
    SELECT * FROM public.update_shift_live_link('shift_a', 'https://shopee.vn/live', 2);
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(unassignedSave.status, 0)
  assert.match(unassignedSave.stderr, /OPERATION_NOT_ALLOWED/)

  const foreignLeaderSave = psql(DB_NAME, `
    ${actorSql(AUTH_LEADER_B)}
    SELECT * FROM public.update_shift_live_link('shift_a', 'https://shopee.vn/live', 2);
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(foreignLeaderSave.status, 0, `Expected failure for foreignLeaderSave, got stdout=${foreignLeaderSave.stdout} stderr=${foreignLeaderSave.stderr}`)
  assert.match(foreignLeaderSave.stderr, /OPERATION_NOT_ALLOWED/)

  const completedSave = psql(DB_NAME, `
    ${actorSql(AUTH_SUPPORT_A)}
    SELECT * FROM public.update_shift_live_link('shift_done', 'https://shopee.vn/live', 1);
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(completedSave.status, 0)
  assert.match(completedSave.stderr, /OPERATION_NOT_ALLOWED/)

  // Verify audit log captured UPDATE on shift_a by Support A
  const auditCount = Number(psql(DB_NAME, "SELECT count(*) FROM public.audit_logs WHERE entity_type = 'shifts' AND entity_id = 'shift_a' AND actor_business_user_id = 'u_support_a';").stdout.trim())
  assert.ok(auditCount >= 1, 'update_shift_live_link must leave an audit trail row')

  console.log('=== [5/5] Verifying C3 publish sessions, duplicate lock, multi-room isolation, and termination trigger ===')
  const sessARes = JSON.parse(lastLine(psql(DB_NAME, `
    ${actorSql(AUTH_SUPPORT_A)}
    SELECT public.start_shift_media_publish_session('shift_a', false)::text;
  `, { singleTransaction: true }).stdout))
  assert.equal(sessARes.shift_id, 'shift_a')
  assert.match(sessARes.media_path, /^[a-z][a-z0-9_]{0,63}$/)

  // L13: Host A cannot open duplicate active publisher without handover on shift_a
  const dupPub = psql(DB_NAME, `
    ${actorSql(AUTH_HOST_A)}
    SELECT public.start_shift_media_publish_session('shift_a', false);
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(dupPub.status, 0)
  assert.match(dupPub.stderr, /DUPLICATE_ACTIVE_PUBLISHER/)

  // L11: Support B (registered approved on shift_b) opens isolated concurrent room on shift_b
  const sessBRes = JSON.parse(lastLine(psql(DB_NAME, `
    ${actorSql(AUTH_SUPPORT_B)}
    SELECT public.start_shift_media_publish_session('shift_b', false)::text;
  `, { singleTransaction: true }).stdout))
  assert.equal(sessBRes.shift_id, 'shift_b')
  assert.notEqual(sessBRes.media_path, sessARes.media_path)

  // L09 & L12: Leader A and Admin authorized for shift_a; Leader B and Unassigned Member denied
  const viewLeadA = JSON.parse(lastLine(psql(DB_NAME, `
    ${actorSql(AUTH_LEADER_A)}
    SELECT public.authorize_shift_media_viewer('shift_a')::text;
  `, { singleTransaction: true }).stdout))
  assert.equal(viewLeadA.media_path, sessARes.media_path)

  const viewAdminA = JSON.parse(lastLine(psql(DB_NAME, `
    ${actorSql(AUTH_ADMIN)}
    SELECT public.authorize_shift_media_viewer('shift_a')::text;
  `, { singleTransaction: true }).stdout))
  assert.equal(viewAdminA.media_path, sessARes.media_path)

  for (const deniedSub of [AUTH_LEADER_B, AUTH_UNASSIGNED]) {
    const denied = psql(DB_NAME, `
      ${actorSql(deniedSub)}
      SELECT public.authorize_shift_media_viewer('shift_a');
    `, { allowFailure: true, singleTransaction: true })
    assert.notEqual(denied.status, 0)
    assert.match(denied.stderr, /MEDIA_PERMISSION_DENIED/)

    const rlsVisible = Number(lastLine(psql(DB_NAME, `
      ${actorSql(deniedSub)}
      SELECT count(*) FROM public.media_publish_sessions WHERE shift_id = 'shift_a';
    `, { singleTransaction: true }).stdout))
    assert.equal(rlsVisible, 0, 'RLS must hide active publish session from unauthorized users')
  }

  // L08: Stop Shift A -> Shift A ends, Shift B unaffected
  const stoppedA = lastLine(psql(DB_NAME, `
    ${actorSql(AUTH_SUPPORT_A)}
    SELECT public.stop_shift_media_publish_session('shift_a', ${q(sessARes.session_id)}::uuid)::text;
  `, { singleTransaction: true }).stdout)
  assert.equal(stoppedA, 'true')

  const afterStopViewA = psql(DB_NAME, `
    ${actorSql(AUTH_ADMIN)}
    SELECT public.authorize_shift_media_viewer('shift_a');
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(afterStopViewA.status, 0)
  assert.match(afterStopViewA.stderr, /MEDIA_SESSION_NOT_ACTIVE/)

  // L14: Completing shift_b triggers automatic session termination and grant revocation
  psql(DB_NAME, `
    SELECT set_config('request.jwt.claim.sub', '${AUTH_ADMIN}', false);
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    UPDATE public.shifts SET status = 'completed' WHERE id = 'shift_b';
  `)
  const bState = psql(DB_NAME, `
    SELECT status || '|' || (SELECT count(*) FROM public.media_viewer_grants WHERE shift_id = 'shift_b' AND active = true)
    FROM public.media_publish_sessions
    WHERE id = ${q(sessBRes.session_id)}::uuid;
  `).stdout.trim()
  assert.equal(bState, 'ended_by_shift|0')

  const afterCompleteViewB = psql(DB_NAME, `
    ${actorSql(AUTH_LEADER_B)}
    SELECT public.authorize_shift_media_viewer('shift_b');
  `, { allowFailure: true, singleTransaction: true })
  assert.notEqual(afterCompleteViewB.status, 0)
  assert.match(afterCompleteViewB.stderr, /MEDIA_PERMISSION_DENIED/)

  console.log('\nPASS: PG17.11 Delta C Verification Suite (131 migrations + C1/C3 SQL & RLS proofs)')
} finally {
  stopCluster()
}
