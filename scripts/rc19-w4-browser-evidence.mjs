import { isDeepStrictEqual } from 'node:util'

export const BROWSER_CASE_EVIDENCE_ATTACHMENT = 'rc19-w4-case-evidence.json'

/**
 * Read the observation attached to one specific Playwright attempt. A missing,
 * stale, or cross-test attachment is not evidence and is never correlated by
 * title alone.
 */
export function readCaseEvidence(result, expected) {
  const attachment = result?.attachments?.find(item => item.name === BROWSER_CASE_EVIDENCE_ATTACHMENT
    && item.contentType === 'application/json' && typeof item.body === 'string')
  if (!attachment) return null

  let evidence
  try {
    // Playwright's JSON reporter serializes Buffer attachment bodies as base64.
    // Accept raw JSON too for older report fixtures, but prefer the reporter format.
    evidence = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'))
  } catch {
    try { evidence = JSON.parse(attachment.body) } catch { return null }
  }
  if (evidence?.schema !== 'rc19-w4-browser-case-evidence/v1'
    || evidence.test_id !== expected.testId
    || evidence.project_name !== expected.projectName
    || evidence.attempt !== expected.attempt
    || evidence.runtime_marker !== expected.runtimeMarker
    || evidence.application_sha !== expected.applicationSha
    || typeof evidence.case_id !== 'string') return null
  return evidence
}

export function classifyBrowserCase({ uiPassed, skipped, observation, readback, actorMatches }) {
  if (skipped) return 'NOT RUN'
  if (!uiPassed) return 'FAIL'
  if (!observation || !actorMatches || readback?.status !== 'passed'
    || readback.matches_expected !== true
    || !isDeepStrictEqual(readback.fixture_identity, observation.fixture_identity)) {
    return 'BLOCKED'
  }
  return 'PASS'
}
