import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createRbac01RoleDefaultsHandler } from '../lib/server/rbac01RoleDefaultsHandler.ts'
import { createRbac02AccountOverridesHandler } from '../lib/server/rbac02AccountOverridesHandler.ts'
import { createAttendancePhotoReviewHandler } from '../lib/server/attendancePhotoReviewHandler.ts'
import { createWorkforceActualHandler } from '../lib/server/workforceActualHandler.ts'
import { createWorkforcePayrollHandler } from '../lib/server/workforcePayrollHandler.ts'
import { createStorageResourceRegistryHandler } from '../lib/server/storageResourceRegistryHandler.ts'

const member = async () => ({ id: 'auth-member', businessUserId: 'member-1', systemPermission: 'member' as const })

test('Member cannot mutate role defaults or another account permission', async () => {
  let databaseCalls = 0
  const createClient = async () => { databaseCalls++; throw new Error('must not reach database') }
  const roleDefaults = createRbac01RoleDefaultsHandler({ resolveUser: member, createClient, enabled: () => true })
  const accountOverrides = createRbac02AccountOverridesHandler({ resolveUser: member, createClient, enabled: () => true })

  assert.equal((await roleDefaults.POST(new Request('https://ops.example/api/role-defaults', {
    method: 'POST', body: JSON.stringify({ action: 'rollback', versionId: 1 }),
  }))).status, 403)
  assert.equal((await accountOverrides.POST(new Request('https://ops.example/api/rbac/account-overrides', {
    method: 'POST', body: JSON.stringify({ action: 'reset', targetId: 'leader-1', permission: 'audit.view_team', reason: 'forged member mutation', expectedVersion: 0 }),
  }))).status, 403)
  assert.equal(databaseCalls, 0)
})

test('Member cannot review attendance or write staffing actuals through APIs', async () => {
  let databaseCalls = 0
  const createClient = async () => { databaseCalls++; throw new Error('must not reach database') }
  const review = createAttendancePhotoReviewHandler({
    resolveUser: member, createClient, isEnabled: () => true,
  })
  const actuals = createWorkforceActualHandler({
    resolveUser: member, isEnabled: () => true,
  })
  const body = JSON.stringify({
    event_id: '10000000-0000-4000-8000-000000000001', expected_version: 0,
    expected_evidence_revision: 1, decision: 'approved', reason: 'forged review attempt',
    idempotency_key: '10000000-0000-4000-8000-000000000002',
  })
  assert.equal((await review.POST(new Request('https://ops.example/api/workforce/attendance-photo-review', {
    method: 'POST', headers: { origin: 'https://ops.example' }, body,
  }))).status, 403)
  assert.equal((await actuals.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST', body: JSON.stringify({ action: 'upsert_segment' }),
  }))).status, 403)
  assert.equal(databaseCalls, 0)
})

test('Member cannot reach payroll administration or create scoped resources', async () => {
  let databaseCalls = 0
  const payroll = createWorkforcePayrollHandler({
    resolveUser: member, isEnabled: () => true,
    createClient: () => { databaseCalls++; throw new Error('must not reach database') },
  })
  const resources = createStorageResourceRegistryHandler(member)
  const origin = 'https://ops.example'
  assert.equal((await payroll.GET(new Request(`${origin}/api/workforce/payroll`))).status, 403)
  assert.equal((await resources.POST(new Request(`${origin}/api/storage-resources`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', provider: 'google_drive', canonical_id: 'drive-file-1',
      canonical_url: 'https://drive.google.com/file/d/drive-file-1/view', title: 'Synthetic file',
      resource_type: 'image', visibility: 'owner_only' }),
  }))).status, 403)
  assert.equal(databaseCalls, 0)
})

test('Operational file writes enforce the role permission before provider or metadata work', () => {
  const source = readFileSync(new URL('../lib/server/operationalFileRouteHandler.ts', import.meta.url), 'utf8')
  assert.match(source, /POST\(request: Request\)[\s\S]{0,180}requirePermission\(request, 'storage\.upload'/)
  assert.match(source, /DELETE\(request: Request\)[\s\S]{0,180}requirePermission\(request, 'storage\.delete'/)
})
