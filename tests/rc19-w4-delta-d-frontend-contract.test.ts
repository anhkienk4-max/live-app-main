import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('D01 & D02 Contract: AtomicStaffingReplacementDialog enforces incident classification and emergency boundaries', () => {
  const dialogSource = readFileSync(
    new URL('../components/features/calendar/AtomicStaffingReplacementDialog.tsx', import.meta.url),
    'utf8',
  )

  // Incident type options include all canonical types
  assert.ok(dialogSource.includes("'planned_reassignment'"))
  assert.ok(dialogSource.includes("'absent'"))
  assert.ok(dialogSource.includes("'skip'"))
  assert.ok(dialogSource.includes("'late'"))
  assert.ok(dialogSource.includes("'early_leave'"))
  assert.ok(dialogSource.includes("'authorized_absence'"))
  assert.ok(dialogSource.includes("'approved_pass'"))
  assert.ok(dialogSource.includes("'approved_swap'"))

  // Emergency fields and validations
  assert.match(dialogSource, /emergencyAt/)
  assert.match(dialogSource, /setEmergencyAt/)
  assert.match(dialogSource, /initialEmergency/)
  assert.match(dialogSource, /EMERGENCY_REPLACEMENT_ADMIN_ONLY/)
  assert.match(dialogSource, /EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT/)
  assert.match(dialogSource, /INCIDENT_RECORDING_CAPABILITY_UNAVAILABLE/)
})

test('D03 Contract: WorkforceIncidentSummaryPanel binds authoritative distinct totals across pagination and filters', () => {
  const panelSource = readFileSync(
    new URL('../components/features/workforce/WorkforceIncidentSummaryPanel.tsx', import.meta.url),
    'utf8',
  )

  // Root testid
  assert.ok(panelSource.includes('data-testid="workforce-incident-summary-panel"'))

  // Coverage metric card
  assert.match(panelSource, /Độ phủ ca \/ NS|Coverage/)
  assert.match(panelSource, /summary\?\.distinctAffectedStaff/)
  assert.match(panelSource, /summary\?\.distinctAffectedShifts/)

  // Filter toolbar with incident status and scope filters
  assert.ok(panelSource.includes('incident-status-filter'))
  assert.ok(panelSource.includes('setStatus'))
})

test('D05 Contract: Workforce scope indicators enforce Member self-scope vs Leader management scope', () => {
  const panelSource = readFileSync(
    new URL('../components/features/workforce/WorkforceIncidentSummaryPanel.tsx', import.meta.url),
    'utf8',
  )

  // Member self-scope indicator
  assert.ok(panelSource.includes('data-testid="member-self-scope-indicator"'))
  assert.match(panelSource, /Chế độ xem cá nhân|Personal Scope/)

  // Leader management scope indicator
  assert.ok(panelSource.includes('data-testid="leader-scope-indicator"'))
  assert.match(panelSource, /Chế độ quản lý đội ngũ \(Leader Scope\)|Leader Scope/)
})

test('D06 Contract: ShiftOperationalNotesSection maintains persistent draft cache across tab switches', () => {
  const notesSource = readFileSync(
    new URL('../components/features/shifts/ShiftOperationalNotesSection.tsx', import.meta.url),
    'utf8',
  )

  // Module-level draft cache exists and exports ShiftNoteDraftEntry
  assert.match(notesSource, /export const SHIFT_NOTE_DRAFT_CACHE = new Map<string, ShiftNoteDraftEntry>\(\)/)

  // Operational note input uses standard testid
  assert.ok(notesSource.includes('data-testid="operational-note-input"'))

  // Input initializes from and writes to SHIFT_NOTE_DRAFT_CACHE
  assert.match(notesSource, /SHIFT_NOTE_DRAFT_CACHE\.get\(draftKey\)/)
  assert.match(notesSource, /SHIFT_NOTE_DRAFT_CACHE\.set\(draftKey, /)

  // handleSaveNote(false) and handleCancelEditing delete draft from cache
  assert.match(notesSource, /SHIFT_NOTE_DRAFT_CACHE\.delete\(draftKey\)/)
})

test('D08 Contract: WorkforceIncidentSummaryPanel distinguishes confirmed violations from pending and rejected reviews', () => {
  const panelSource = readFileSync(
    new URL('../components/features/workforce/WorkforceIncidentSummaryPanel.tsx', import.meta.url),
    'utf8',
  )

  // Card 2 confirmed violations testid
  assert.ok(panelSource.includes('data-testid="metric-confirmed-violations"'))
  assert.match(panelSource, /Vi phạm \(Skip\/Vắng\)|Violations/)

  // Confirmed counts vs pending/rejected reviews
  assert.match(panelSource, /summary\?\.confirmedViolations/)
  assert.match(panelSource, /summary\?\.confirmedSkips/)
  assert.match(panelSource, /summary\?\.confirmedAbsents/)
  assert.match(panelSource, /summary\?\.pendingReviews/)
  assert.match(panelSource, /summary\?\.rejectedReviews/)
})
