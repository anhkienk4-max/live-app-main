import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyBrowserCase, readCaseEvidence, readCaseEvidenceAttempts, BROWSER_CASE_EVIDENCE_ATTACHMENT } from '../scripts/rc19-w4-browser-evidence.mjs'

const identity = {
  testId: 'spec-42', projectName: 'hosted-chromium', attempt: 0,
  runtimeMarker: 'disposable-pg17-abc', applicationSha: 'a'.repeat(40),
}

function resultFor(attempt, worker, caseId, fixtureIdentity) {
  const evidence = {
    schema: 'rc19-w4-browser-case-evidence/v1', test_id: identity.testId,
    project_name: identity.projectName, attempt, runtime_marker: identity.runtimeMarker,
    application_sha: identity.applicationSha, case_id: caseId, fixture_identity: fixtureIdentity,
    authenticated: true, auth_user_id: 'actor-1', business_user_id: 'actor-1', role: 'member',
    successful_ui_actions: 1, expected_routes: ['/calendar'], actual_routes: ['/calendar'],
    responses: [], status: 'passed', worker_marker: worker,
  }
  return { status: 'passed', retry: attempt, attachments: [{
    name: BROWSER_CASE_EVIDENCE_ATTACHMENT, contentType: 'application/json',
    // Playwright's JSON reporter serializes Buffer attachment bodies as base64.
    body: Buffer.from(JSON.stringify(evidence)).toString('base64'),
  }] }
}

test('observations survive worker restart and are correlated to the exact test attempt', () => {
  const firstWorker = resultFor(0, 'worker-1', 'BROWSER-AUTH-01', { auth_user_id: 'actor-1' })
  const restartedWorker = resultFor(1, 'worker-2', 'BROWSER-AUTH-01', { auth_user_id: 'actor-1' })
  const first = readCaseEvidence(firstWorker, { ...identity, attempt: 0 })
  const retry = readCaseEvidence(restartedWorker, { ...identity, attempt: 1 })
  const attempts = readCaseEvidenceAttempts({ results: [firstWorker, restartedWorker] }, identity)

  assert.equal(first.worker_marker, 'worker-1')
  assert.equal(retry.worker_marker, 'worker-2')
  assert.deepEqual(attempts.map(item => [item.attempt, item.observation?.worker_marker]), [
    [0, 'worker-1'], [1, 'worker-2'],
  ])
  assert.equal(first.case_id, 'BROWSER-AUTH-01')
  assert.equal(classifyBrowserCase({ uiPassed: true, skipped: false, observation: first,
    actorMatches: true, readback: { status: 'passed', matches_expected: true,
      fixture_identity: { auth_user_id: 'actor-1' } } }), 'PASS')
  assert.equal(readCaseEvidence(firstWorker, { ...identity, testId: 'another-test' }), null)
  assert.equal(readCaseEvidence(firstWorker, { ...identity, runtimeMarker: 'other-runtime' }), null)
})

test('a worker restart preserves a completed attempt while exposing a missing retry observation', () => {
  const completed = resultFor(0, 'worker-1', 'BROWSER-AUTH-01', { auth_user_id: 'actor-1' })
  const restarted = { status: 'failed', retry: 1, attachments: [] }
  const attempts = readCaseEvidenceAttempts({ results: [completed, restarted] }, identity)

  assert.deepEqual(attempts.map(item => ({
    attempt: item.attempt,
    result_status: item.result_status,
    observation_present: item.observation !== null,
    worker_marker: item.observation?.worker_marker ?? null,
  })), [
    { attempt: 0, result_status: 'passed', observation_present: true, worker_marker: 'worker-1' },
    { attempt: 1, result_status: 'failed', observation_present: false, worker_marker: null },
  ])
})

test('a UI pass without matching independent fixture readback stays blocked', () => {
  const observation = readCaseEvidence(resultFor(0, 'worker-1', 'CALENDAR-DETAIL-01', { shift_id: 'shift-A' }), identity)
  assert.equal(classifyBrowserCase({ uiPassed: true, skipped: false, observation, actorMatches: true,
    readback: { status: 'passed', matches_expected: true, fixture_identity: { shift_id: 'shift-B' } } }), 'BLOCKED')
  assert.equal(classifyBrowserCase({ uiPassed: false, skipped: false, observation, actorMatches: true,
    readback: null }), 'FAIL')
})
