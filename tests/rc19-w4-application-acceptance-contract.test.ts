import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const entrypoint = readFileSync(new URL('../scripts/rc19-w4-application-acceptance.mjs', import.meta.url), 'utf8')
const hostedPlaywrightConfig = readFileSync(new URL('../playwright.rc19-w4-hosted-acceptance.config.ts', import.meta.url), 'utf8')
const fixtureManifest = JSON.parse(readFileSync(new URL('../docs/rc19/W4_EXECUTABLE_ACCEPTANCE_FIXTURE_MANIFEST.json', import.meta.url), 'utf8')) as {
  schema: string
  credentials_included: boolean
  runtime_id_policy: string
  attendance_payroll: { status: string }
  current_staffing_fixture: {
    d01_atomic_replacement: { case: string; segments: Array<{ segment_index: number }> }
    pass_swap: { lifecycle_execution_status: string; expiry_status: string }
    operational_note_lifecycle: { execution_status: string }
  }
}

test('application acceptance runs actor-backed Agency, Workforce and receipt cases without upgrading unfinished groups', () => {
  assert.match(entrypoint, /rc19-w4-application-acceptance\/v2/u)
  assert.match(entrypoint, /rc19_workforce_incident_monthly_v2/u)
  assert.match(entrypoint, /shift_swap_operation_v1/u)
  assert.match(entrypoint, /agency-wrong-agency-denial/u)
  assert.match(entrypoint, /Promise\.all\(\[invoke\(\), invoke\(\)\]\)/u)
  assert.match(entrypoint, /E2E_ADMIN_EMAIL: byRole\.admin\.email/u)
  assert.match(entrypoint, /authenticated-browser/u)
  assert.match(hostedPlaywrightConfig, /baseURL: process\.env\.RC19_W4_NEXT_BASE_URL/u)
  assert.doesNotMatch(hostedPlaywrightConfig, /webServer:/u)
  assert.match(entrypoint, /SWAP_IDEMPOTENCY_KEY_REUSED/u)
  assert.match(entrypoint, /SWAP_APPROVAL_DID_NOT_REVALIDATE_CANDIDATE_CONFLICT/u)
  assert.match(entrypoint, /SWAP_INVALIDATION_ROLLBACK_READBACK_MISMATCH/u)
  assert.match(entrypoint, /pass-swap-expiry[\s\S]*status: 'BLOCKED'/u)
  assert.match(entrypoint, /pass-swap-expiry[\s\S]*POLICY_PENDING/u)
  assert.match(entrypoint, /lifecycle: passSwapFixtures/u)
  assert.match(entrypoint, /passSwapSubcaseExpectations\.map/u)
  assert.match(entrypoint, /pass-swap-reciprocal-segment-exchange/u)
  assert.match(entrypoint, /pass-swap-approval-conflict-invalidation/u)
  assert.match(entrypoint, /operational-note-draft-submit-review-revisions/u)
  assert.match(entrypoint, /OPERATIONAL_NOTE_IMMUTABLE_REVISION_READBACK_MISMATCH/u)
  assert.match(entrypoint, /D01'[\s\S]*D11/u)
  assert.match(entrypoint, /const originalD = \[[\s\S]*\['D11'/u)
  assert.match(entrypoint, /const originalL = \[[\s\S]*\['L15'/u)
  assert.match(entrypoint, /\.\.\.originalD,[\s\S]*\.\.\.originalL/u)
  assert.match(entrypoint, /status: 'not_run'/u)
  assert.match(entrypoint, /CASE_LEVEL_AUTH_OR_READBACK_EVIDENCE_INCOMPLETE/u)
  assert.match(entrypoint, /readCaseEvidence\(lastResult/u)
  assert.match(entrypoint, /classifyBrowserCase\(/u)
  assert.doesNotMatch(entrypoint, /BROWSER_EVIDENCE_PATH/u)
  assert.match(entrypoint, /authenticatedBrowserInteractionCount/u)
  assert.match(entrypoint, /fixture_manifest:[\s\S]*runtime_marker: marker/u)
  assert.match(entrypoint, /replace_shift_assignment_with_incident_v1/u)
  assert.match(entrypoint, /D01_SAME_KEY_REPLAY_MISMATCH/u)
  assert.match(entrypoint, /D01_CHANGED_PAYLOAD_NOT_REJECTED/u)
  assert.match(entrypoint, /D01_INCIDENT_RECEIPT_POSTGRES_READBACK_MISMATCH/u)
  assert.match(entrypoint, /D01_NON_ADMIN_EMERGENCY_NOT_DENIED/u)
  assert.match(entrypoint, /RC19_AGENCY_MEMBERSHIP_REQUIRED/u)
  assert.match(entrypoint, /Date\.now\(\) - 48 \* 60 \* 60 \* 1000/u)
  assert.match(entrypoint, /auth_user_id::text=id/u)
  const agencySeed = entrypoint.indexOf('const { agencyIds, membershipRows } = seedSyntheticAgencyFixtures(databaseContainer, marker')
  const firstRegistration = entrypoint.indexOf('manual_assign_shift_staff_to_segment', agencySeed)
  assert.ok(agencySeed >= 0 && firstRegistration > agencySeed,
    'authoritative Agency scope and memberships must exist before registration triggers run')
  assert.match(entrypoint, /UPDATE public\.shifts SET authoritative_agency_id=/u)
  assert.match(entrypoint, /actors\.memberUnassigned\.id, agencyIds\.inScope/u)
  assert.match(entrypoint, /databaseFailureCode\('ASSIGNMENT_FIXTURE_CREATE_FAILED', assigned\.error\)/u)
  assert.match(entrypoint, /if \(result\.error\) stop\(databaseFailureCode\(code, result\.error\)\)/u)
  assert.match(entrypoint, /DO \$rc19_fixture\$ BEGIN PERFORM set_config\('request\.jwt\.claim\.sub', \$\{fixtureAdminId\}, true\)/u)
  assert.match(entrypoint, /request\.jwt\.claims',[\s\S]*'role', 'authenticated'/u)
  assert.match(entrypoint, /VERBOSITY=verbose/u)
  assert.match(entrypoint, /DATABASE_READBACK_FAILED_\$\{sqlState\}_\$\{messageToken \?\? objectName/u)
  assert.match(entrypoint, /error\.message\.match\(\/\^\[A-Z\]\[A-Z0-9_\]\{1,119\}\$\/u\)/u)
  assert.equal(fixtureManifest.schema, 'rc19-w4-synthetic-fixtures/v1')
  assert.equal(fixtureManifest.credentials_included, false)
  assert.match(fixtureManifest.runtime_id_policy, /same runtime marker/u)
  assert.equal(fixtureManifest.attendance_payroll.status, 'NOT RUN')
  assert.equal(fixtureManifest.current_staffing_fixture.pass_swap.lifecycle_execution_status, 'SOURCE_IMPLEMENTED_NOT_EXECUTED')
  assert.match(fixtureManifest.current_staffing_fixture.pass_swap.expiry_status, /BLOCKED/u)
  assert.equal(fixtureManifest.current_staffing_fixture.operational_note_lifecycle.execution_status, 'SOURCE_IMPLEMENTED_NOT_EXECUTED')
  assert.match(fixtureManifest.current_staffing_fixture.d01_atomic_replacement.case, /independent PostgreSQL readback/u)
  assert.deepEqual(fixtureManifest.current_staffing_fixture.d01_atomic_replacement.segments.map(row => row.segment_index), [1, 2, 3])
  assert.match(entrypoint, /authenticated-browser'[\s\S]*status: 'NOT RUN'/u)
  assert.doesNotMatch(entrypoint, /AGENCY_FIXTURE_PROVISIONING_NOT_IMPLEMENTED/u)
  assert.doesNotMatch(entrypoint, /BROWSER_UAT_REQUIRES_SEPARATE_REVIEWED_APP_RUNTIME/u)
})
