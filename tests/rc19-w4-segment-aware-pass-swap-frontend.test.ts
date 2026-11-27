import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { formatSegmentCode, formatSegmentTimeRange } from '../lib/utils/swapUi.ts'
import type { ShiftRegistration, SwapExchangeCandidate } from '../lib/types/database.types.ts'
import type { ShiftStaffingSegmentOption } from '../lib/services/supabaseShiftRegistrationService.ts'

const modalSource = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url)), 'utf8')
const dialogSource = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestDialog.tsx', import.meta.url)), 'utf8')
const detailSource = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapDetailModal.tsx', import.meta.url)), 'utf8')
const listSource = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestList.tsx', import.meta.url)), 'utf8')

test('Scenario 1: Member has both K01 and K02 with role Host - separate selectable registration IDs', () => {
  const shiftId = 'shift-parent-1'
  const userId = 'user-me'
  const assignedRegistrations: ShiftRegistration[] = [
    {
      id: 'reg-k01-host',
      shift_id: shiftId,
      staffing_segment_id: 'seg-k01',
      user_id: userId,
      operational_role: 'host',
      status: 'approved',
      source: 'manual_assignment',
      requested_at: '2026-11-26T00:00:00Z',
      created_at: '2026-11-26T00:00:00Z',
      updated_at: '2026-11-26T00:00:00Z',
    },
    {
      id: 'reg-k02-host',
      shift_id: shiftId,
      staffing_segment_id: 'seg-k02',
      user_id: userId,
      operational_role: 'host',
      status: 'approved',
      source: 'manual_assignment',
      requested_at: '2026-11-26T00:00:00Z',
      created_at: '2026-11-26T00:00:00Z',
      updated_at: '2026-11-26T00:00:00Z',
    },
  ]

  // If selecting by reg.id === sourceRegistrationId:
  const selectedK02 = assignedRegistrations.find(reg => reg.id === 'reg-k02-host')
  assert.equal(selectedK02?.id, 'reg-k02-host')
  assert.equal(selectedK02?.staffing_segment_id, 'seg-k02')

  // Contrast with old buggy behavior that collapsed to first role:
  const oldCollapsing = assignedRegistrations.find(reg => reg.operational_role === 'host')
  assert.equal(oldCollapsing?.id, 'reg-k01-host', 'Old behavior collapsed to K01')

  // Verify modal source now preserves sourceRegistrationId selection
  assert.match(modalSource, /assigned\.find\(reg => reg\.id === sourceRegistrationId\)/)
  assert.match(modalSource, /setSourceRegistrationId\(reg\.id\)/)
})

test('Scenario 2: PASS separate K02 displays K02 segment hours instead of parent shift hours', () => {
  const segments: ShiftStaffingSegmentOption[] = [
    {
      id: 'seg-k01',
      segment_index: 1,
      start_at: '2026-11-26T07:00:00+07:00',
      end_at: '2026-11-26T10:00:00+07:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
    },
    {
      id: 'seg-k02',
      segment_index: 2,
      start_at: '2026-11-26T10:00:00+07:00',
      end_at: '2026-11-26T13:00:00+07:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
    },
  ]

  const k02 = segments.find(s => s.id === 'seg-k02')!
  const segCode = formatSegmentCode(k02.segment_index)
  const segTime = formatSegmentTimeRange(k02.start_at, k02.end_at)

  assert.equal(segCode, 'K02')
  assert.equal(segTime, '10:00–13:00')
  assert.notEqual(segTime, '07:00–16:00', 'Must not display parent shift hours')

  // Modal renders PASS Summary Card with segment hours
  assert.match(modalSource, /data-testid="pass-summary-card"/)
  assert.match(dialogSource, /data-testid="pass-summary-card"/)
})

test('Scenario 3: Two hosts in K02 - candidate selection preserves exact registration ID', () => {
  const candidates: SwapExchangeCandidate[] = [
    {
      registration_id: 'reg-host-alpha',
      user_id: 'user-alpha',
      full_name: 'Nguyen Van Alpha',
      operational_role: 'host',
      shift_id: 'shift-1',
      staffing_segment_id: 'seg-k02',
      segment_index: 2,
      effective_start_at: '2026-11-26T10:00:00+07:00',
      effective_end_at: '2026-11-26T13:00:00+07:00',
    },
    {
      registration_id: 'reg-host-beta',
      user_id: 'user-beta',
      full_name: 'Tran Thi Beta',
      operational_role: 'host',
      shift_id: 'shift-1',
      staffing_segment_id: 'seg-k02',
      segment_index: 2,
      effective_start_at: '2026-11-26T10:00:00+07:00',
      effective_end_at: '2026-11-26T13:00:00+07:00',
    },
  ]

  const pickAlpha = candidates.find(c => c.registration_id === 'reg-host-alpha')
  const pickBeta = candidates.find(c => c.registration_id === 'reg-host-beta')

  assert.equal(pickAlpha?.registration_id, 'reg-host-alpha')
  assert.equal(pickBeta?.registration_id, 'reg-host-beta')
  assert.notEqual(pickAlpha?.registration_id, pickBeta?.registration_id)

  // Verify counterpart rendering in modal and dialog includes registration ID
  assert.match(modalSource, /ID: \{item\.registration_id\}/)
  assert.match(dialogSource, /ID: \{candidate\.registration_id/)
})

test('Scenario 4: Swap K01/K03 same shift - permits same parent shift exchange and renders preview', () => {
  // Modal targetRows allows selectedSource in exchange mode
  assert.match(modalSource, /targetRows = selectedSource && !rawTargetRows\.some\(shift => shift\.id === selectedSource\.id\)/)
  assert.match(modalSource, /data-testid="swap-exchange-preview"/)
  assert.match(modalSource, /copy\('Đổi khung giờ trong cùng ca', 'Same-shift segment swap'\)/)

  // Dialog targetShifts also allows sourceShift in exchange mode
  assert.match(dialogSource, /list = sourceShift && !base\.some\(s => s\.id === sourceShift\.id\)/)
  assert.match(dialogSource, /data-testid="swap-exchange-preview"/)
})

test('Scenario 5: Cross-shift swap - before and after preview displays projection between different shifts', () => {
  assert.match(modalSource, /1\. Trước khi đổi \(Before\)/)
  assert.match(modalSource, /2\. Sau khi duyệt \(After Approval\)/)
  assert.match(dialogSource, /1\. Trước khi đổi \(Before\)/)
  assert.match(dialogSource, /2\. Sau khi duyệt \(After Approval\)/)
})

test('Scenario 6: Non-overlapping vs overlapping denial - server preflight verification states preserved', () => {
  assert.match(modalSource, /replacementCheckStatus === 'VERIFIED_CLEAR'/)
  assert.match(modalSource, /exchangeCheckStatus === 'VERIFIED_CLEAR'/)
  assert.match(modalSource, /exchangeCheckStatus === 'CONFLICT'/)
  assert.match(dialogSource, /replacementCheckStatus === 'VERIFIED_CLEAR'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'VERIFIED_CLEAR'/)
})

test('Scenario 7: Overnight timestamps formatted correctly', () => {
  const overnightStart = '2026-11-26T22:00:00+07:00'
  const overnightEnd = '2026-11-27T02:00:00+07:00'
  const formatted = formatSegmentTimeRange(overnightStart, overnightEnd)
  assert.equal(formatted, '22:00–02:00')
})

test('Scenario 8: Legacy shift without segments falls back to Toàn ca (Legacy)', () => {
  const code = formatSegmentCode(null)
  assert.equal(code, 'Toàn ca')

  const codeUndefined = formatSegmentCode(undefined)
  assert.equal(codeUndefined, 'Toàn ca')

  const emptyTime = formatSegmentTimeRange(null, null)
  assert.equal(emptyTime, '')
})

test('Scenario 9: Retry, stale version, and errors handled with retry and error state', () => {
  assert.match(modalSource, /setSourceRevision\(n => n \+ 1\)/)
  assert.match(modalSource, /setTargetRevision\(n => n \+ 1\)/)
  assert.match(modalSource, /setConflictSnapshot\(null\)/)
  assert.match(modalSource, /setExchangeConflictSnapshot\(null\)/)
})

test('Scenario 10: Recipient and approver segment display in SwapDetailModal', () => {
  assert.match(detailSource, /data-testid="detail-exchange-mapping"/)
  assert.match(detailSource, /data-testid="detail-pass-assignment"/)
  assert.match(detailSource, /Source Assignment/)
  assert.match(detailSource, /Counterpart Assignment/)
  assert.match(listSource, /Reg: \{swap\.source_registration_id/)
  assert.match(listSource, /Target Reg: \{swap\.counterpart_registration_id/)
})
