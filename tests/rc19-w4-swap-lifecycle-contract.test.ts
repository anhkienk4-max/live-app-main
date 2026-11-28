import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatSegmentCode, formatSegmentTimeRange } from '../lib/utils/swapUi.ts'
import { formatShiftTimeRange } from '../lib/utils/shiftUtils.ts'

test('SWAP-01 Contract: SwapRequestFormModal binds active registration and segment indicators', () => {
  const formSource = readFileSync(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url), 'utf8')

  // Source shift row data-shift-id selector
  assert.ok(formSource.includes('data-shift-id={shift.id}'))

  // Segment indicator option and summary card testids
  assert.ok(formSource.includes('data-testid={`source-segment-option-${reg.id}`}'))
  assert.ok(formSource.includes('data-testid="pass-summary-card"'))

  // Segment code and time range formatting
  assert.match(formSource, /formatSegmentCode\(seg\?\.segment_index\)/)
  assert.match(formSource, /formatSegmentTimeRange\(seg\?\.start_at, seg\?\.end_at\)/)
})

test('SWAP-02 ICT Timezone: formatShiftTimeRange applies Asia/Ho_Chi_Minh (+07:00) walls', () => {
  // Test overnight shift
  const overnightShift = {
    date: '2026-11-28',
    start_time: '22:00',
    end_time: '02:00',
    timezone: 'Asia/Ho_Chi_Minh',
    crosses_midnight: true,
  }
  const formatted = formatShiftTimeRange(overnightShift as never)
  assert.match(formatted, /22:00 - 02:00/)

  // Segment time formatting from ISO strings
  const segStart = '2026-11-28T15:00:00.000Z' // 22:00 ICT
  const segEnd = '2026-11-28T19:00:00.000Z'   // 02:00 ICT next day
  const segFormatted = formatSegmentTimeRange(segStart, segEnd)
  assert.equal(segFormatted, '22:00–02:00')
  assert.equal(formatSegmentCode(1), 'K01')
  assert.equal(formatSegmentCode(2), 'K02')
})

test('SWAP-03 Conflict Invalidation Contract: candidate changes invalidate conflict states cleanly', () => {
  const formSource = readFileSync(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url), 'utf8')

  // Candidate button data-candidate-id selector
  assert.ok(formSource.includes('data-candidate-id={item.id}'))

  // Conflict status rendering
  assert.match(formSource, /role="alert"/)
  assert.match(formSource, /replacementCheckStatus === 'CONFLICT'/)
  assert.match(formSource, /Lịch trống - đủ điều kiện nhận ca/)

  // Cache key includes owner, sourceId, and replacementId for invalidation
  assert.match(formSource, /const conflictKey = JSON\.stringify\(\[owner, sourceId, replacementId\]\)/)

  // Reset filters clears source and recipient selection
  assert.ok(formSource.includes('clearSource()'))
})

test('SWAP-04 Reciprocal Exchange Contract: before/after preview, counterpart options, and submission', () => {
  const formSource = readFileSync(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url), 'utf8')

  // Target shift data-shift-id
  assert.ok(formSource.includes('data-shift-id={shift.id}'))

  // Counterpart option testid
  assert.ok(formSource.includes('data-testid={`counterpart-option-${item.registration_id}`}'))

  // Before & After preview card
  assert.ok(formSource.includes('data-testid="swap-exchange-preview"'))
  assert.match(formSource, /Trước khi đổi \(Before\)/)
  assert.match(formSource, /Sau khi duyệt \(After Approval\)/)

  // Submit request testid
  assert.ok(formSource.includes('data-testid="submit-swap-request"'))
})
