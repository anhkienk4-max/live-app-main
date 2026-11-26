import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

// Set mock mode for service unit tests
process.env.NODE_ENV = 'development'
process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'

import { shiftNoteService, ShiftNoteServiceError } from '../lib/services/shiftNoteService'
import { shiftIncidentService } from '../lib/services/shiftIncidentService'
import {
  createSupabaseShiftRegistrationRepository,
  RegistrationRequestError,
} from '../lib/services/supabaseShiftRegistrationService'
import type { ShiftOperationalNote } from '../lib/types/database.types'

// Static code contract inspections
const replacementDialog = readFileSync(
  new URL('../components/features/calendar/AtomicStaffingReplacementDialog.tsx', import.meta.url),
  'utf8',
)
const replacementHandler = readFileSync(
  new URL('../lib/server/staffingReplacementHandler.ts', import.meta.url),
  'utf8',
)
const shiftRegService = readFileSync(
  new URL('../lib/services/supabaseShiftRegistrationService.ts', import.meta.url),
  'utf8',
)
const notesSection = readFileSync(
  new URL('../components/features/shifts/ShiftOperationalNotesSection.tsx', import.meta.url),
  'utf8',
)
const staffIncidentPanel = readFileSync(
  new URL('../components/features/staff/StaffIncidentHistoryPanel.tsx', import.meta.url),
  'utf8',
)
const staffList = readFileSync(
  new URL('../components/features/staff/StaffList.tsx', import.meta.url),
  'utf8',
)
const workforceIncidentPanel = readFileSync(
  new URL('../components/features/workforce/WorkforceIncidentSummaryPanel.tsx', import.meta.url),
  'utf8',
)
const workforcePage = readFileSync(
  new URL('../app/(dashboard)/workforce/page.tsx', import.meta.url),
  'utf8',
)
const reportReview = readFileSync(
  new URL('../components/features/reports/ReportOperationalNotesReview.tsx', import.meta.url),
  'utf8',
)
const reportFormModal = readFileSync(
  new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url),
  'utf8',
)
const reportDetailModal = readFileSync(
  new URL('../components/features/reports/ReportDetailModal.tsx', import.meta.url),
  'utf8',
)

// 1. TASK 1 & 2: REPLACEMENT DIALOG, LEGACY C4 COMPATIBILITY & EVIDENCE FAIL-CLOSED
test('Task 1 & 2: AtomicStaffingReplacementDialog includes incident classification, disabled evidence fail-closed, and non-punitive notice', () => {
  assert.match(replacementDialog, /incidentTypeOptions/)
  assert.match(replacementDialog, /data-testid="incident-classification-select"/)
  assert.match(replacementDialog, /data-testid="evidence-reference-input"/)
  assert.match(replacementDialog, /data-testid="evidence-capability-unavailable"/)
  assert.match(replacementDialog, /data-testid="incident-pending-review-notice"/)
  assert.match(replacementDialog, /data-testid="historical-policy-disclaimer"/)
  assert.match(replacementDialog, /evidenceReferenceId:\s*null/)
})

test('Task 1: staffingReplacementHandler preserves strict legacy C4 schema and rejects additive incident fields', () => {
  assert.match(replacementHandler, /const replacementSchema = z\.object\(\{/)
  assert.match(replacementHandler, /\}\)\.strict\(\)/)
  // Strict legacy C4 endpoint must not accept incident fields (handled by Codex's D1 versioned endpoint)
  assert.doesNotMatch(replacementHandler, /incidentType:/)
  assert.doesNotMatch(replacementHandler, /evidenceReferenceId:/)
})

test('Task 1: supabaseShiftRegistrationService isolates legacy C4 call and defines camelCase response fields', () => {
  assert.match(shiftRegService, /incidentType\?: ShiftIncidentType/)
  assert.match(shiftRegService, /evidenceReferenceId\?: string \| null/)
  assert.match(shiftRegService, /canonicalIncident\?: ShiftIncidentV1 \| null/)
  assert.match(shiftRegService, /receiptId\?: string/)
  assert.match(shiftRegService, /readbackRequired\?: boolean/)
  assert.match(shiftRegService, /canonicalIncident:\s*null/)
})

test('Task 1: AtomicStaffingReplacementDialog blocks submission and displays fail-closed banner when incident intent is selected', () => {
  assert.match(replacementDialog, /data-testid="incident-capability-unavailable"/)
  assert.match(replacementDialog, /const hasIncidentIntent = Boolean\(incidentType && incidentType !== 'planned_reassignment'\)/)
  assert.match(replacementDialog, /\(!hasIncidentIntent\)/)
})

test('Task 1: supabaseShiftRegistrationService blocks incident-intent mutation before any network call', async () => {
  const dummyClient = {} as never
  const repo = createSupabaseShiftRegistrationRepository(dummyClient)

  // Incident intent (e.g. skip, absent, late) must fail closed with INCIDENT_RECORDING_CAPABILITY_UNAVAILABLE
  await assert.rejects(
    async () => {
      await repo.replaceAssignment({
        shiftId: 'SFT-001',
        staffingSegmentId: 'seg-001',
        registrationId: 'reg-001',
        replacementUserId: 'USR-STAFF-02',
        role: 'host',
        expectedShiftVersion: 1,
        expectedRegistrationVersion: 1,
        effectiveAt: '2026-09-10T08:00:00.000Z',
        reason: 'Staff was late and skipped',
        emergency: false,
        idempotencyKey: '00000000-0000-0000-0000-000000000001',
        incidentType: 'skip', // Incident intent present
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof RegistrationRequestError)
      assert.equal(err.code, 'INCIDENT_RECORDING_CAPABILITY_UNAVAILABLE')
      return true
    },
  )
})

// 2. TASK 3: SHIFT OPERATIONAL NOTES DRAFT/PUBLISH, CAS & SCHEMA FAIL-CLOSED
test('Task 3: ShiftOperationalNotesSection supports draft save, publish, subject tagging, resume, and fail-closed schema unavailable', () => {
  assert.match(notesSection, /data-testid="save-draft-operational-note-btn"/)
  assert.match(notesSection, /data-testid="submit-operational-note-btn"/)
  assert.match(notesSection, /data-testid="note-affected-user-select"/)
  assert.match(notesSection, /data-testid="notes-history-list"/)
  assert.match(notesSection, /handleResumeDraft/)
  assert.match(notesSection, /NOTE_VERSION_CONFLICT/)
  assert.match(notesSection, /data-testid="shift-notes-schema-unavailable"/)
  assert.match(notesSection, /saveState === 'dirty'/)
  assert.match(notesSection, /saveState === 'saving'/)
})

test('Task 3: shiftNoteService update enforces expected-version CAS conflict check', async () => {
  const seedNote: ShiftOperationalNote = {
    id: 'test-note-cas-01',
    shift_id: 'SFT-TEST',
    business_date: '2026-09-10',
    category: 'incident',
    note: 'Initial draft note content',
    author_id: 'USR-01',
    actual_event_time: '2026-09-10T08:00:00.000Z',
    status: 'draft',
    version: 1,
    created_at: '2026-09-10T08:00:00.000Z',
    updated_at: '2026-09-10T08:00:00.000Z',
  }
  shiftNoteService.resetNotes([seedNote])

  // Successful update with matching version
  const updated = await shiftNoteService.update({
    noteId: 'test-note-cas-01',
    expectedVersion: 1,
    note: 'Updated draft note content v2',
    status: 'draft',
  })
  assert.equal(updated.version, 2)
  assert.equal(updated.note, 'Updated draft note content v2')

  // Stale version update must reject with NOTE_VERSION_CONFLICT
  await assert.rejects(
    async () => {
      await shiftNoteService.update({
        noteId: 'test-note-cas-01',
        expectedVersion: 1, // Stale version (current is 2)
        note: 'Stale update attempt',
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof ShiftNoteServiceError)
      assert.equal(err.code, 'NOTE_VERSION_CONFLICT')
      return true
    },
  )
})

// 3. TASK 5 & EMPLOYEE HISTORY: STAFF INCIDENT HISTORY PANEL & LIST INTEGRATION
test('Task 5: StaffIncidentHistoryPanel enforces member self-only scope guard and displays classifications', () => {
  assert.match(staffIncidentPanel, /data-testid="staff-incident-scope-denied"/)
  assert.match(staffIncidentPanel, /data-testid="staff-incident-history-panel"/)
  assert.match(staffIncidentPanel, /data-testid="staff-incident-schema-unavailable"/)
  assert.match(staffIncidentPanel, /INCIDENT_TYPE_CONFIG/)
  assert.match(staffIncidentPanel, /REVIEW_STATE_CONFIG/)
  assert.match(staffIncidentPanel, /Nguyên tắc vận hành không trừng phạt|Lưu ý: Dữ liệu sự cố/)
})

test('Task 5: StaffIncidentHistoryPanel is mounted in StaffDetail in StaffList.tsx', () => {
  assert.match(staffList, /import \{ StaffIncidentHistoryPanel \} from '\.\/StaffIncidentHistoryPanel'/)
  assert.match(staffList, /<StaffIncidentHistoryPanel targetUserId=\{user\.id\}/)
})

test('Task 5: shiftIncidentService filters incidents for staff correctly', async () => {
  const incidents = await shiftIncidentService.getIncidentsForStaff('USR-STAFF-01')
  assert.ok(incidents.length >= 2)
  assert.ok(incidents.every(i => i.originalStaffId === 'USR-STAFF-01' || i.replacementStaffId === 'USR-STAFF-01'))
})

// 4. TASK 5: WORKFORCE INCIDENT SUMMARY PANEL & 8 FILTERS
test('Task 5: WorkforceIncidentSummaryPanel displays all 8 filters, scope indicators, and aggregates', () => {
  assert.match(workforceIncidentPanel, /data-testid="workforce-incident-summary-panel"/)
  assert.match(workforceIncidentPanel, /data-testid="incident-summary-month-input"/)
  assert.match(workforceIncidentPanel, /data-testid="incident-employee-filter"/)
  assert.match(workforceIncidentPanel, /data-testid="incident-role-filter"/)
  assert.match(workforceIncidentPanel, /data-testid="incident-brand-filter"/)
  assert.match(workforceIncidentPanel, /data-testid="incident-agency-filter"/)
  assert.match(workforceIncidentPanel, /data-testid="incident-platform-filter"/)
  assert.match(workforceIncidentPanel, /data-testid="incident-type-filter"/)
  assert.match(workforceIncidentPanel, /data-testid="incident-status-filter"/)
  assert.match(workforceIncidentPanel, /data-testid="member-self-scope-indicator"/)
  assert.match(workforceIncidentPanel, /data-testid="leader-scope-indicator"/)
  assert.match(workforceIncidentPanel, /data-testid="workforce-incident-schema-unavailable"/)
  assert.match(workforceIncidentPanel, /Non-punitive operational metric policy|Nguyên tắc vận hành không trừng phạt/)
})

test('Task 5: WorkforceIncidentSummaryPanel is mounted as incidents tab in workforce page', () => {
  assert.match(workforcePage, /import \{ WorkforceIncidentSummaryPanel \} from '@\/components\/features\/workforce\/WorkforceIncidentSummaryPanel'/)
  assert.match(workforcePage, /data-testid="workforce-incidents-tab"/)
  assert.match(workforcePage, /<TabsContent value="incidents"/)
  assert.match(workforcePage, /<WorkforceIncidentSummaryPanel/)
})

test('Task 5: shiftIncidentService computes workforce aggregates with verified late minutes and categories', async () => {
  const summary = await shiftIncidentService.getWorkforceSummary({ month: '2026-09' })
  assert.ok(summary.totalIncidents >= 3)
  assert.ok(summary.confirmedLates >= 1)
  assert.ok(summary.totalVerifiedLateMinutes >= 15)
  assert.ok(summary.distinctAffectedShifts >= 2)
  assert.ok(summary.distinctAffectedStaff >= 2)
  assert.ok(summary.staffSummaries.length >= 2)
  assert.equal(summary.confirmedViolations, summary.confirmedSkips + summary.confirmedAbsents)
  assert.equal(summary.confirmedPunctuality, summary.confirmedLates + summary.confirmedEarlyLeaves)
  assert.equal(summary.approvedChanges, summary.approvedPasses + summary.approvedSwaps + summary.plannedReassignments)
})

// 5. TASK 4: REPORT OPERATIONAL NOTES REVIEW & AUDIENCE SANITIZATION
test('Task 4: ReportOperationalNotesReview provides internal vs external-safe view toggle, backend-pending notice, and snapshot immutability', () => {
  assert.match(reportReview, /data-testid="report-operational-notes-review"/)
  assert.match(reportReview, /data-testid="preview-audience-internal-btn"/)
  assert.match(reportReview, /data-testid="preview-audience-external-btn"/)
  assert.match(reportReview, /data-testid="external-safe-backend-pending"/)
  assert.match(reportReview, /data-testid="report-snapshot-unavailable"/)
  assert.match(reportReview, /data-testid="report-notes-schema-unavailable"/)
  assert.match(reportReview, /Bảo toàn tính bất biến của Snapshot báo cáo|Snapshot Immutability/)
})

test('Task 4: ReportOperationalNotesReview is mounted in ReportFormModal and ReportDetailModal', () => {
  assert.match(reportFormModal, /ReportOperationalNotesReview/)
  assert.match(reportFormModal, /<ReportOperationalNotesReview shiftId=\{selectedShift\.id\}/)
  assert.match(reportDetailModal, /ReportOperationalNotesReview/)
  assert.match(reportDetailModal, /<ReportOperationalNotesReview shiftId=\{shift\?\.id \|\| report\.shift_id\}/)
})
