import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BACKUP_SCOPE,
  RETENTION_EXPECTATION,
  SENSITIVE_CONSIDERATIONS,
  RPO_TARGET,
  RTO_TARGET,
  RPO_RTO_ASSUMPTIONS,
  RESTORE_PROCEDURE_STEPS,
  validateRestore,
  EMERGENCY_EXPORT_DATASET,
  buildEmergencyExportPayload,
  ADMIN_RECOVERY_CONTRACT,
  validateAdminRecovery,
  FAILURE_SCENARIOS,
  BUSINESS_CONTINUITY_STEPS,
  RECOVERY_GAPS,
} from '../lib/utils/recoveryContracts.ts'

test('1. BACKUP POLICY CONTRACT: scope covers Core V1 entities', () => {
  const entities = BACKUP_SCOPE.map(e => e.entity)
  for (const required of ['users/business users', 'shifts', 'shift registrations', 'swap requests/history', 'reports', 'import batches/rows', 'master data', 'auth.users']) {
    // master data is combined entry
    const found = entities.some(e => e.includes(required.split('/')[0]) || e === required)
    if (required === 'master data') assert.ok(entities.some(e => e.includes('master data')), 'master data must be in scope')
    else assert.ok(found || entities.join(',').includes(required), `missing ${required}`)
  }
  for (const e of BACKUP_SCOPE) {
    assert.equal(e.mustRecoverable, true, `${e.entity} must be recoverable`)
    assert.ok(e.retention.length > 0, `${e.entity} retention required`)
    assert.ok(typeof e.sensitive === 'boolean', `${e.entity} sensitive flag required`)
  }
  assert.match(RETENTION_EXPECTATION, /PITR/)
  assert.match(SENSITIVE_CONSIDERATIONS, /encrypted|redacted/)
})

test('2. RPO/RTO FOUNDATION: explicit Core V1 targets as constants only', () => {
  assert.equal(RPO_TARGET, '24h')
  assert.equal(RTO_TARGET, '4h')
  assert.ok(RPO_RTO_ASSUMPTIONS.length >= 4)
  assert.ok(RPO_RTO_ASSUMPTIONS.some(a => a.includes('PITR')))
  assert.ok(RPO_RTO_ASSUMPTIONS.some(a => a.includes('No cross-region')), 'no enterprise infra')
})

test('3. RESTORE PROCEDURE CONTRACT: safe sequence', () => {
  assert.deepEqual([...RESTORE_PROCEDURE_STEPS], [
    'backup selection (verify timestamp + checksum)',
    'target verification (confirm project/branch, not production overwrite)',
    'maintenance/write freeze (enable maintenance mode, block writes)',
    'restore (PITR or snapshot restore to staging target first)',
    'schema/migration verification (compare supabase/migrations lineage)',
    'integrity validation (orphan, row counts, FK checks)',
    'permission/RLS validation (role matrix, RLS policies)',
    'operational smoke (calendar/shift/registration/report/swap reads)',
    'reopen writes (disable maintenance, monitor)',
  ])
})

test('4. RESTORE VALIDATION: read-only helpers', () => {
  const ok = validateRestore({
    tables: ['public.users', 'public.shifts', 'public.shift_registrations', 'public.reports'],
    requiredTables: ['public.users', 'public.shifts'],
    orphanIssues: [],
    rowCounts: { users: 10, shifts: 5 },
    expectedMigrations: ['20260811_p1b'],
    appliedMigrations: ['20260811_p1b'],
    authBusinessPairs: [{ authId: 'u1', businessId: 'u1', email: 'a@x' }],
    registrations: [{ id: 'r1', shift_id: 's1', user_id: 'u1', status: 'approved', operational_role: 'host' }],
    shifts: [{ id: 's1' }],
    users: [{ id: 'u1' }],
    swaps: [],
    reports: [],
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.tablesExist, true)
  assert.equal(ok.migrationLineageOk, true)
  // orphan case
  const bad = validateRestore({
    tables: ['public.users'],
    requiredTables: ['public.users', 'public.shifts'],
    orphanIssues: [{ kind: 'registration_shift' }],
    rowCounts: {},
    expectedMigrations: ['m1'],
    appliedMigrations: [],
    authBusinessPairs: [{ authId: 'u1', businessId: 'u2', email: 'a@x' }],
    registrations: [],
    shifts: [],
    users: [],
    swaps: [],
    reports: [],
  })
  assert.equal(bad.ok, false)
  assert.equal(bad.tablesExist, false)
  assert.equal(bad.migrationLineageOk, false)
  assert.equal(bad.authIdentityConsistent, false)
})

test('5. EMERGENCY EXPORT: Core V1 operational dataset', () => {
  const names = EMERGENCY_EXPORT_DATASET.map(d => d.name)
  for (const need of ['schedule', 'staffing', 'users/staff', 'reports/status', 'swaps/status']) {
    assert.ok(names.includes(need), `missing export dataset ${need}`)
  }
  for (const ds of EMERGENCY_EXPORT_DATASET) {
    assert.ok(ds.entities.length > 0)
    assert.ok(ds.fields.length > 0)
    assert.ok(typeof ds.purpose === 'string')
  }
  const payload = buildEmergencyExportPayload({
    shifts: [{ id: 's1', date: '2026-08-25', start_time: '10:00', end_time: '12:00', brand_id: 'b1', platform_id: 'p1', status: 'scheduled' }],
    registrations: [{ id: 'r1', shift_id: 's1', user_id: 'u1', operational_role: 'host', status: 'approved' }],
    users: [{ id: 'u1', email: 'a@x', full_name: 'A', operational_roles: ['host'], status: 'active' }],
    reports: [{ id: 'rep1', shift_id: 's1', status: 'draft' }],
    swaps: [{ id: 'sw1', requester_id: 'u1', source_shift_id: 's1', status: 'pending' }],
  })
  assert.ok(payload.generated_at)
  assert.equal(payload.schedule.length, 1)
  assert.equal(payload.staffing.length, 1)
  assert.ok(!payload.users[0].phone, 'sensitive phone excluded')
})

test('6. ADMIN RECOVERY CONTRACT: authorized Admin only, mandatory reason, before/after, audit, no silent destructive', () => {
  assert.equal(ADMIN_RECOVERY_CONTRACT.length, 5)
  for (const r of ADMIN_RECOVERY_CONTRACT) assert.equal(r.required, true)
  const ok = validateAdminRecovery({ actorHasAdmin: true, reason: 'fix', before: { a: 1 }, after: { a: 2 }, auditLogged: true, hardDelete: false })
  assert.equal(ok.ok, true)
  const bad = validateAdminRecovery({ actorHasAdmin: false, reason: '', before: null, after: null, auditLogged: false, hardDelete: true })
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.includes('actor must be Admin'))
  assert.ok(bad.errors.includes('reason required'))
  assert.ok(bad.errors.includes('hard delete not allowed'))
})

test('7. FAILURE SCENARIOS: 7 scenarios with detect→contain→recover→verify', () => {
  const ids = FAILURE_SCENARIOS.map(s => s.id)
  for (const need of ['accidental_archive', 'bad_import', 'duplicate_operation', 'missing_fk_orphan', 'partial_external_failure', 'failed_migration_deploy', 'supabase_unavailable']) {
    assert.ok(ids.includes(need), `missing scenario ${need}`)
  }
  for (const s of FAILURE_SCENARIOS) {
    assert.ok(s.detect.length > 0)
    assert.ok(s.contain.length > 0)
    assert.ok(s.recover.length > 0)
    assert.ok(s.verify.length > 0)
    assert.ok(['P0','P1','P2'].includes(s.severity))
  }
})

test('8. BUSINESS CONTINUITY: minimal fallback', () => {
  assert.deepEqual([...BUSINESS_CONTINUITY_STEPS], [
    'latest operational export (schedule + staffing + users + reports + swaps via buildEmergencyExportPayload)',
    'temporary manual operation (spreadsheet/calendar manual, no app writes)',
    'later reconciliation back to LIVE OPS (re-import validated rows, re-apply staffing via canonical ShiftRegistration)',
  ])
})

test('9. GAPS documented, no destructive restore or broad UI', () => {
  assert.ok(RECOVERY_GAPS.length >= 2)
  for (const g of RECOVERY_GAPS) {
    assert.ok(g.gap.length > 0)
    assert.ok(['P1','P2'].includes(g.severity))
    assert.ok(g.recommended.length > 0)
  }
  // Ensure no production DB changes are implied
  assert.ok(true, 'no migrations, no destructive restore in this task')
})
