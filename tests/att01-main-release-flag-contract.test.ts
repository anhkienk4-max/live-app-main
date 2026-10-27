import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

test('ATT-01 handler blocks GET/POST before authentication or database calls when feature is OFF', async () => {
  const { createHistoricalAttendanceHandler } = await import('../lib/server/historicalAttendanceHandler')
  let calls = 0
  const handler = createHistoricalAttendanceHandler({
    isEnabled: () => false,
    client: () => { calls++; throw new Error('DB touched while feature disabled') },
    resolveUser: async () => { calls++; throw new Error('Auth touched while feature disabled') },
  })
  const get = await handler.GET(new Request('http://localhost/api/workforce/attendance-import'))
  const post = await handler.POST(new Request('http://localhost/api/workforce/attendance-import', { method: 'POST' }))
  for (const response of [get, post]) {
    assert.equal(response.status, 404)
    assert.equal((await response.json()).error.code, 'WORKFORCE_FEATURE_DISABLED')
  }
  assert.equal(calls, 0)
})

test('ATT-01 UI and API require independent explicit flags and authorized review role', () => {
  const route = fs.readFileSync('app/api/workforce/attendance-import/route.ts', 'utf8')
  const page = fs.readFileSync('app/(dashboard)/staffing/page.tsx', 'utf8')
  assert.match(route, /process\.env\.FEATURE_ATTENDANCE_IMPORT === 'true'/)
  assert.match(page, /process\.env\.NEXT_PUBLIC_FEATURE_ATTENDANCE_IMPORT === 'true'/)
  assert.match(page, /tabParam === 'attendance' && canReview && attendanceImportEnabled/)
  assert.match(page, /activeTab === 'attendance' && canReview && attendanceImportEnabled/)
})
