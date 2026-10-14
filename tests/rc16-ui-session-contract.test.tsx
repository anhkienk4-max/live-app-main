import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { workforceService, WorkforceServiceError, workforceErrorMessage } from '@/lib/services/workforceService'
import { AuthIdentityProvider } from '@/lib/auth/AuthIdentityProvider'
import PayrollPage from '@/app/(dashboard)/payroll/page'
import WorkforcePage from '@/app/(dashboard)/workforce/page'
import { mockUsers } from '@/lib/services/mockData'
import { LanguageProvider } from '@/lib/i18n'

for (const Page of [PayrollPage, WorkforcePage]) {
  for (const [language, loadingLabel] of [['vi', 'Đang xác minh'], ['en', 'Verifying session']] as const) {
    test(Page.name + ' waits for capabilities before mounting protected workspace in ' + language, () => {
      const markup = renderToStaticMarkup(
        <LanguageProvider defaultLanguage={language}>
          <AuthIdentityProvider mode="supabase" identity={null} businessUser={mockUsers[0]}>
            <Page />
          </AuthIdentityProvider>
        </LanguageProvider>,
      )
      assert.match(markup, /role="status"/)
      assert.ok(markup.includes(loadingLabel))
      assert.doesNotMatch(markup, /AUTHENTICATION_REQUIRED|Khung lương|Dòng lương chi tiết/)
    })
  }
}

test('client requests authenticated no-store capabilities and preserves cancellation', async () => {
  const original = globalThis.fetch
  const controller = new AbortController()
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/workforce/capabilities')
    assert.equal(init?.cache, 'no-store')
    assert.equal(init?.credentials, 'same-origin')
    assert.equal(init?.signal, controller.signal)
    return Response.json({ ok: true, capabilities: { payroll: false, actual_staffing: false, team_performance: false, own_performance: false } })
  }
  try { assert.equal((await workforceService.getCapabilities(controller.signal)).capabilities.payroll, false) }
  finally { globalThis.fetch = original }
})

test('client retains backend 400, 401, 403, 409 and 503 without collapsing error codes', async () => {
  const original = globalThis.fetch
  try {
    for (const status of [400, 401, 403, 409, 503]) {
      globalThis.fetch = async () => Response.json({ ok: false, error: { code: 'EXACT_BACKEND_CODE' } }, { status })
      await assert.rejects(workforceService.getActualSegments('shift-1'), error =>
        error instanceof WorkforceServiceError && error.status === status && error.code === 'EXACT_BACKEND_CODE')
    }
    assert.notEqual(workforceErrorMessage(new WorkforceServiceError('AUTHENTICATION_REQUIRED', 401)), workforceErrorMessage(new WorkforceServiceError('FORBIDDEN', 403)))
    assert.notEqual(workforceErrorMessage(new WorkforceServiceError('WORKFORCE_FEATURE_DISABLED', 503)), workforceErrorMessage(new WorkforceServiceError('WORKFORCE_UNAVAILABLE', 503)))
  } finally { globalThis.fetch = original }
})

test('actual no-show and review client preserve null evidence times and expected version', async () => {
  const original = globalThis.fetch
  const bodies: Record<string, unknown>[] = []
  globalThis.fetch = async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return Response.json({ ok: true, segment: { id: 'segment-1' } }) }
  try {
    await workforceService.recordActualSegment({ shiftId: 'shift-1', staffId: 'staff-1', operationalRole: 'host', eventKind: 'no_show', coverageKind: 'planned', actualStartAt: null, actualEndAt: null, evidenceNote: 'Verified absence evidence' })
    await workforceService.reviewActualSegment({ segmentId: 'segment-1', expectedVersion: 7, decision: 'approved', reviewNote: 'Independent reviewer verified' })
    assert.deepEqual(bodies[0], { action: 'record', shift_id: 'shift-1', staff_id: 'staff-1', operational_role: 'host', event_kind: 'no_show', coverage_kind: 'planned', actual_start_at: null, actual_end_at: null, evidence_note: 'Verified absence evidence' })
    assert.equal(bodies[1].expected_version, 7)
    assert.equal(bodies[1].segment_id, 'segment-1')
  } finally { globalThis.fetch = original }
})
