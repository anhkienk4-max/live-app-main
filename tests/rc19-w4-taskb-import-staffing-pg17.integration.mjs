import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg

const WORKTREE_ROOT = process.cwd()
const BASELINE_DIR = path.resolve(
  WORKTREE_ROOT,
  '../rc19-w4-final-integration/test_reports/rc19-w4-release-closure-0f66b14f/prod-117-sanitized-baseline-for-codex',
)
const MIGRATIONS_DIR = path.join(WORKTREE_ROOT, 'supabase/migrations')

const WSL_DISTRO = 'Ubuntu-24.04'
const PG_BIN = '/usr/lib/postgresql/17/bin'
const CLUSTER_DIR = '/tmp/rc19-w4-taskb-pg17'
const PG_HOST = '127.0.0.1'
const PG_PORT = 55499
const PG_USER = 'postgres'
const PG_PASS = 'rc19_w4_local_test_only'
const PG_DB = 'rc19_w4_taskb'

const ADMIN_AUTH_ID = '00000000-0000-4000-8000-000000000101'
const LEADER_AUTH_ID = '00000000-0000-4000-8000-000000000102'
const MEMBER1_AUTH_ID = '00000000-0000-4000-8000-000000000103'
const MEMBER2_AUTH_ID = '00000000-0000-4000-8000-000000000104'

const BRAND_KAO_ID = 'brand-kao-pg17'
const PLATFORM_SHOPEE_ID = 'plat-shopee-pg17'
const CAMPAIGN_MEGA_ID = 'camp-mega-pg17'

function toWslPath(winPath) {
  const abs = path.resolve(winPath)
  const match = abs.match(/^([A-Za-z]):\\(.*)$/)
  if (!match) throw new Error(`Unsupported Windows path for WSL translation: ${abs}`)
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`
}

function wslExec(cmd, { allowFailure = false } = {}) {
  const proc = spawnSync('wsl.exe', ['-d', WSL_DISTRO, '--', 'bash', '-lc', cmd], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (!allowFailure && proc.status !== 0) {
    throw new Error(
      `WSL command failed (exit ${proc.status}): ${cmd}\nSTDOUT:\n${proc.stdout}\nSTDERR:\n${proc.stderr}`,
    )
  }
  return proc
}

function wslPsqlFile(db, winFilePath) {
  const wslPath = toWslPath(winFilePath)
  const proc = spawnSync(
    'wsl.exe',
    [
      '-d',
      WSL_DISTRO,
      '--',
      'env',
      `PGPASSWORD=${PG_PASS}`,
      `${PG_BIN}/psql`,
      '-h',
      PG_HOST,
      '-p',
      String(PG_PORT),
      '-U',
      PG_USER,
      '-d',
      db,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      wslPath,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  if (proc.status !== 0) {
    throw new Error(
      `psql -f ${winFilePath} failed (exit ${proc.status}):\nSTDOUT:\n${proc.stdout}\nSTDERR:\n${proc.stderr}`,
    )
  }
  return proc.stdout
}

function wslPsqlText(db, sql) {
  const proc = execFileSync(
    'wsl.exe',
    [
      '-d',
      WSL_DISTRO,
      '--',
      'env',
      `PGPASSWORD=${PG_PASS}`,
      `${PG_BIN}/psql`,
      '-h',
      PG_HOST,
      '-p',
      String(PG_PORT),
      '-U',
      PG_USER,
      '-d',
      db,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  return proc.trim()
}

let pool

async function asActor(authSub, fn, { dbRole = 'authenticated' } = {}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${dbRole}`)
    const claims = JSON.stringify({ sub: authSub, role: 'authenticated', aud: 'authenticated' })
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims])
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authSub])
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`)
    const res = await fn(client)
    await client.query('COMMIT')
    return res
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

async function createBatchForTest(
  client,
  sourceName,
  rowOverride = {},
) {
  const rows = [
    {
      row_number: 1,
      date: rowOverride.date ?? '2026-12-01',
      start_time: rowOverride.start_time ?? '08:00',
      end_time: rowOverride.end_time ?? '22:00',
      brand_name: rowOverride.brand_name ?? 'KAO PG17',
      platform_name: rowOverride.platform_name ?? 'Shopee Live',
      warnings: [],
      errors: [],
    },
  ]
  const res = await client.query(
    `SELECT (public.create_schedule_import_batch($1, $2, $3::jsonb, $4::jsonb)).id AS batch_id`,
    [
      'excel',
      sourceName,
      JSON.stringify({
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        warningRows: 0,
        duplicateRows: 0,
      }),
      JSON.stringify(rows),
    ],
  )
  return res.rows[0].batch_id
}

async function createVerifiedBatch(authSub, sourceName, rowOverride = {}) {
  const batchId = await asActor(authSub, client =>
    createBatchForTest(client, sourceName, rowOverride),
  )
  const checksumSha256 = crypto
    .createHash('sha256')
    .update(`${batchId}:${sourceName}`)
    .digest('hex')
  const inserted = await pool.query(
    `INSERT INTO public.operational_schedule_source_files (
       batch_id, provider, external_file_id, external_parent_id,
       provider_metadata, folder_path, file_name, mime_type,
       size_bytes, checksum_sha256, reconciliation_status, uploaded_by
     ) VALUES (
       $1, 'google_drive', NULL, NULL,
       '{}'::jsonb, '00_ADA_OPS_PLATFORM/01_Schedules/2026-12', $2,
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       2048, $3, 'pending', $4
     )
     RETURNING id`,
    [batchId, sourceName, checksumSha256, authSub],
  )
  await pool.query(
    `UPDATE public.operational_schedule_source_files
     SET external_file_id = $2,
         external_parent_id = 'drv-folder-schedules',
         reconciliation_status = 'provider_verified',
         updated_at = statement_timestamp()
     WHERE id = $1`,
    [inserted.rows[0].id, `drv-file-${batchId}`],
  )
  return batchId
}

async function reconcileShiftRpc(client, batchId, rowNumber, data, segments, allowSafeUpdate = true) {
  const res = await client.query(
    `SELECT public.reconcile_schedule_import_shift($1, $2, $3::jsonb, $4::jsonb, $5) AS result`,
    [batchId, rowNumber, JSON.stringify(data), JSON.stringify(segments ?? []), allowSafeUpdate],
  )
  return res.rows[0].result
}

const kaoSegments3 = [
  {
    segment_index: 1,
    start_time: '08:00',
    end_time: '12:00',
    required_host_count: 2,
    required_support_count: 1,
    required_technical_count: 0,
    planned_host_names: ['Planned Mai', 'Planned Lan'],
    planned_support_names: ['Planned Nam'],
    planned_technical_names: [],
  },
  {
    segment_index: 2,
    start_time: '12:00',
    end_time: '17:00',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 0,
    planned_host_names: ['Planned Hoa'],
    planned_support_names: ['Planned Binh'],
    planned_technical_names: [],
  },
  {
    segment_index: 3,
    start_time: '17:00',
    end_time: '22:00',
    required_host_count: 2,
    required_support_count: 1,
    required_technical_count: 0,
    planned_host_names: ['Planned Mai', 'Planned Linh'],
    planned_support_names: ['Planned Nam'],
    planned_technical_names: [],
  },
]

before(async () => {
  const rbac01 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, '20261104085945_rc19_rbac01_role_permission_enforcement.sql'),
    'utf8',
  )
  const catalogMatch = rbac01.match(
    /INSERT INTO private\.rbac_permission_catalog\b[\s\S]*?ON CONFLICT \(permission\) DO NOTHING;/i,
  )
  assert.ok(catalogMatch, 'Expected RBAC permission catalog seed in rbac01 migration')

  const rbac03 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, '20261104093735_rc19_rbac03_supported_permission_enforcement.sql'),
    'utf8',
  )
  const rbac03Update = rbac03.match(/UPDATE private\.rbac_permission_catalog\b[\s\S]*?;/i)

  const c3Catalog = fs.readFileSync(
    path.join(MIGRATIONS_DIR, '20261104110000_rc19_c3_scoped_action_catalog.sql'),
    'utf8',
  )
  const c3Update = c3Catalog.match(/UPDATE private\.rbac_permission_catalog\b[\s\S]*?;/i)

  const post117Files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql') && name > '20261111200000')
    .sort()
  assert.ok(
    post117Files.includes('20261124120000_rc19_w4_import_staffing_integrity.sql'),
    'Missing Task B migration 20261124120000_rc19_w4_import_staffing_integrity.sql',
  )

  const seedSql = [
    catalogMatch[0],
    `INSERT INTO private.rbac_runtime_gate(id, enabled) VALUES (true, false) ON CONFLICT (id) DO NOTHING;`,
    `INSERT INTO public.system_settings DEFAULT VALUES ON CONFLICT DO NOTHING;`,
    rbac03Update ? rbac03Update[0] : '',
    c3Update ? c3Update[0] : '',
  ]
    .filter(Boolean)
    .join('\n')

  const baselineWsl = toWslPath(BASELINE_DIR)
  const migrationsWsl = toWslPath(MIGRATIONS_DIR)
  const bootstrapScript = [
    'set -euo pipefail',
    `export PGPASSWORD='${PG_PASS}'`,
    `if [ -f "${CLUSTER_DIR}/data/postmaster.pid" ]; then ${PG_BIN}/pg_ctl -D "${CLUSTER_DIR}/data" -m immediate stop || true; fi`,
    `rm -rf "${CLUSTER_DIR}"`,
    `mkdir -p "${CLUSTER_DIR}/socket"`,
    `printf '%s\\n' '${PG_PASS}' > "${CLUSTER_DIR}/pgpass.txt"`,
    `chmod 600 "${CLUSTER_DIR}/pgpass.txt"`,
    `${PG_BIN}/initdb -D "${CLUSTER_DIR}/data" -U "${PG_USER}" --auth=scram-sha-256 --pwfile="${CLUSTER_DIR}/pgpass.txt" --encoding=UTF8 --locale=C.UTF-8 >/dev/null`,
    `printf "\\nlisten_addresses = '${PG_HOST}'\\nport = ${PG_PORT}\\nunix_socket_directories = '${CLUSTER_DIR}/socket'\\nmax_connections = 40\\nfsync = off\\nsynchronous_commit = off\\n" >> "${CLUSTER_DIR}/data/postgresql.conf"`,
    `${PG_BIN}/pg_ctl -D "${CLUSTER_DIR}/data" -l "${CLUSTER_DIR}/postgres.log" -w start >/dev/null`,
    `PSQL_BASE="${PG_BIN}/psql -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -X -v ON_ERROR_STOP=1"`,
    `$PSQL_BASE -d postgres -f "${baselineWsl}/01-sanitized-roles.sql" >/dev/null`,
    `$PSQL_BASE -d postgres -c "ALTER ROLE postgres WITH SUPERUSER PASSWORD '${PG_PASS}';" >/dev/null`,
    `$PSQL_BASE -d postgres -c "ALTER ROLE supabase_admin WITH SUPERUSER PASSWORD '${PG_PASS}';" >/dev/null`,
    `$PSQL_BASE -d postgres -c "ALTER ROLE authenticator WITH PASSWORD '${PG_PASS}';" >/dev/null`,
    `${PG_BIN}/createdb -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -O ${PG_USER} ${PG_DB}`,
    `$PSQL_BASE -d ${PG_DB} -f "${baselineWsl}/02-extensions.sql" >/dev/null`,
    `$PSQL_BASE -d ${PG_DB} -f "${baselineWsl}/03-schema-only-prod-117.sql" >/dev/null`,
    `$PSQL_BASE -d ${PG_DB} -f "${baselineWsl}/04-default-acl-and-event-triggers.sql" >/dev/null`,
    `$PSQL_BASE -d ${PG_DB} -f "${baselineWsl}/05-migration-ledger-117.sql" >/dev/null`,
    `$PSQL_BASE -d ${PG_DB} -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin; GRANT USAGE ON SCHEMA private TO authenticated; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;" >/dev/null`,
    `cat <<'__TASKB_RBAC_SEED__' > "${CLUSTER_DIR}/rbac_seed.sql"\n${seedSql}\n__TASKB_RBAC_SEED__`,
    `$PSQL_BASE -d ${PG_DB} -f "${CLUSTER_DIR}/rbac_seed.sql" >/dev/null`,
    ...post117Files.map(file => `$PSQL_BASE -d ${PG_DB} -f "${migrationsWsl}/${file}" >/dev/null`),
  ].join('\n')

  const proc = spawnSync('wsl.exe', ['-d', WSL_DISTRO, '--', 'bash', '-s'], {
    input: bootstrapScript,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (proc.status !== 0) {
    throw new Error(
      `WSL PG17 bootstrap failed (exit ${proc.status}):\nSTDOUT:\n${proc.stdout}\nSTDERR:\n${proc.stderr}`,
    )
  }

  // 5. Connect Pool, verify ledger, record post-117 receipts & seed deterministic fixtures
  pool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASS,
    database: PG_DB,
    max: 5,
  })

  const baseCountRes = await pool.query(`SELECT count(*)::int AS cnt FROM supabase_migrations.schema_migrations`)
  assert.equal(baseCountRes.rows[0].cnt, 117, `Expected 117 baseline receipts, found ${baseCountRes.rows[0].cnt}`)

  for (const file of post117Files) {
    const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n')
    const ver = file.slice(0, 14)
    const name = file.slice(15, -4)
    await pool.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, ARRAY[$3])`,
      [ver, name, raw],
    )
  }
  const finalCountRes = await pool.query(`SELECT count(*)::int AS cnt FROM supabase_migrations.schema_migrations`)
  assert.equal(finalCountRes.rows[0].cnt, 117 + post117Files.length)

  await pool.query(
    `INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES
       ($1, 'authenticated', 'authenticated', 'admin.taskb@test.local', now(), '{}', '{}', now(), now()),
       ($2, 'authenticated', 'authenticated', 'leader.taskb@test.local', now(), '{}', '{}', now(), now()),
       ($3, 'authenticated', 'authenticated', 'member1.taskb@test.local', now(), '{}', '{}', now(), now()),
       ($4, 'authenticated', 'authenticated', 'member2.taskb@test.local', now(), '{}', '{}', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [ADMIN_AUTH_ID, LEADER_AUTH_ID, MEMBER1_AUTH_ID, MEMBER2_AUTH_ID],
  )

  await pool.query(
    `INSERT INTO public.business_users
       (id, auth_user_id, email, full_name, role, system_permission, operational_roles, status, account_status, email_verified)
     VALUES
       ('user-admin-pg17', $1, 'admin.taskb@test.local', 'Admin TaskB', 'admin', 'admin', ARRAY['host','support','technical'], 'active', 'active', true),
       ('user-leader-pg17', $2, 'leader.taskb@test.local', 'Leader TaskB', 'leader', 'leader', ARRAY['host','support','technical'], 'active', 'active', true),
       ('user-member1-pg17', $3, 'member1.taskb@test.local', 'Member One TaskB', 'staff', 'member', ARRAY['host','support'], 'active', 'active', true),
       ('user-member2-pg17', $4, 'member2.taskb@test.local', 'Member Two TaskB', 'staff', 'member', ARRAY['host','support'], 'active', 'active', true)
     ON CONFLICT (id) DO NOTHING`,
    [ADMIN_AUTH_ID, LEADER_AUTH_ID, MEMBER1_AUTH_ID, MEMBER2_AUTH_ID],
  )

  await pool.query(
    `INSERT INTO public.brands (id, name, status) VALUES ($1, 'KAO PG17', 'active') ON CONFLICT (id) DO NOTHING`,
    [BRAND_KAO_ID],
  )
  await pool.query(
    `INSERT INTO public.platforms (id, name, status) VALUES ($1, 'Shopee Live', 'active') ON CONFLICT (id) DO NOTHING`,
    [PLATFORM_SHOPEE_ID],
  )
  await pool.query(
    `INSERT INTO public.campaigns (id, name, brand_id, start_date, end_date)
     VALUES ($1, 'KAO Mega PG17', $2, '2026-11-01', '2027-01-31') ON CONFLICT (id) DO NOTHING`,
    [CAMPAIGN_MEGA_ID, BRAND_KAO_ID],
  )
  await pool.query(
    `INSERT INTO public.rc19_leader_brand_scopes
       (leader_business_user_id, brand_id, scope_key, status, valid_from, version, granted_by, updated_by)
     VALUES
       ('user-leader-pg17', $1, 'shifts.manage', 'active', now() - interval '1 hour', 1, 'user-admin-pg17', 'user-admin-pg17'),
       ('user-leader-pg17', $1, 'shifts.read', 'active', now() - interval '1 hour', 1, 'user-admin-pg17', 'user-admin-pg17')
     ON CONFLICT (leader_business_user_id, brand_id, scope_key) DO NOTHING`,
    [BRAND_KAO_ID],
  )
})

after(async () => {
  await pool?.end().catch(() => {})
  wslExec(
    `if [ -f "${CLUSTER_DIR}/data/postmaster.pid" ]; then ${PG_BIN}/pg_ctl -D "${CLUSTER_DIR}/data" -m fast stop || true; fi && rm -rf "${CLUSTER_DIR}"`,
    { allowFailure: true },
  )
})

let b01ShiftId
let b01InitialVersion = 0
let b01SegmentIds = []

test('PG17 B01-B18: Full import reconciliation, segment integrity, metrics accuracy, locks & RLS', async () => {
  // Security gate check: unverified Excel batch without provider_verified source receipt must still fail closed
  await asActor(ADMIN_AUTH_ID, async client => {
    const unverifiedBatchId = await createBatchForTest(client, 'unverified-blocked.xlsx')
    await assert.rejects(
      () =>
        reconcileShiftRpc(
          client,
          unverifiedBatchId,
          1,
          {
            date: '2026-12-01',
            start_time: '08:00',
            end_time: '22:00',
            brand_id: BRAND_KAO_ID,
            platform_id: PLATFORM_SHOPEE_ID,
            required_host_count: 1,
            required_support_count: 1,
            required_technical_count: 0,
          },
          [],
        ),
      /SCHEDULE_SOURCE_REQUIRED_BEFORE_IMPORT/,
    )
  })

  // B01: KAO segmented shift import create (KT0=0, peaks 2/1/0, summary 5/3/0, metrics peak 2/1/0 total 5/3/0 hours 23/14/0)
  const b01BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b01-kao.xlsx')
  const b01 = await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b01BatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        timezone: 'Asia/Ho_Chi_Minh',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
        title: 'B01 KAO 14h Shift',
        agency_code: 'ada',
        execution_source: 'internal',
        required_host_count: 2,
        required_support_count: 1,
        required_technical_count: 0,
        allow_multi_role: true,
      },
      kaoSegments3,
    )
    assert.equal(rpc.status, 'created')
    assert.equal(rpc.outcome, 'imported')
    b01ShiftId = rpc.shift_id

    const shiftRes = await client.query(`SELECT * FROM public.shifts WHERE id = $1`, [b01ShiftId])
    const s = shiftRes.rows[0]
    b01InitialVersion = s.version
    assert.ok(b01InitialVersion >= 1)
    assert.equal(s.required_host_count, 2)
    assert.equal(s.required_support_count, 1)
    assert.equal(s.required_technical_count, 0)

    const segsRes = await client.query(
      `SELECT * FROM public.shift_staffing_segments WHERE shift_id = $1 ORDER BY segment_index`,
      [b01ShiftId],
    )
    assert.equal(segsRes.rows.length, 3)
    assert.deepEqual(segsRes.rows.map(r => r.required_technical_count), [0, 0, 0])
    b01SegmentIds = segsRes.rows.map(r => r.id)

    const sumRes = await client.query(
      `SELECT role, required, approved, pending, remaining FROM public.get_shift_staffing_summary($1) ORDER BY role`,
      [[b01ShiftId]],
    )
    const byRole = Object.fromEntries(sumRes.rows.map(r => [r.role, r]))
    assert.equal(byRole.host.required, 5)
    assert.equal(byRole.host.remaining, 5)
    assert.equal(byRole.support.required, 3)
    assert.equal(byRole.technical.required, 0)
    assert.equal(byRole.technical.remaining, 0)

    const metricsRes = await client.query(
      `SELECT * FROM public.get_shift_staffing_metrics($1) ORDER BY role`,
      [[b01ShiftId]],
    )
    const mByRole = Object.fromEntries(metricsRes.rows.map(r => [r.role, r]))
    assert.equal(mByRole.host.peak_concurrent_required, 2)
    assert.equal(mByRole.host.total_positions_required, 5)
    assert.equal(Number(mByRole.host.required_staff_hours), 23)
    assert.equal(mByRole.support.peak_concurrent_required, 1)
    assert.equal(mByRole.support.total_positions_required, 3)
    assert.equal(Number(mByRole.support.required_staff_hours), 14)
    assert.equal(mByRole.technical.peak_concurrent_required, 0)
    assert.equal(mByRole.technical.total_positions_required, 0)
    assert.equal(Number(mByRole.technical.required_staff_hours), 0)
    return rpc
  })
  assert.ok(b01.shift_id)

  // B02: Unsegmented shift create with KT0 = 0 (must NOT default to 1)
  const b02BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b02-unsegmented.xlsx', {
    date: '2026-12-02',
    start_time: '09:00',
    end_time: '13:00',
  })
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b02BatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-02',
        start_time: '09:00',
        end_time: '13:00',
        timezone: 'Asia/Ho_Chi_Minh',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        studio: 'B02 Studio',
        title: 'B02 Unsegmented KT0',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 0,
      },
      [],
    )
    assert.equal(rpc.status, 'created')
    assert.equal(rpc.shift.required_technical_count, 0)
    const sumRes = await client.query(
      `SELECT role, required FROM public.get_shift_staffing_summary($1)`,
      [[rpc.shift_id]],
    )
    const tech = sumRes.rows.find(r => r.role === 'technical')
    assert.equal(tech.required, 0)
  })

  // B03: Overnight shift (22:00-02:00) + overnight segments in Asia/Ho_Chi_Minh
  const b03BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b03-overnight.xlsx', {
    date: '2026-12-03',
    start_time: '22:00',
    end_time: '02:00',
  })
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b03BatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-03',
        start_time: '22:00',
        end_time: '02:00',
        timezone: 'Asia/Ho_Chi_Minh',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        studio: 'B03 Overnight',
        title: 'B03 Overnight Shift',
        required_host_count: 2,
        required_support_count: 1,
        required_technical_count: 0,
        allow_multi_role: true,
      },
      [
        {
          segment_index: 1,
          start_time: '22:00',
          end_time: '00:00',
          required_host_count: 1,
          required_support_count: 1,
          required_technical_count: 0,
        },
        {
          segment_index: 2,
          start_time: '00:00',
          end_time: '02:00',
          required_host_count: 2,
          required_support_count: 1,
          required_technical_count: 0,
        },
      ],
    )
    assert.equal(rpc.status, 'created')
    const s = rpc.shift
    assert.equal(s.end_date, '2026-12-04')
    assert.equal(s.crosses_midnight, true)
    assert.equal(new Date(s.start_at).toISOString(), '2026-12-03T15:00:00.000Z')
    assert.equal(new Date(s.end_at).toISOString(), '2026-12-03T19:00:00.000Z')
    assert.equal(rpc.segments.length, 2)
    assert.equal(new Date(rpc.segments[1].start_at).toISOString(), '2026-12-03T17:00:00.000Z')
    assert.equal(new Date(rpc.segments[1].end_at).toISOString(), '2026-12-03T19:00:00.000Z')
  })

  // B04: Idempotent re-import -> unchanged / duplicate_skipped / batch row shift_id IS NULL / zero version bump
  const b04BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b04-idempotent.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b04BatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        timezone: 'Asia/Ho_Chi_Minh',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
        title: 'B01 KAO 14h Shift',
        agency_code: 'ada',
        execution_source: 'internal',
        required_host_count: 2,
        required_support_count: 1,
        required_technical_count: 0,
        allow_multi_role: true,
      },
      kaoSegments3,
    )
    assert.equal(rpc.status, 'unchanged')
    assert.equal(rpc.outcome, 'duplicate_skipped')
    assert.equal(rpc.shift_id, b01ShiftId)

    const batchRow = await client.query(
      `SELECT outcome, shift_id, failure_code FROM public.schedule_import_batch_rows WHERE batch_id = $1 AND row_number = 1`,
      [batchId],
    )
    assert.equal(batchRow.rows[0].outcome, 'duplicate_skipped')
    assert.equal(batchRow.rows[0].shift_id, null)

    const shiftRes = await client.query(`SELECT version FROM public.shifts WHERE id = $1`, [b01ShiftId])
    assert.equal(shiftRes.rows[0].version, b01InitialVersion)
  })

  // Seed approved segment-linked registrations BEFORE B05/B06/B07/B08/B09/B15 so segment ID preservation & guards run against real links!
  // Also verifies B15 (member-1 approved on BOTH K01 and K02 -> unique=1, approved=2)
  await asActor(
    ADMIN_AUTH_ID,
    client =>
      client.query(
        `INSERT INTO public.shift_registrations (id, shift_id, staffing_segment_id, user_id, operational_role, status, source)
         VALUES
           ('reg-pg17-1', $1, $2, 'user-member1-pg17', 'host', 'approved', 'self_registration'),
           ('reg-pg17-2', $1, $3, 'user-member1-pg17', 'host', 'manually_assigned', 'manual_assignment'),
           ('reg-pg17-3', $1, $2, 'user-member2-pg17', 'host', 'approved', 'self_registration')`,
        [b01ShiftId, b01SegmentIds[0], b01SegmentIds[1]],
      ),
    { dbRole: 'postgres' },
  )

  // B15: Same person (member-1) assigned across 2 segments -> unique=2 (member1+member2), approved=3, K01 remaining=0, K02 remaining=0, K03 remaining=2 -> total remaining=2
  await asActor(ADMIN_AUTH_ID, async client => {
    const metricsRes = await client.query(
      `SELECT * FROM public.get_shift_staffing_metrics($1) WHERE role = 'host'`,
      [[b01ShiftId]],
    )
    const m = metricsRes.rows[0]
    assert.equal(m.unique_assigned_people, 2)
    assert.equal(m.approved_assignments, 3)
    assert.equal(m.total_positions_required, 5)
    assert.equal(m.remaining_vacancies, 2)
  })

  // B05 + B06: Safe re-import update (increase K02 host capacity 1 -> 2, update title) -> updated, version increments, segment IDs & registrations preserved
  let b05Version = 0
  const b05PreRes = await pool.query(`SELECT version FROM public.shifts WHERE id = $1`, [b01ShiftId])
  const versionBeforeB05 = b05PreRes.rows[0].version
  const b05BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b05-safe-update.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b05BatchId
    const updatedSegs = kaoSegments3.map(s =>
      s.segment_index === 2 ? { ...s, required_host_count: 2 } : s,
    )
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        timezone: 'Asia/Ho_Chi_Minh',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
        title: 'B05 Safe Update Title',
        agency_code: 'ada',
        execution_source: 'internal',
        required_host_count: 2,
        required_support_count: 1,
        required_technical_count: 0,
        allow_multi_role: true,
      },
      updatedSegs,
    )
    assert.equal(rpc.status, 'updated', `Expected updated in B05, got: ${JSON.stringify(rpc)}`)
    assert.ok(
      rpc.shift.version > versionBeforeB05,
      `Expected version > ${versionBeforeB05}, got ${rpc.shift.version}`,
    )
    b05Version = rpc.shift.version
    assert.equal(rpc.shift.title, 'B05 Safe Update Title')

    const segsAfter = await client.query(
      `SELECT id, required_host_count FROM public.shift_staffing_segments WHERE shift_id = $1 ORDER BY segment_index`,
      [b01ShiftId],
    )
    assert.deepEqual(segsAfter.rows.map(r => r.id), b01SegmentIds)
    assert.equal(segsAfter.rows[1].required_host_count, 2)

    const regsAfter = await client.query(
      `SELECT id, staffing_segment_id, status FROM public.shift_registrations WHERE shift_id = $1 ORDER BY id`,
      [b01ShiftId],
    )
    assert.equal(regsAfter.rows[0].staffing_segment_id, b01SegmentIds[0])
    assert.equal(regsAfter.rows[1].staffing_segment_id, b01SegmentIds[1])
  })

  // B07: Capacity reduction below approved count on K01 (2 approved hosts -> request 1) -> conflict + full rollback
  const b07BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b07-cap-conflict.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b07BatchId
    const badSegs = kaoSegments3.map(s =>
      s.segment_index === 1 ? { ...s, required_host_count: 1 } : s,
    )
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
        title: 'Should Rollback B07',
      },
      badSegs,
    )
    assert.equal(rpc.status, 'conflict')
    assert.equal(rpc.outcome, 'retryable')
    assert.match(rpc.failure_code, /^STAFFING_CAPACITY_BELOW_APPROVED_COUNT:host:approved=2:requested=1/)
    const titleAfter = await client.query(`SELECT title, version FROM public.shifts WHERE id = $1`, [b01ShiftId])
    assert.equal(titleAfter.rows[0].title, 'B05 Safe Update Title')
    assert.equal(titleAfter.rows[0].version, b05Version)
  })

  // B08: Segment time change on active-linked K01 -> conflict + rolled back
  const b08BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b08-time-conflict.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b08BatchId
    const shiftedSegs = kaoSegments3.map(s =>
      s.segment_index === 1
        ? { ...s, end_time: '11:30' }
        : s.segment_index === 2
          ? { ...s, start_time: '11:30' }
          : s,
    )
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
        title: 'Should Rollback B08',
      },
      shiftedSegs,
    )
    assert.equal(rpc.status, 'conflict')
    assert.equal(rpc.failure_code, 'STAFFING_SEGMENT_TIME_CHANGE_CONFLICT')
  })

  // B09: Segment deletion on active-linked K02 -> conflict + rolled back
  const b09BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b09-delete-conflict.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b09BatchId
    const droppedSegs = [kaoSegments3[0], { ...kaoSegments3[2], segment_index: 3 }]
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
      },
      droppedSegs,
    )
    assert.equal(rpc.status, 'conflict')
    assert.equal(rpc.failure_code, 'STAFFING_SEGMENT_DELETE_CONFLICT')
  })

  // B10: Cross-agency conflict (`ada` vs `snap`)
  const b10BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b10-agency-conflict.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b10BatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
        agency_code: 'snap',
        execution_source: 'agency',
      },
      kaoSegments3,
    )
    assert.equal(rpc.status, 'conflict')
    assert.equal(rpc.failure_code, 'IMPORT_CROSS_AGENCY_CONFLICT')
  })

  // B17: Safe update disabled (`p_allow_safe_update = false`)
  const b17BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b17-disallow-update.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b17BatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
        title: 'Disabled update',
      },
      kaoSegments3,
      false,
    )
    assert.equal(rpc.status, 'conflict')
    assert.equal(rpc.failure_code, 'IMPORT_SAFE_UPDATE_DISABLED')
  })

  // B11: Completed/cancelled shift lock -> IMPORT_SHIFT_STATUS_LOCKED
  let lockTestShiftId
  const b11CreateBatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b11-create.xlsx', {
    date: '2026-12-05',
    start_time: '10:00',
    end_time: '14:00',
  })
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b11CreateBatchId
    const created = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-05',
        start_time: '10:00',
        end_time: '14:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        studio: 'B11 Lock Studio',
        title: 'B11 Initial',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 0,
      },
      [],
    )
    lockTestShiftId = created.shift_id
  })
  await asActor(
    ADMIN_AUTH_ID,
    client =>
      client.query(
        `UPDATE public.shifts SET status = 'completed', status_mode = 'manual' WHERE id = $1`,
        [lockTestShiftId],
      ),
    { dbRole: 'postgres' },
  )
  const b11LockedBatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b11-locked.xlsx', {
    date: '2026-12-05',
    start_time: '10:00',
    end_time: '14:00',
  })
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b11LockedBatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-05',
        start_time: '10:00',
        end_time: '14:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        studio: 'B11 Lock Studio',
        title: 'B11 Attempt Mutation',
        required_host_count: 2,
        required_support_count: 1,
        required_technical_count: 0,
        allow_multi_role: true,
      },
      [],
    )
    assert.equal(rpc.status, 'conflict')
    assert.equal(rpc.failure_code, 'IMPORT_SHIFT_STATUS_LOCKED')
  })

  // B12: Confirmed/locked payroll lock -> IMPORT_APPROVED_PAYROLL_LOCKED
  await asActor(
    ADMIN_AUTH_ID,
    async client => {
      await client.query(
        `UPDATE public.shifts SET status = 'completed', status_mode = 'manual' WHERE id = $1`,
        [b01ShiftId],
      )
      await client.query(
        `INSERT INTO public.workforce_actual_segments (id, shift_id, staff_id, operational_role, event_kind, coverage_kind, actual_start_at, actual_end_at, review_status, evidence_note, created_by)
         VALUES ('vas-pg17-b12', $1, 'user-member1-pg17', 'host', 'worked', 'planned', '2026-12-01T01:00:00Z', '2026-12-01T05:00:00Z', 'draft', 'Synthetic B12 actual segment evidence', 'user-member1-pg17')`,
        [b01ShiftId],
      )
      const approvedRes = await client.query(
        `UPDATE public.workforce_actual_segments
         SET review_status = 'approved',
             reviewed_by = 'user-admin-pg17',
             reviewed_at = now(),
             review_note = 'Synthetic B12 approved',
             version = 2
         WHERE id = 'vas-pg17-b12'
         RETURNING version`,
      )
      await client.query(
        `INSERT INTO public.workforce_payroll_segment_decisions (segment_id, state, reviewed_by, confirmed_by, confirmed_at, reason, missing_evidence, segment_version)
         VALUES ('vas-pg17-b12', 'admin_confirmed', 'user-admin-pg17', 'user-admin-pg17', now(), 'Synthetic B12 payroll confirmation lock test', '{}'::text[], $1)`,
        [approvedRes.rows[0].version],
      )
    },
    { dbRole: 'postgres' },
  )
  const b12BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b12-payroll-lock.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b12BatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        campaign_id: CAMPAIGN_MEGA_ID,
        studio: 'Studio KAO-PG17',
        title: 'Should Block Payroll Lock',
      },
      kaoSegments3,
    )
    assert.equal(rpc.status, 'conflict')
    assert.equal(rpc.failure_code, 'IMPORT_APPROVED_PAYROLL_LOCKED')
  })

  // B13: Ambiguous slot identity (existing qualified shift vs incoming empty qualifier in same date/time/brand/platform)
  const b13BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b13-ambiguous.xlsx')
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b13BatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-01',
        start_time: '08:00',
        end_time: '22:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 0,
      },
      [],
    )
    assert.equal(rpc.status, 'conflict')
    assert.equal(rpc.failure_code, 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED')
  })

  // B14: Overlapping incoming segments rejected
  const b14BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b14-overlap.xlsx', {
    date: '2026-12-06',
    start_time: '08:00',
    end_time: '18:00',
  })
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b14BatchId
    await assert.rejects(
      () =>
        reconcileShiftRpc(
          client,
          batchId,
          1,
          {
            date: '2026-12-06',
            start_time: '08:00',
            end_time: '18:00',
            brand_id: BRAND_KAO_ID,
            platform_id: PLATFORM_SHOPEE_ID,
            studio: 'B14 Studio',
            required_host_count: 2,
            required_support_count: 1,
            required_technical_count: 0,
          },
          [
            { segment_index: 1, start_time: '08:00', end_time: '13:00', required_host_count: 1, required_support_count: 1, required_technical_count: 0 },
            { segment_index: 2, start_time: '12:00', end_time: '18:00', required_host_count: 2, required_support_count: 1, required_technical_count: 0 },
          ],
        ),
      /STAFFING_SEGMENTS_OVERLAP/,
    )
  })

  // B16: Legacy 4-arg create_schedule_import_shift compatibility preserved
  const b16BatchId = await createVerifiedBatch(ADMIN_AUTH_ID, 'b16-legacy.xlsx', {
    date: '2026-12-07',
    start_time: '14:00',
    end_time: '18:00',
  })
  await asActor(ADMIN_AUTH_ID, async client => {
    const batchId = b16BatchId
    const res = await client.query(
      `SELECT public.create_schedule_import_shift($1, $2, $3::jsonb, $4::jsonb) AS result`,
      [
        batchId,
        1,
        JSON.stringify({
          date: '2026-12-07',
          start_time: '14:00',
          end_time: '18:00',
          timezone: 'Asia/Ho_Chi_Minh',
          brand_id: BRAND_KAO_ID,
          platform_id: PLATFORM_SHOPEE_ID,
          studio: 'B16 Legacy Studio',
          title: 'B16 Legacy Compat',
          required_host_count: 1,
          required_support_count: 1,
          required_technical_count: 0,
        }),
        JSON.stringify([]),
      ],
    )
    const legacy = res.rows[0].result
    assert.equal(legacy.outcome, 'imported')
    assert.equal(legacy.shift.required_technical_count, 0)
  })

  // B18: Role/RLS privilege check (anon & service_role revoked; member blocked; leader allowed)
  const privRes = await pool.query(`
    SELECT
      has_function_privilege('anon', 'public.reconcile_schedule_import_shift(text,integer,jsonb,jsonb,boolean)', 'EXECUTE') AS anon_exec,
      has_function_privilege('service_role', 'public.reconcile_schedule_import_shift(text,integer,jsonb,jsonb,boolean)', 'EXECUTE') AS sr_exec,
      has_function_privilege('authenticated', 'public.reconcile_schedule_import_shift(text,integer,jsonb,jsonb,boolean)', 'EXECUTE') AS auth_exec,
      has_function_privilege('anon', 'public.get_shift_staffing_metrics(text[])', 'EXECUTE') AS anon_metrics,
      has_function_privilege('authenticated', 'public.get_shift_staffing_metrics(text[])', 'EXECUTE') AS auth_metrics
  `)
  assert.equal(privRes.rows[0].anon_exec, false)
  assert.equal(privRes.rows[0].sr_exec, false)
  assert.equal(privRes.rows[0].auth_exec, true)
  assert.equal(privRes.rows[0].anon_metrics, false)
  assert.equal(privRes.rows[0].auth_metrics, true)

  await asActor(MEMBER1_AUTH_ID, async client => {
    await assert.rejects(
      () => createBatchForTest(client, 'b18-member-blocked.xlsx'),
      /OPERATION_NOT_ALLOWED|PERMISSION|ADMIN|LEADER/i,
    )
  })
  // Also create batch as Admin first, then try direct reconcile as Member -> must fail closed!
  let memberCheckBatchId
  await asActor(ADMIN_AUTH_ID, async client => {
    memberCheckBatchId = await createBatchForTest(client, 'b18-member-direct.xlsx', {
      date: '2026-12-08',
      start_time: '09:00',
      end_time: '12:00',
    })
  })
  await asActor(MEMBER1_AUTH_ID, async client => {
    await assert.rejects(
      () =>
        reconcileShiftRpc(
          client,
          memberCheckBatchId,
          1,
          {
            date: '2026-12-08',
            start_time: '09:00',
            end_time: '12:00',
            brand_id: BRAND_KAO_ID,
            platform_id: PLATFORM_SHOPEE_ID,
            required_host_count: 1,
            required_support_count: 1,
            required_technical_count: 0,
          },
          [],
        ),
      /OPERATION_NOT_ALLOWED|PERMISSION|ADMIN|LEADER/i,
    )
  })
  const b18LeaderBatchId = await createVerifiedBatch(LEADER_AUTH_ID, 'b18-leader-allowed.xlsx', {
    date: '2026-12-09',
    start_time: '09:00',
    end_time: '12:00',
  })
  await asActor(LEADER_AUTH_ID, async client => {
    const batchId = b18LeaderBatchId
    const rpc = await reconcileShiftRpc(
      client,
      batchId,
      1,
      {
        date: '2026-12-09',
        start_time: '09:00',
        end_time: '12:00',
        brand_id: BRAND_KAO_ID,
        platform_id: PLATFORM_SHOPEE_ID,
        studio: 'B18 Leader Studio',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 0,
      },
      [],
    )
    assert.equal(rpc.status, 'created')
  })
})
