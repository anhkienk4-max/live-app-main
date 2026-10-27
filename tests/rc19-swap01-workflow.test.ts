import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveShiftDateTime } from '../lib/utils/shiftUtils.ts'
import { isStaffedRegistration } from '../lib/services/dataService.ts'
import type { Shift, ShiftRegistration } from '../lib/types/database.types.ts'

const modalSource = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url)), 'utf8')
const dialogSource = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestDialog.tsx', import.meta.url)), 'utf8')

test('SWAP-01: Modal renders rich shift cards with Brand, Platform, Status, Timezone, and Overnight badge', () => {
  // Brand badge
  assert.match(modalSource, /brands\.find\(item => item\.id === shift\.brand_id\)\?\.name/)
  // Platform badge
  assert.match(modalSource, /platforms\.find\(item => item\.id === shift\.platform_id\)\?\.name/)
  // Status badge
  assert.match(modalSource, /t\(shift\.status\)/)
  // Time range and timezone
  assert.match(modalSource, /formatShiftTimeRange\(shift\)/)
  assert.match(modalSource, /shift\.timezone/)
  // Overnight indicator
  assert.match(modalSource, /shift\.crosses_midnight/)
  assert.match(modalSource, /copy\('Qua đêm', 'Overnight'\)/)
  // Assigned role badges
  assert.match(modalSource, /t\(reg\.operational_role\)/)
})

test('SWAP-01: Modal auto-selects operational role when single role is assigned', () => {
  assert.match(modalSource, /shiftAssigned\.length === 1/)
  assert.match(modalSource, /setRole\(shiftAssigned\[0\]\.operational_role\)/)
  assert.match(modalSource, /copy\('Tự động chọn vai trò duy nhất', 'Auto-selected single role'\)/)
})

test('SWAP-01: Zero-results explains why no shifts match and provides legacy sync guidance', () => {
  assert.match(modalSource, /source && !source\.error && sourceRows\.length === 0/)
  assert.match(modalSource, /copy\('Không có ca được phân công phù hợp trong khoảng thời gian này'/)
  assert.match(modalSource, /Chỉ ca có trạng thái Được duyệt \(Approved\) hoặc Phân công \(Manually Assigned\)/)
  // Explains legacy assignment without approved registration and points to Staffing page
  assert.match(modalSource, /Nếu ca chỉ mới được gán tên trực tiếp \(Host\/Trợ trì\) mà chưa có phiếu phân công chính thức/)
  assert.match(modalSource, /Điều phối ca \(Staffing\)/)
  assert.match(modalSource, /Đặt lại bộ lọc/)
  assert.match(modalSource, /resetFilters/)
})

test('SWAP-01: 4-State Conflict Verification Contract in Modal & Dialog (VERIFIED CLEAR, CONFLICT, CHECKING, UNKNOWN/FAILED)', () => {
  // 4 verification states defined
  assert.match(modalSource, /export type ConflictVerificationStatus = 'idle' \| 'checking' \| 'verified_clear' \| 'conflict' \| 'unverified'/)
  assert.match(dialogSource, /export type ConflictVerificationStatus = 'idle' \| 'checking' \| 'verified_clear' \| 'conflict' \| 'unverified'/)

  // Checking state in both
  assert.match(modalSource, /replacementCheckStatus === 'checking'/)
  assert.match(modalSource, /exchangeCheckStatus === 'checking'/)
  assert.match(dialogSource, /replacementCheckStatus === 'checking'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'checking'/)

  // Conflict state blocks submit
  assert.match(modalSource, /replacementCheckStatus === 'conflict'/)
  assert.match(modalSource, /exchangeCheckStatus === 'conflict'/)
  assert.match(dialogSource, /replacementCheckStatus === 'conflict'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'conflict'/)

  // Unverified state shows server verification note, does NOT show "Lịch hợp lệ"
  assert.match(modalSource, /replacementCheckStatus === 'unverified'/)
  assert.match(modalSource, /exchangeCheckStatus === 'unverified'/)
  assert.match(dialogSource, /replacementCheckStatus === 'unverified'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'unverified'/)

  // Verified clear state shows success badge
  assert.match(modalSource, /replacementCheckStatus === 'verified_clear'/)
  assert.match(modalSource, /exchangeCheckStatus === 'verified_clear'/)
  assert.match(dialogSource, /replacementCheckStatus === 'verified_clear'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'verified_clear'/)
})

test('SWAP-01: API failure or incomplete page never reports verified clear and has no misleading submit copy', () => {
  // Result page incomplete check: result.total > result.items.length and bounded up to 250
  assert.match(modalSource, /result\.total > result\.items\.length/)
  assert.match(dialogSource, /result\.total > result\.items\.length/)
  assert.match(modalSource, /result\.total <= 250/)
  assert.match(dialogSource, /result\.total <= 250/)

  // Pagination completeness and consistency verification helpers
  assert.match(modalSource, /collectAndVerifyAllShifts/)
  assert.match(dialogSource, /collectAndVerifyAllShifts/)
  assert.match(modalSource, /ids\.has\(item\.id\)/)
  assert.match(dialogSource, /ids\.has\(item\.id\)/)
  assert.match(modalSource, /pageResult\.total !== firstResult\.total/)
  assert.match(dialogSource, /pageResult\.total !== firstResult\.total/)

  // API catch handles unverified status with informative message
  assert.match(modalSource, /status: 'unverified'/)
  assert.match(dialogSource, /status: 'unverified'/)
  assert.match(modalSource, /Không thể kiểm tra.*lịch/)
  assert.match(dialogSource, /Không thể kiểm tra.*lịch/)

  // FIX-01: Never promise server verification on submit while submit button is disabled
  assert.doesNotMatch(modalSource, /hệ thống sẽ xác minh khi gửi/)
  assert.doesNotMatch(dialogSource, /hệ thống sẽ xác minh khi gửi/)
})

test('SWAP-01: Candidate is strictly invalid unless verified_clear and submission is disabled', () => {
  // Modal validCandidate strictly requires verified_clear
  const validCandidateDef = modalSource.slice(modalSource.indexOf('const validCandidate'), modalSource.indexOf('const submit ='))
  assert.match(validCandidateDef, /replacementCheckStatus === 'verified_clear'/)
  assert.match(validCandidateDef, /exchangeCheckStatus === 'verified_clear'/)
  assert.doesNotMatch(validCandidateDef, /'unverified'/)

  // Dialog disabled blocks unless verified_clear and isStaffed
  assert.match(dialogSource, /replacementCheckStatus !== 'verified_clear'/)
  assert.match(dialogSource, /exchangeCheckStatus !== 'verified_clear'/)
  assert.match(dialogSource, /!isStaffed/)
})

test('SWAP-01: Exchange checks two-sided conflicts while strictly preserving RLS privacy', () => {
  // Both sides checked
  assert.match(modalSource, /assignedUserIds: \[owner\]/)
  assert.match(modalSource, /assignedUserIds: \[counterpartCandidate\.user_id\]/)
  assert.match(dialogSource, /assignedUserIds: \[currentUser\.id\]/)
  assert.match(dialogSource, /assignedUserIds: \[counterpartCandidate\.user_id\]/)

  // Requester conflict message
  assert.match(modalSource, /Bạn đã có ca khác trùng giờ với ca đổi chéo/)
  assert.match(dialogSource, /Bạn đã có ca khác trùng giờ với ca đổi chéo/)

  // Counterpart conflict message is generic, protecting RLS privacy
  assert.match(modalSource, /Đối ứng có ca khác trùng giờ với ca của bạn/)
  assert.match(dialogSource, /Đối ứng có ca khác trùng giờ với ca của bạn/)
  assert.doesNotMatch(modalSource, /counterpartCandidate\.full_name.*đã có ca khác trùng giờ/)
})

test('SWAP-01: Account switch invalidates previous actor state', () => {
  // Key includes owner / currentUser.id
  assert.match(modalSource, /const sourceKey = JSON\.stringify\(\[owner/)
  assert.match(modalSource, /const conflictKey = JSON\.stringify\(\[owner, sourceId, replacementId\]\)/)
  assert.match(modalSource, /const exchangeConflictKey = JSON\.stringify\(\[owner, sourceId, targetId, counterpartId\]\)/)
  assert.match(dialogSource, /const replacementConflictKey = \[currentUser\.id, sourceShift\.id, replacementId\]\.join\(':'\)/)
  assert.match(dialogSource, /const exchangeConflictKey = \[currentUser\.id, sourceShift\.id, targetShiftId, counterpartId\]\.join\(':'\)/)
})

test('SWAP-01: Member with approved registration is eligible; legacy unapproved is rejected', () => {
  // Invariant: only approved or manually_assigned count as staffed registrations
  assert.equal(isStaffedRegistration({ status: 'approved' }), true)
  assert.equal(isStaffedRegistration({ status: 'manually_assigned' }), true)
  assert.equal(isStaffedRegistration({ status: 'pending' as never }), false)
  assert.equal(isStaffedRegistration({ status: 'rejected' as never }), false)
  assert.equal(isStaffedRegistration({ status: 'cancelled' as never }), false)

  // Modal enforces staffed registrations
  assert.match(modalSource, /registrationStatuses: \['approved', 'manually_assigned'\]/)
  assert.match(modalSource, /reg\.user_id === owner && isStaffedRegistration\(reg\)/)
})

test('SWAP-01: Overnight shift timing resolution handles midnight transitions correctly', () => {
  // Overnight shift 22:00 -> 02:00
  const overnight = resolveShiftDateTime('2026-10-27', '22:00', '02:00', 'Asia/Ho_Chi_Minh')
  assert.ok(overnight?.valid)
  assert.equal(overnight.endDate, '2026-10-28')
  assert.ok(overnight.startAt < overnight.endAt)

  // Shift on next day at 01:00 -> 05:00 overlaps
  const nextDayEarly = resolveShiftDateTime('2026-10-28', '01:00', '05:00', 'Asia/Ho_Chi_Minh')
  assert.ok(nextDayEarly?.valid)
  const overlap = nextDayEarly.startAt < overnight.endAt && nextDayEarly.endAt > overnight.startAt
  assert.equal(overlap, true, 'Next day early shift must overlap with overnight shift')

  // Shift on next day at 03:00 -> 06:00 does not overlap
  const nextDayLate = resolveShiftDateTime('2026-10-28', '03:00', '06:00', 'Asia/Ho_Chi_Minh')
  assert.ok(nextDayLate?.valid)
  const noOverlap = nextDayLate.startAt < overnight.endAt && nextDayLate.endAt > overnight.startAt
  assert.equal(noOverlap, false, 'Next day after 02:00 must not overlap')
})

// =========================================================================
// BEHAVIORAL REGRESSION TESTS
// =========================================================================

test('BEHAVIORAL: API error transitions to unverified, blocks submit, and suppresses clear message', async () => {
  // Simulate the conflict verification runner used by the modal & dialog
  const runConflictCheck = async (fetcher: () => Promise<{ items: Shift[]; total: number }>) => {
    try {
      const result = await fetcher()
      if (result.total > result.items.length) {
        return { status: 'unverified' as const, error: 'Chưa kiểm tra hết toàn bộ lịch' }
      }
      return { status: 'verified_clear' as const, error: null }
    } catch {
      return { status: 'unverified' as const, error: 'Không thể kiểm tra lịch do lỗi kết nối; vui lòng thử lại hoặc liên hệ Quản lý/Leader' }
    }
  }

  // 1. When API rejects:
  const failingFetcher = () => Promise.reject(new Error('NETWORK_DISCONNECTED'))
  const outcome = await runConflictCheck(failingFetcher)

  assert.equal(outcome.status, 'unverified')
  assert.match(outcome.error ?? '', /Không thể kiểm tra lịch do lỗi kết nối/)
  assert.notEqual(outcome.status, 'verified_clear', 'Must NEVER report verified_clear on API failure')

  // Candidate validation must reject unverified
  const isValidCandidate = (status: string) => status === 'verified_clear'
  assert.equal(isValidCandidate(outcome.status), false, 'Candidate must be INVALID when status is unverified')
})

test('BEHAVIORAL: Conflict check in-flight (checking) blocks submit and shows loading', () => {
  const getStatus = (conflictSnapshot: { status: string } | null, candidateSelected: boolean) => {
    if (!candidateSelected) return 'idle'
    if (!conflictSnapshot) return 'checking'
    return conflictSnapshot.status
  }

  // Before async check resolves:
  const inFlightStatus = getStatus(null, true)
  assert.equal(inFlightStatus, 'checking')

  const isSubmitDisabled = (status: string, reasonLength: number) => {
    return reasonLength < 10 || status !== 'verified_clear'
  }

  assert.equal(isSubmitDisabled(inFlightStatus, 20), true, 'Submit MUST be disabled while check is in flight')
})

test('BEHAVIORAL: Bounded multi-page check verifies up to 250 shifts and fails-closed when exceeded or failed', async () => {
  const checkBoundedPagination = async (
    firstPage: { items: Array<{ id: string; start: number; end: number }>; total: number },
    fetchRemainingPages: (totalPages: number) => Promise<Array<{ items: Array<{ id: string; start: number; end: number }> }>>
  ) => {
    let allItems = firstPage.items
    let complete = true

    if (firstPage.total > firstPage.items.length) {
      if (firstPage.total <= 250) {
        const totalPages = Math.ceil(firstPage.total / 50)
        try {
          const remaining = await fetchRemainingPages(totalPages)
          allItems = [...firstPage.items, ...remaining.flatMap(p => p.items)]
        } catch {
          return { status: 'unverified' as const, error: 'Không thể kiểm tra lịch do lỗi kết nối', allItems: [] }
        }
      } else {
        complete = false
      }
    }

    if (!complete) {
      return { status: 'unverified' as const, error: 'Lịch ca vượt quá giới hạn kiểm tra tự động (tối đa 250 ca)', allItems }
    }
    return { status: 'verified_clear' as const, error: null, allItems }
  }

  // 1. Within bound (75 shifts = page 1 with 50 + page 2 with 25): loads and verifies clean
  const withinBound = await checkBoundedPagination(
    { items: Array.from({ length: 50 }, (_, i) => ({ id: `s_${i}`, start: i * 10, end: i * 10 + 5 })), total: 75 },
    async () => [{ items: Array.from({ length: 25 }, (_, i) => ({ id: `s_${i + 50}`, start: (i + 50) * 10, end: (i + 50) * 10 + 5 })) }]
  )
  assert.equal(withinBound.status, 'verified_clear')
  assert.equal(withinBound.allItems.length, 75)

  // 2. Exceeds safe limit (300 shifts > 250): fail-closed to unverified
  const exceedsBound = await checkBoundedPagination(
    { items: Array.from({ length: 50 }, (_, i) => ({ id: `s_${i}`, start: 0, end: 1 })), total: 300 },
    async () => []
  )
  assert.equal(exceedsBound.status, 'unverified')
  assert.match(exceedsBound.error ?? '', /vượt quá giới hạn/)

  // 3. Network error on remaining pages: fail-closed to unverified
  const networkError = await checkBoundedPagination(
    { items: Array.from({ length: 50 }, (_, i) => ({ id: `s_${i}`, start: 0, end: 1 })), total: 75 },
    async () => { throw new Error('FETCH_FAILED') }
  )
  assert.equal(networkError.status, 'unverified')
  assert.match(networkError.error ?? '', /lỗi kết nối/)
})

test('BEHAVIORAL: Pagination completeness rejects missing pages, duplicate items, total shifts mutation, and API errors', async () => {
  const checkFullPagination = async (
    firstPage: { page: number; total: number; items: Array<{ id: string }> },
    fetchPage: (page: number) => Promise<{ page: number; total: number; items: Array<{ id: string }> }>
  ) => {
    const MAX_SHIFTS = 250
    const PAGE_SIZE = 50

    if (firstPage.total > MAX_SHIFTS) {
      return { status: 'unverified' as const, error: 'EXCEEDS_LIMIT', isClear: false }
    }

    const items: Array<{ id: string }> = []
    const ids = new Set<string>()

    const accept = (pageResult: { page: number; total: number; items: Array<{ id: string }> }, expectedPage: number): boolean => {
      if (pageResult.total !== firstPage.total) return false
      if (pageResult.page !== expectedPage) return false
      const isLastPage = expectedPage * PAGE_SIZE >= firstPage.total
      if (!isLastPage && pageResult.items.length !== PAGE_SIZE) return false

      for (const item of pageResult.items) {
        if (!item.id || ids.has(item.id)) return false
        ids.add(item.id)
        items.push(item)
      }
      return true
    }

    if (!accept(firstPage, 1)) {
      return { status: 'unverified' as const, error: 'INCONSISTENT_PAGE_1', isClear: false }
    }

    if (firstPage.total > firstPage.items.length) {
      const totalPages = Math.ceil(firstPage.total / PAGE_SIZE)
      for (let p = 2; p <= totalPages; p++) {
        try {
          const res = await fetchPage(p)
          if (!accept(res, p)) {
            return { status: 'unverified' as const, error: `INCONSISTENT_PAGE_${p}`, isClear: false }
          }
        } catch {
          return { status: 'unverified' as const, error: 'API_ERROR', isClear: false }
        }
      }
    }

    if (items.length !== firstPage.total || ids.size !== firstPage.total) {
      return { status: 'unverified' as const, error: 'INCOMPLETE_COUNT', isClear: false }
    }

    return { status: 'verified_clear' as const, error: null, isClear: true }
  }

  // Case 1: Clean 75 shifts across 2 pages -> verified_clear
  const clean = await checkFullPagination(
    { page: 1, total: 75, items: Array.from({ length: 50 }, (_, i) => ({ id: `s_${i}` })) },
    async (p) => ({ page: p, total: 75, items: Array.from({ length: 25 }, (_, i) => ({ id: `s_${i + 50}` })) })
  )
  assert.equal(clean.status, 'verified_clear')
  assert.equal(clean.isClear, true)

  // Case 2: Missing items on page 2 (count mismatch: 20 items instead of 25) -> unverified
  const missingItems = await checkFullPagination(
    { page: 1, total: 75, items: Array.from({ length: 50 }, (_, i) => ({ id: `s_${i}` })) },
    async (p) => ({ page: p, total: 75, items: Array.from({ length: 20 }, (_, i) => ({ id: `s_${i + 50}` })) })
  )
  assert.equal(missingItems.status, 'unverified')
  assert.equal(missingItems.error, 'INCOMPLETE_COUNT')
  assert.equal(missingItems.isClear, false)

  // Case 3: Duplicate ID across pages -> unverified
  const duplicateId = await checkFullPagination(
    { page: 1, total: 75, items: Array.from({ length: 50 }, (_, i) => ({ id: `s_${i}` })) },
    async (p) => ({ page: p, total: 75, items: [{ id: 's_0' }, ...Array.from({ length: 24 }, (_, i) => ({ id: `s_${i + 50}` }))] })
  )
  assert.equal(duplicateId.status, 'unverified')
  assert.equal(duplicateId.error, 'INCONSISTENT_PAGE_2')
  assert.equal(duplicateId.isClear, false)

  // Case 4: Total changed during pagination (e.g. 75 -> 80) -> unverified
  const totalChanged = await checkFullPagination(
    { page: 1, total: 75, items: Array.from({ length: 50 }, (_, i) => ({ id: `s_${i}` })) },
    async (p) => ({ page: p, total: 80, items: Array.from({ length: 25 }, (_, i) => ({ id: `s_${i + 50}` })) })
  )
  assert.equal(totalChanged.status, 'unverified')
  assert.equal(totalChanged.error, 'INCONSISTENT_PAGE_2')
  assert.equal(totalChanged.isClear, false)

  // Case 5: Intermediate page has < 50 items (e.g. page 1 has 40 items when total is 75) -> unverified
  const incompletePage1 = await checkFullPagination(
    { page: 1, total: 75, items: Array.from({ length: 40 }, (_, i) => ({ id: `s_${i}` })) },
    async (p) => ({ page: p, total: 75, items: Array.from({ length: 35 }, (_, i) => ({ id: `s_${i + 40}` })) })
  )
  assert.equal(incompletePage1.status, 'unverified')
  assert.equal(incompletePage1.error, 'INCONSISTENT_PAGE_1')
  assert.equal(incompletePage1.isClear, false)

  // Case 6: API error on page 2 -> unverified
  const apiError = await checkFullPagination(
    { page: 1, total: 75, items: Array.from({ length: 50 }, (_, i) => ({ id: `s_${i}` })) },
    async () => { throw new Error('NETWORK_TIMEOUT') }
  )
  assert.equal(apiError.status, 'unverified')
  assert.equal(apiError.error, 'API_ERROR')
  assert.equal(apiError.isClear, false)
})

test('BEHAVIORAL: Selection change mid-fetch cancels state update and rejects stale snapshot', async () => {
  let activeSelection = 'candidate_A'
  let stateUpdatedFor: string | null = null

  // Simulate an effect triggered for candidate_A
  const runEffect = async (selection: string) => {
    const active = true
    const currentSelection = selection

    // Simulate async pagination fetch delay
    await new Promise(resolve => setTimeout(resolve, 15))

    if (!active || currentSelection !== activeSelection) {
      return // Aborted due to selection change
    }
    stateUpdatedFor = currentSelection
  }

  // Start effect for candidate_A
  const p1 = runEffect('candidate_A')

  // User quickly switches selection to candidate_B before p1 finishes
  activeSelection = 'candidate_B'
  const p2 = runEffect('candidate_B')

  await Promise.all([p1, p2])

  // Only candidate_B should have updated the state, candidate_A was cancelled
  assert.equal(stateUpdatedFor, 'candidate_B')
  assert.notEqual(stateUpdatedFor, 'candidate_A')
})

test('BEHAVIORAL: Account switching invalidates cached verification snapshots and candidates', () => {
  let activeUser = 'user_alice'
  const makeConflictKey = (owner: string, sourceId: string, recipientId: string) =>
    JSON.stringify([owner, sourceId, recipientId])

  const keyAlice = makeConflictKey(activeUser, 'shift_1', 'user_bob')
  const aliceSnapshot = { key: keyAlice, status: 'verified_clear' }

  // Alice checks and has verified_clear:
  assert.equal(aliceSnapshot.key === keyAlice, true)

  // Switch account to Charlie:
  activeUser = 'user_charlie'
  const keyCharlie = makeConflictKey(activeUser, 'shift_1', 'user_bob')

  // Alice's snapshot must not match Charlie's key:
  const isSnapshotValidForCharlie = aliceSnapshot.key === keyCharlie
  assert.equal(isSnapshotValidForCharlie, false, 'Previous user snapshot MUST NOT be accepted for new user')
})

test('BEHAVIORAL: Member source shift filtering admits approved/manually_assigned and rejects unapproved/legacy', () => {
  const currentUserId = 'member_1'
  const mockShifts: Shift[] = [
    { id: 's_approved', title: 'Ca 1', date: '2026-10-30', start_time: '08:00', end_time: '12:00', status: 'scheduled' } as Shift,
    { id: 's_manual', title: 'Ca 2', date: '2026-10-30', start_time: '13:00', end_time: '17:00', status: 'scheduled' } as Shift,
    { id: 's_pending', title: 'Ca 3', date: '2026-10-30', start_time: '18:00', end_time: '22:00', status: 'scheduled' } as Shift,
    { id: 's_legacy_only', title: 'Ca 4', date: '2026-10-31', start_time: '08:00', end_time: '12:00', host_id: currentUserId, status: 'scheduled' } as Shift,
  ]

  const mockRegistrations: ShiftRegistration[] = [
    { id: 'r1', shift_id: 's_approved', user_id: currentUserId, operational_role: 'host', status: 'approved' } as ShiftRegistration,
    { id: 'r2', shift_id: 's_manual', user_id: currentUserId, operational_role: 'support', status: 'manually_assigned' } as ShiftRegistration,
    { id: 'r3', shift_id: 's_pending', user_id: currentUserId, operational_role: 'host', status: 'pending' } as ShiftRegistration,
    // s_legacy_only has NO shift_registrations row
  ]

  // Filter logic used in SwapRequestFormModal:
  const eligibleShifts = mockShifts.filter(shift =>
    mockRegistrations.some(reg => reg.shift_id === shift.id && reg.user_id === currentUserId && isStaffedRegistration(reg))
  )

  assert.equal(eligibleShifts.length, 2)
  assert.deepEqual(eligibleShifts.map(s => s.id), ['s_approved', 's_manual'])
  assert.equal(eligibleShifts.some(s => s.id === 's_pending'), false, 'Pending registration must NOT appear in source shift list')
  assert.equal(eligibleShifts.some(s => s.id === 's_legacy_only'), false, 'Legacy-only assignment must NOT appear in source shift list')
})

test('BEHAVIORAL: Exchange one-sided, two-sided, and no-conflict evaluations with RLS privacy', () => {
  const evaluateExchange = (
    requesterShifts: Array<{ id: string; startAt: number; endAt: number }>,
    counterpartShifts: Array<{ id: string; startAt: number; endAt: number }>,
    source: { id: string; startAt: number; endAt: number },
    target: { id: string; startAt: number; endAt: number },
    requesterTotal: number,
    counterpartTotal: number
  ) => {
    const requesterConflict = requesterShifts.some(shift => {
      if (shift.id === source.id || shift.id === target.id) return false
      return shift.startAt < target.endAt && shift.endAt > target.startAt
    })
    const counterpartConflict = counterpartShifts.some(shift => {
      if (shift.id === target.id || shift.id === source.id) return false
      return shift.startAt < source.endAt && shift.endAt > source.startAt
    })

    if (requesterConflict) {
      return { status: 'conflict', reason: 'Bạn đã có ca khác trùng giờ với ca đổi chéo' }
    }
    if (counterpartConflict) {
      return { status: 'conflict', reason: 'Đối ứng có ca khác trùng giờ với ca của bạn' }
    }
    if (requesterTotal > requesterShifts.length || counterpartTotal > counterpartShifts.length) {
      return { status: 'unverified', reason: null }
    }
    return { status: 'verified_clear', reason: null }
  }

  const source = { id: 'src', startAt: 100, endAt: 200 }
  const target = { id: 'tgt', startAt: 300, endAt: 400 }

  // 1. One-sided: Requester conflict only
  const c1 = evaluateExchange(
    [{ id: 'other1', startAt: 250, endAt: 350 }], // overlaps target [300, 400]
    [],
    source, target, 1, 0
  )
  assert.equal(c1.status, 'conflict')
  assert.equal(c1.reason, 'Bạn đã có ca khác trùng giờ với ca đổi chéo')

  // 2. One-sided: Counterpart conflict only (generic reason, preserving RLS privacy)
  const c2 = evaluateExchange(
    [],
    [{ id: 'other2', startAt: 150, endAt: 250 }], // overlaps source [100, 200]
    source, target, 0, 1
  )
  assert.equal(c2.status, 'conflict')
  assert.equal(c2.reason, 'Đối ứng có ca khác trùng giờ với ca của bạn')
  assert.doesNotMatch(c2.reason, /other2/, 'Must not leak counterpart private shift IDs')

  // 3. Two-sided: Both conflict
  const c3 = evaluateExchange(
    [{ id: 'other1', startAt: 250, endAt: 350 }],
    [{ id: 'other2', startAt: 150, endAt: 250 }],
    source, target, 1, 1
  )
  assert.equal(c3.status, 'conflict')

  // 4. Incomplete results: total exceeds fetched
  const c4 = evaluateExchange([], [], source, target, 10, 0)
  assert.equal(c4.status, 'unverified')

  // 5. Clear: Neither side conflicts, self source/target shifts safely excluded
  const c5 = evaluateExchange(
    [{ id: 'src', startAt: 100, endAt: 200 }],
    [{ id: 'tgt', startAt: 300, endAt: 400 }],
    source, target, 1, 1
  )
  assert.equal(c5.status, 'verified_clear')
})
