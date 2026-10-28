import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { GET, POST } from '../app/api/workforce/attendance-import/route'
import { isFeatureEnabled } from '../lib/flags'
import { createHistoricalAttendanceHandler } from '../lib/server/historicalAttendanceHandler'
import { createWorkforceCapabilitiesHandler } from '../lib/server/workforceCapabilitiesHandler'

test('attendance importer is off by default and both route methods fail closed before auth', async () => {
  const previous = process.env.FEATURE_ATTENDANCE_IMPORT
  try {
    for (const value of [undefined, 'false']) {
      if (value === undefined) delete process.env.FEATURE_ATTENDANCE_IMPORT
      else process.env.FEATURE_ATTENDANCE_IMPORT = value

      assert.equal(isFeatureEnabled('attendance_import'), false)
      for (const response of [
        await GET(new Request('http://localhost/api/workforce/attendance-import')),
        await POST(new Request('http://localhost/api/workforce/attendance-import', {
          method: 'POST',
          body: '{invalid json',
        })),
      ]) {
        assert.equal(response.status, 404)
        assert.equal((await response.json()).error.code, 'WORKFORCE_FEATURE_DISABLED')
      }
    }
  } finally {
    if (previous === undefined) delete process.env.FEATURE_ATTENDANCE_IMPORT
    else process.env.FEATURE_ATTENDANCE_IMPORT = previous
  }
})

test('disabled handler reaches neither authorization nor database dependencies', async () => {
  let authCalls = 0
  let databaseCalls = 0
  const handler = createHistoricalAttendanceHandler({
    isEnabled: () => false,
    resolveUser: async () => { authCalls += 1; throw new Error('auth should not run') },
    client: () => { databaseCalls += 1; throw new Error('database should not run') },
  })
  const get = await handler.GET(new Request('http://localhost/api/workforce/attendance-import'))
  const post = await handler.POST(new Request('http://localhost/api/workforce/attendance-import', { method: 'POST' }))
  assert.equal(get.status, 404)
  assert.equal(post.status, 404)
  assert.equal(authCalls, 0)
  assert.equal(databaseCalls, 0)
})

test('Admin and Leader capability follows the server flag; Member cannot receive it', async () => {
  for (const [systemPermission, expected] of [['admin', true], ['leader', true], ['member', false]] as const) {
    const handler = createWorkforceCapabilitiesHandler({
      resolveUser: async () => ({ systemPermission, businessUserId: 'synthetic-business-user' } as never),
      enabled: flag => flag === 'attendance_import',
    })
    const response = await handler.GET(new Request('http://localhost/api/workforce/capabilities'))
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.capabilities.attendance_import, expected)
  }
})

test('Staffing UI renders the import tab only from the server capability', () => {
  const staffingPath = path.resolve(process.cwd(), 'app/(dashboard)/staffing/page.tsx')
  const source = fs.readFileSync(staffingPath, 'utf8')
  assert.match(source, /capabilities\?\.attendance_import === true/)
  assert.match(source, /\{attendanceImportEnabled && <button/)
  assert.match(source, /activeTab === 'attendance' && attendanceImportEnabled/)
})
