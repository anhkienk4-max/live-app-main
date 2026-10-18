import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'
import {
  resolveShiftPlannedInterval,
  evaluateLateness,
  evaluateEndVariance,
} from '@/lib/workforce/latenessPolicy'
import { AuthorizationError } from '@/lib/server/authGuards'

const get = (url: string) => new Request(url)
const post = (url: string, body: object) => new Request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const mustNotUseDb = () => { throw new Error('UNAUTHORIZED_DB_ACCESS') }
const leaderUser = async () => ({ id: 'auth-leader', businessUserId: 'leader-1', systemPermission: 'leader' as const })
const reviewerUser = async () => ({ id: 'auth-reviewer', businessUserId: 'leader-2', systemPermission: 'leader' as const })
const adminUser = async () => ({ id: 'auth-admin', businessUserId: 'admin-1', systemPermission: 'admin' as const })

function safeDbFallback(table: string) {
  if (table === 'swap_requests') {
    return {
      select() { return this },
      or() { return Promise.resolve({ data: [], error: null }) },
      in() { return this },
      eq() { return this },
      then(resolve?: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve)
      },
    }
  }
  if (table === 'shift_registrations') {
    return {
      select() { return this },
      eq() { return this },
      in() { return Promise.resolve({ data: [], error: null }) },
      limit() { return Promise.resolve({ data: [], error: null }) },
      then(resolve?: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve)
      },
    }
  }
  throw new Error(`Unexpected table ${table}`)
}

const memberUser = async () => {
  throw new AuthorizationError(403, 'PERMISSION_DENIED', 'Role member is not authorized')
}

// ---------------------------------------------------------------------------
// TEST 1: Feature Flag Fail-Closed
// ---------------------------------------------------------------------------
test('RC1.7A: Actual Staffing fails closed (HTTP 503) when feature flag is disabled', async () => {
  const handler = createWorkforceActualHandler({
    isEnabled: () => false,
    client: mustNotUseDb,
    resolveUser: leaderUser,
  })

  const getRes = await handler.GET(get('https://example.test/api/workforce/actual?shift_id=shift-1'))
  assert.equal(getRes.status, 503)
  const getBody = await getRes.json()
  assert.equal(getBody.error.code, 'WORKFORCE_FEATURE_DISABLED')

  const postRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-1',
    staff_id: 'staff-1',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Verified livestream presence',
  }))
  assert.equal(postRes.status, 503)
  const postBody = await postRes.json()
  assert.equal(postBody.error.code, 'WORKFORCE_FEATURE_DISABLED')
})

// ---------------------------------------------------------------------------
// TEST 2: GET segments with lateness policy and planned staff
// ---------------------------------------------------------------------------
test('RC1.7A: Actual Staffing GET returns segments, shift_context, and lateness_policy', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          neq() { return this },
          lt() { return this },
          gt() { return this },
          order() { return this },
          limit() {
            return Promise.resolve({
              data: [{
                id: 'seg-1',
                shift_id: 'shift-100',
                staff_id: 'host-1',
                operational_role: 'host',
                event_kind: 'worked',
                coverage_kind: 'planned',
                actual_start_at: '2026-10-17T19:00:00+07:00',
                actual_end_at: '2026-10-17T21:00:00+07:00',
                review_status: 'draft',
                evidence_note: 'Camera log timestamp verified',
                review_note: null,
                created_by: 'leader-1',
                reviewed_by: null,
                reviewed_at: null,
                version: 1,
                created_at: '2026-10-17T21:05:00+07:00',
              }],
              error: null,
            })
          },
        }
      }
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'shift-100',
                date: '2026-10-17',
                start_time: '19:00:00',
                end_time: '21:00:00',
                start_at: '2026-10-17T19:00:00+07:00',
                end_at: '2026-10-17T21:00:00+07:00',
                duration_minutes: 120,
                status: 'completed',
                host_id: 'host-1',
                support_id: 'support-1',
                technical_id: 'tech-1',
              },
              error: null,
            })
          },
        }
      }
      if (table === 'shift_registrations') {
        return {
          select() { return this },
          eq() { return this },
          in() {
            return Promise.resolve({
              data: [
                { id: 'reg-1', user_id: 'host-1', operational_role: 'host', status: 'approved' },
                { id: 'reg-2', user_id: 'support-1', operational_role: 'support', status: 'approved' },
              ],
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({ data: [], error: null })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  const res = await handler.GET(get('https://example.test/api/workforce/actual?shift_id=shift-100'))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.segments.length, 1)
  assert.equal(body.shift_context.id, 'shift-100')
  assert.equal(body.shift_context.duration_minutes, 120)
  assert.equal(body.planned_staff.length, 2)
  assert.equal(body.segments[0].coverage_verification.assignment_verified, true)
  assert.equal(body.segments[0].coverage_verification.is_exception, false)
  assert.equal(body.segments[0].coverage_verification.matched_source, 'shift_roster')
  assert.equal(typeof body.lateness_policy.grace_minutes, 'number')
})

// ---------------------------------------------------------------------------
// TEST 3: Multi-Host / Co-Hosting on the Same Completed Shift
// ---------------------------------------------------------------------------
test('RC1.7A: Multi-Host / Co-Hosting on the same completed shift is supported', async () => {
  const inserted: Record<string, unknown>[] = []
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-cohost', status: 'completed', host_id: 'host-A', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-active', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'shift_registrations') {
        return {
          select() { return this },
          eq() { return this },
          in() {
            return Promise.resolve({
              data: [{ id: 'reg-b', user_id: 'host-B', operational_role: 'host', status: 'approved' }],
              error: null,
            })
          },
          limit() {
            return Promise.resolve({
              data: [{ id: 'reg-b' }],
              error: null,
            })
          },
        }
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          lt() { return this },
          gt() { return this },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
          insert(row: Record<string, unknown>) {
            inserted.push(row)
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: `seg-${inserted.length}`, shift_id: row.shift_id, review_status: 'draft', version: 1 },
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Host A records worked (planned host)
  const resA = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-cohost',
    staff_id: 'host-A',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Host A lead the first 2 hours',
  }))
  assert.equal(resA.status, 201)

  // Host B records worked as co-host (registered co-host)
  const resB = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-cohost',
    staff_id: 'host-B',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'extra',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Host B co-streamed alongside Host A',
  }))
  assert.equal(resB.status, 201)
  assert.equal(inserted.length, 2)
  assert.equal(inserted[0].staff_id, 'host-A')
  assert.equal(inserted[1].staff_id, 'host-B')
})

// ---------------------------------------------------------------------------
// TEST 4: Assistant (Trợ live) Cross-Shift Overlap Rejection
// ---------------------------------------------------------------------------
test('RC1.7A: Assistant (Trợ live) cross-shift overlapping hours are strictly rejected', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-split-2', status: 'completed', support_id: 'support-1', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'support-1', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          lt() { return this },
          gt() { return this },
          limit() {
            // Simulate an already approved segment on Shift 1 (14:00 - 18:00)
            return Promise.resolve({
              data: [{
                id: 'seg-existing-shift-1',
                shift_id: 'shift-split-1',
                operational_role: 'support',
                actual_start_at: '2026-10-17T14:00:00+07:00',
                actual_end_at: '2026-10-17T18:00:00+07:00',
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Attempt to record Assistant on Shift 2 with overlapping window (17:30 - 21:00)
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-split-2',
    staff_id: 'support-1',
    operational_role: 'support',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T17:30:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Overlap attempted with shift 1',
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_APPROVED_STAFF_OVERLAP')
})

// ---------------------------------------------------------------------------
// TEST 5: Anti-Self-Approval
// ---------------------------------------------------------------------------
test('RC1.7A: Segregation of Duties: Creator cannot approve their own recorded evidence', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'seg-draft-1',
                shift_id: 'shift-100',
                staff_id: 'host-1',
                operational_role: 'host',
                event_kind: 'worked',
                actual_start_at: '2026-10-17T19:00:00+07:00',
                actual_end_at: '2026-10-17T21:00:00+07:00',
                review_status: 'draft',
                version: 1,
                created_by: 'leader-1',
              },
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser, // leaderUser has businessUserId: 'leader-1'
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-draft-1',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Attempting to self-approve my own submission',
  }))

  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_SELF_REVIEW_BLOCKED')
})

test('RC1.7A: Segregation of Duties: Blocks self-approval when created_by matches auth user id', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'seg-draft-uuid',
                shift_id: 'shift-100',
                staff_id: 'host-1',
                operational_role: 'host',
                event_kind: 'worked',
                actual_start_at: '2026-10-17T19:00:00+07:00',
                actual_end_at: '2026-10-17T21:00:00+07:00',
                review_status: 'draft',
                version: 1,
                created_by: 'auth-leader', // created_by was auth UUID
              },
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser, // leaderUser has id: 'auth-leader'
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-draft-uuid',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Attempting self-approval matching auth id',
  }))

  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_SELF_REVIEW_BLOCKED')
})

// ---------------------------------------------------------------------------
// TEST 6: Independent Reviewer Approves with Optimistic Locking
// ---------------------------------------------------------------------------
test('RC1.7A: Independent Reviewer can approve with optimistic locking version increment', async () => {
  let updatedRow: Record<string, unknown> | null = null
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          neq() { return this },
          lt() { return this },
          gt() { return this },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'seg-draft-1',
                shift_id: 'shift-100',
                staff_id: 'host-1',
                operational_role: 'host',
                event_kind: 'worked',
                actual_start_at: '2026-10-17T19:00:00+07:00',
                actual_end_at: '2026-10-17T21:00:00+07:00',
                review_status: 'draft',
                version: 1,
                created_by: 'leader-1',
              },
              error: null,
            })
          },
          update(patch: Record<string, unknown>) {
            updatedRow = patch
            return {
              eq() { return this },
              select() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: {
                        id: 'seg-draft-1',
                        review_status: patch.review_status,
                        version: patch.version,
                      },
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-100', status: 'completed', host_id: 'host-1' },
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: reviewerUser, // reviewerUser has businessUserId: 'leader-2'
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-draft-1',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Verified with livestream recording and approved',
  }))

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.segment.review_status, 'approved')
  assert.equal(body.segment.version, 2)
  assert.equal(updatedRow?.reviewed_by, 'leader-2')
  assert.equal(updatedRow?.version, 2)
})

// ---------------------------------------------------------------------------
// TEST 7: Optimistic Locking Rejects Stale Version
// ---------------------------------------------------------------------------
test('RC1.7A: Optimistic Locking rejects stale expected_version with HTTP 409', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'seg-draft-1',
                shift_id: 'shift-100',
                staff_id: 'host-1',
                operational_role: 'host',
                event_kind: 'worked',
                review_status: 'draft',
                version: 3, // current version in DB is 3
                created_by: 'leader-1',
              },
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: reviewerUser,
  })

  // Reviewer submits with stale expected_version = 1
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-draft-1',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Attempting to approve stale version',
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_ACTUAL_STALE_OR_LOCKED')
})

// ---------------------------------------------------------------------------
// TEST 8: Contradictory Attendance Rejected
// ---------------------------------------------------------------------------
test('RC1.7A: Contradictory attendance (no_show when worked already approved) is rejected', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-contra', status: 'completed', host_id: 'host-1', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-1', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          lt() { return this },
          gt() { return this },
          limit() {
            // Contradiction query returns existing approved 'worked'
            return Promise.resolve({
              data: [{ id: 'seg-approved-worked' }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Attempt to record no_show when worked is already approved
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-contra',
    staff_id: 'host-1',
    operational_role: 'host',
    event_kind: 'no_show',
    coverage_kind: 'planned',
    actual_start_at: null,
    actual_end_at: null,
    evidence_note: 'Attempting conflicting no_show record',
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_APPROVED_NO_SHOW_CONFLICT')
})

// ---------------------------------------------------------------------------
// TEST 9: Overnight Shift Interval Resolution (23:00–02:00 and 23:45–01:45)
// ---------------------------------------------------------------------------
test('RC1.7A: Overnight shifts resolve start_at and end_at crossing midnight correctly', () => {
  // Test case 1: 23:00 to 02:00
  const shift1 = {
    date: '2026-10-17',
    start_time: '23:00',
    end_time: '02:00',
  }
  const res1 = resolveShiftPlannedInterval(shift1)
  assert.equal(res1.startIso, '2026-10-17T23:00:00+07:00')
  assert.equal(res1.endIso, '2026-10-18T02:00:00+07:00')
  assert.equal(res1.crossesMidnight, true)
  assert.equal(res1.durationMinutes, 180)
  assert(Date.parse(res1.endIso) > Date.parse(res1.startIso), 'End ISO must be strictly after start ISO')

  // Test case 2: 23:45 to 01:45
  const shift2 = {
    date: '2026-10-17',
    start_time: '23:45',
    end_time: '01:45',
  }
  const res2 = resolveShiftPlannedInterval(shift2)
  assert.equal(res2.startIso, '2026-10-17T23:45:00+07:00')
  assert.equal(res2.endIso, '2026-10-18T01:45:00+07:00')
  assert.equal(res2.crossesMidnight, true)
  assert.equal(res2.durationMinutes, 120)
  assert(Date.parse(res2.endIso) > Date.parse(res2.startIso), 'End ISO must be strictly after start ISO')

  // Test case 3: Preserves existing authoritative DB start_at and end_at
  const shift3 = {
    date: '2026-10-17',
    start_time: '23:00',
    end_time: '02:00',
    start_at: '2026-10-17T23:00:00+07:00',
    end_at: '2026-10-18T02:00:00+07:00',
    crosses_midnight: true,
  }
  const res3 = resolveShiftPlannedInterval(shift3)
  assert.equal(res3.startIso, '2026-10-17T23:00:00+07:00')
  assert.equal(res3.endIso, '2026-10-18T02:00:00+07:00')
  assert.equal(res3.crossesMidnight, true)
})

// ---------------------------------------------------------------------------
// TEST 10: Role Access Matrix (Operator, Host, Assistant, Member rejected 403)
// ---------------------------------------------------------------------------
test('RC1.7A: Role Access Matrix strictly rejects Member/Operator/Host/Trợ with HTTP 403', async () => {
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: mustNotUseDb,
    resolveUser: memberUser, // Non-leader/non-admin user
  })

  const getRes = await handler.GET(get('https://example.test/api/workforce/actual?shift_id=shift-1'))
  assert.equal(getRes.status, 403)
  const getBody = await getRes.json()
  assert.equal(getBody.error.code, 'PERMISSION_DENIED')

  const postRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-1',
    staff_id: 'host-1',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Operator trying to record attendance',
  }))
  assert.equal(postRes.status, 403)
  const postBody = await postRes.json()
  assert.equal(postBody.error.code, 'PERMISSION_DENIED')
})

// ---------------------------------------------------------------------------
// TEST 11: Configurable Lateness Policy (No Hardcoded 15m)
// ---------------------------------------------------------------------------
test('RC1.7A: Lateness evaluation distinguishes actual_late_minutes and late_after_grace', () => {
  const scheduledStart = '2026-10-17T19:00:00+07:00'

  // Case A: Grace = 0 (strictly punctual, no grace)
  const late10m = '2026-10-17T19:10:00+07:00'
  const evalGrace0 = evaluateLateness(late10m, scheduledStart, 0)
  assert.equal(evalGrace0.actualLateMinutes, 10)
  assert.equal(evalGrace0.lateAfterGraceMinutes, 10)
  assert.equal(evalGrace0.isLate, true)
  assert.equal(evalGrace0.isWithinGrace, false)
  assert.equal(evalGrace0.isOnTime, false)

  // Case B: Grace = 10 (clocked in 8m late -> within grace)
  const late8m = '2026-10-17T19:08:00+07:00'
  const evalGrace10 = evaluateLateness(late8m, scheduledStart, 10)
  assert.equal(evalGrace10.actualLateMinutes, 8)
  assert.equal(evalGrace10.lateAfterGraceMinutes, 0)
  assert.equal(evalGrace10.isLate, false)
  assert.equal(evalGrace10.isWithinGrace, true)
  assert.equal(evalGrace10.isOnTime, false)

  // Case C: Grace = 15 (clocked in 20m late -> lateAfterGrace = 5)
  const late20m = '2026-10-17T19:20:00+07:00'
  const evalGrace15 = evaluateLateness(late20m, scheduledStart, 15)
  assert.equal(evalGrace15.actualLateMinutes, 20)
  assert.equal(evalGrace15.lateAfterGraceMinutes, 5)
  assert.equal(evalGrace15.isLate, true)
  assert.equal(evalGrace15.isWithinGrace, false)
  assert.equal(evalGrace15.isOnTime, false)

  // Case D: Early clock-in (5m early)
  const early5m = '2026-10-17T18:55:00+07:00'
  const evalEarly = evaluateLateness(early5m, scheduledStart, 15)
  assert.equal(evalEarly.actualLateMinutes, -5)
  assert.equal(evalEarly.lateAfterGraceMinutes, 0)
  assert.equal(evalEarly.isOnTime, true)
  assert.equal(evalEarly.isLate, false)
  assert.equal(evalEarly.isWithinGrace, false)

  // Overtime and Early Departure
  const scheduledEnd = '2026-10-17T21:00:00+07:00'
  const endOT30m = '2026-10-17T21:30:00+07:00'
  const varianceOT = evaluateEndVariance(endOT30m, scheduledEnd)
  assert.equal(varianceOT.overtimeMinutes, 30)
  assert.equal(varianceOT.earlyDepartureMinutes, 0)

  const endEarly20m = '2026-10-17T20:40:00+07:00'
  const varianceEarly = evaluateEndVariance(endEarly20m, scheduledEnd)
  assert.equal(varianceEarly.earlyDepartureMinutes, 20)
  assert.equal(varianceEarly.overtimeMinutes, 0)
})

// ---------------------------------------------------------------------------
// TEST 12: Coverage Kind Verification (Planned requires scheduled assignment)
// ---------------------------------------------------------------------------
test('RC1.7A: Coverage kind planned requires scheduled assignment or registration', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'shift-strict',
                status: 'completed',
                host_id: 'host-official',
                support_id: null,
                technical_id: null,
                deleted_at: null,
              },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-unscheduled', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'shift_registrations') {
        return {
          select() { return this },
          eq() { return this },
          in() { return this },
          limit() {
            // Not registered
            return Promise.resolve({ data: [], error: null })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Attempting 'planned' coverage for unscheduled staff member fails with 409
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-strict',
    staff_id: 'host-unscheduled',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Recording planned coverage for unscheduled host',
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_PLANNED_STAFF_UNSCHEDULED')
})

// ---------------------------------------------------------------------------
// TEST 13: Concurrent Approval Race Condition & Trigger Error Mapping
// ---------------------------------------------------------------------------
test('RC1.7A: Concurrent approval race condition maps DB trigger exception to HTTP 409', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          neq() { return this },
          lt() { return this },
          gt() { return this },
          limit() {
            // Suppose application-level overlap check was raced past
            return Promise.resolve({ data: [], error: null })
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'seg-race-1',
                shift_id: 'shift-race',
                staff_id: 'host-raced',
                operational_role: 'host',
                event_kind: 'worked',
                actual_start_at: '2026-10-17T19:00:00+07:00',
                actual_end_at: '2026-10-17T21:00:00+07:00',
                review_status: 'draft',
                version: 1,
                created_by: 'leader-1',
              },
              error: null,
            })
          },
          update() {
            return {
              eq() { return this },
              select() {
                return {
                  maybeSingle() {
                    // Database trigger workforce_actual_guard threw WORKFORCE_APPROVED_STAFF_OVERLAP
                    return Promise.resolve({
                      data: null,
                      error: { message: 'WORKFORCE_APPROVED_STAFF_OVERLAP: conflicting active range' },
                    })
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-race', status: 'completed', host_id: 'host-raced' },
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: reviewerUser,
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-race-1',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Raced approval submission',
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_APPROVED_STAFF_OVERLAP')
})

// ---------------------------------------------------------------------------
// TEST 15: Admin user has full access to workforce actual staffing
// ---------------------------------------------------------------------------
test('RC1.7A: Admin user has full access to record and review actual staffing', async () => {
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: mustNotUseDb,
    resolveUser: adminUser,
  })
  const res = await handler.GET(get('https://example.test/api/workforce/actual'))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_SHIFT_ID_REQUIRED')
})

// ---------------------------------------------------------------------------
// TEST 16: Strict Timezone Validation rejects invalid or unsupported timezone
// ---------------------------------------------------------------------------
test('RC1.7A: resolveShiftPlannedInterval throws INVALID_TIMEZONE on unsupported timezone', () => {
  const invalidShift = {
    date: '2026-10-17',
    start_time: '23:00',
    end_time: '02:00',
    timezone: 'Invalid/Unsupported_Zone',
  };
  assert.throws(() => {
    resolveShiftPlannedInterval(invalidShift);
  }, /INVALID_TIMEZONE/);

  // Valid non-default IANA timezone is accepted and computed without runtime getDate
  const nyShift = {
    date: '2026-10-17',
    start_time: '23:00',
    end_time: '02:00',
    timezone: 'America/New_York',
  };
  const nyResolved = resolveShiftPlannedInterval(nyShift);
  assert.equal(nyResolved.crossesMidnight, true);
  assert.match(nyResolved.startIso, /2026-10-17T23:00:00-04:00/);
  assert.match(nyResolved.endIso, /2026-10-18T02:00:00-04:00/);
});

// ---------------------------------------------------------------------------
// TEST 17: Coverage Kind Cover / Replacement verified with approved swap_request
// ---------------------------------------------------------------------------
test('RC1.7A: Coverage kind cover/replacement is verified when approved swap_request exists', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'shift-swapped',
                status: 'completed',
                host_id: 'host-original',
                support_id: null,
                technical_id: null,
              },
              error: null,
            });
          },
        };
      }
      if (table === 'business_users') {
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-replacing', status: 'active', deleted_at: null },
              error: null,
            });
          },
        };
      }
      if (table === 'shift_registrations') {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return Promise.resolve({ data: [], error: null }); },
        };
      }
      if (table === 'swap_requests') {
        return {
          select() { return this; },
          in() { return this; },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-1',
                source_shift_id: 'shift-swapped',
                replacement_staff_id: 'host-replacing',
                counterpart_id: null,
                requester_id: 'host-original',
                operational_role: 'host',
                mode: 'replacement',
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            });
          },
        };
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this; },
          eq() { return this; },
          lt() { return this; },
          gt() { return this; },
          limit() { return Promise.resolve({ data: [], error: null }); },
          insert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: 'seg-cover-verified', shift_id: row.shift_id, review_status: 'draft', version: 1 },
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      return safeDbFallback(table);
    },
  });

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  });

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-swapped',
    staff_id: 'host-replacing',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'cover',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Covering for host-original per approved swap',
  }));

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.coverage_verification.assignment_verified, true);
  assert.equal(body.coverage_verification.requires_exception_approval, false);
  assert.equal(body.coverage_verification.matched_source, 'swap_request');
});

// ---------------------------------------------------------------------------
// TEST 18: Unverified Coverage Exception requires note >= 15 chars and flags exception
// ---------------------------------------------------------------------------
test('RC1.7A: Unverified cover/replacement/extra flags requires_exception_approval', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'shift-unverified',
                status: 'completed',
                host_id: 'host-orig',
                support_id: null,
                technical_id: null,
              },
              error: null,
            });
          },
        };
      }
      if (table === 'business_users') {
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-emergency', status: 'active', deleted_at: null },
              error: null,
            });
          },
        };
      }
      if (table === 'shift_registrations') {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return Promise.resolve({ data: [], error: null }); },
        };
      }
      if (table === 'swap_requests') {
        return {
          select() { return this; },
          in() { return this; },
          or() { return Promise.resolve({ data: [], error: null }); },
        };
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this; },
          eq() { return this; },
          lt() { return this; },
          gt() { return this; },
          limit() { return Promise.resolve({ data: [], error: null }); },
          insert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: 'seg-unverified-exc', shift_id: row.shift_id, review_status: 'draft', version: 1 },
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      return safeDbFallback(table);
    },
  });

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  });

  // Short note (< 15 chars) is rejected for unverified coverage exception
  const shortRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-unverified',
    staff_id: 'host-emergency',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'replacement',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Short note',
  }));
  assert.equal(shortRes.status, 400);
  const shortBody = await shortRes.json();
  assert.equal(shortBody.error.code, 'WORKFORCE_EXCEPTION_REASON_REQUIRED');

  // Detailed note (>= 15 chars) succeeds with requires_exception_approval: true
  const validRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-unverified',
    staff_id: 'host-emergency',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'replacement',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Emergency replacement without prior swap due to sudden illness of host-orig',
  }));
  assert.equal(validRes.status, 201);
  const validBody = await validRes.json();
  assert.equal(validBody.ok, true);
  assert.equal(validBody.coverage_verification.assignment_verified, false);
  assert.equal(validBody.coverage_verification.requires_exception_approval, true);
  assert.equal(validBody.coverage_verification.matched_source, 'unverified_exception');
});

// ---------------------------------------------------------------------------
// TEST 19: swap_requests DB Lookup Error is NOT swallowed (returns HTTP 503)
// ---------------------------------------------------------------------------
test('RC1.7A: swap_requests DB error returns HTTP 503 WORKFORCE_SCOPE_LOOKUP_FAILED', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-swap-err', status: 'completed', host_id: 'host-diff' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-cover', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'shift_registrations') {
        return {
          select() { return this },
          eq() { return this },
          in() { return Promise.resolve({ data: [], error: null }) },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            // DB returns error rather than empty data
            return Promise.resolve({ data: null, error: { message: 'Database connection failed' } })
          },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-swap-err',
    staff_id: 'host-cover',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'cover',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Cover attendance with valid note length',
  }))

  assert.equal(res.status, 503)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_SCOPE_LOOKUP_FAILED')
})

// ---------------------------------------------------------------------------
// TEST 20: Unscheduled Planned Segment CANNOT be approved on Review (returns 409)
// ---------------------------------------------------------------------------
test('RC1.7A: Unscheduled Planned segment is blocked on Review with HTTP 409', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'seg-unsched-planned',
                shift_id: 'shift-planned-check',
                staff_id: 'host-unplanned',
                operational_role: 'host',
                event_kind: 'worked',
                coverage_kind: 'planned',
                actual_start_at: '2026-10-17T19:00:00+07:00',
                actual_end_at: '2026-10-17T21:00:00+07:00',
                review_status: 'draft',
                evidence_note: 'Unscheduled draft segment',
                version: 1,
                created_by: 'leader-creator',
              },
              error: null,
            })
          },
        }
      }
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-planned-check', status: 'completed', host_id: 'host-official' },
              error: null,
            })
          },
        }
      }
      if (table === 'shift_registrations') {
        return {
          select() { return this },
          eq() { return this },
          in() { return Promise.resolve({ data: [], error: null }) },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: reviewerUser,
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-unsched-planned',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Attempting to approve unscheduled planned staff',
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_PLANNED_STAFF_UNSCHEDULED')
})

// ---------------------------------------------------------------------------
// TEST 21: Unverified Exception Review requires review_note >= 15 chars
// ---------------------------------------------------------------------------
test('RC1.7A: Exception approval requires reviewer note >= 15 chars', async () => {
  let updatedRow: Record<string, unknown> | null = null
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          neq() { return this },
          lt() { return this },
          gt() { return this },
          limit() { return Promise.resolve({ data: [], error: null }) },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'seg-exc-review',
                shift_id: 'shift-exc-check',
                staff_id: 'host-emergency-sub',
                operational_role: 'host',
                event_kind: 'worked',
                coverage_kind: 'replacement',
                actual_start_at: '2026-10-17T19:00:00+07:00',
                actual_end_at: '2026-10-17T21:00:00+07:00',
                review_status: 'draft',
                evidence_note: '[EXCEPTION:UNVERIFIED] Emergency replacement for host-official',
                version: 1,
                created_by: 'leader-creator',
              },
              error: null,
            })
          },
          update(patch: Record<string, unknown>) {
            updatedRow = patch
            return {
              eq() { return this },
              select() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: {
                        id: 'seg-exc-review',
                        review_status: patch.review_status,
                        version: patch.version,
                      },
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-exc-check', status: 'completed', host_id: 'host-official' },
              error: null,
            })
          },
        }
      }
      if (table === 'shift_registrations') {
        return {
          select() { return this },
          eq() { return this },
          in() { return Promise.resolve({ data: [], error: null }) },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() { return Promise.resolve({ data: [], error: null }) },
        }
      }
      return safeDbFallback(table);
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: reviewerUser,
  })

  // Short review note (< 15 chars) is rejected for exception approval
  const shortRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-exc-review',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Approved ok',
  }))
  assert.equal(shortRes.status, 400)
  const shortBody = await shortRes.json()
  assert.equal(shortBody.error.code, 'WORKFORCE_EXCEPTION_APPROVAL_NOTE_REQUIRED')

  // Detailed review note (>= 15 chars) succeeds
  const validRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-exc-review',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Verified exception with camera footage and stream logs; host-official sudden sick leave approved',
  }))
  assert.equal(validRes.status, 200)
  const validBody = await validRes.json()
  assert.equal(validBody.ok, true)
  assert.equal(validBody.segment.review_status, 'approved')
  assert.equal(validBody.segment.version, 2)
  assert.equal(updatedRow?.review_status, 'approved')
})


// ---------------------------------------------------------------------------
// TEST 22: Handover staff after PASS is NOT verified even if in old roster (No overwrite)
// ---------------------------------------------------------------------------
test('RC1.7A: Handover staff after PASS is NOT verified even if remaining in old roster', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'shift-handover',
                status: 'completed',
                host_id: 'host-alice', // Alice is still in old roster!
                support_id: null,
                technical_id: null,
              },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-alice', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-pass-1',
                source_shift_id: 'shift-handover',
                requester_id: 'host-alice',
                replacement_staff_id: 'host-bob',
                counterpart_id: null,
                operational_role: 'host',
                mode: 'replacement',
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Alice tries to record 'planned' coverage on the shift she gave away -> 409 UNSCHEDULED
  const plannedRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-handover',
    staff_id: 'host-alice',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Alice trying to record planned on surrendered shift',
  }))
  assert.equal(plannedRes.status, 409)
  const plannedBody = await plannedRes.json()
  assert.equal(plannedBody.error.code, 'WORKFORCE_PLANNED_STAFF_UNSCHEDULED')

  // Alice tries to record 'extra' with short note -> 400 EXCEPTION_REASON_REQUIRED
  const shortNoteRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-handover',
    staff_id: 'host-alice',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'extra',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Short note',
  }))
  assert.equal(shortNoteRes.status, 400)
  const shortBody = await shortNoteRes.json()
  assert.equal(shortBody.error.code, 'WORKFORCE_EXCEPTION_REASON_REQUIRED')
})

// ---------------------------------------------------------------------------
// TEST 23: Replacement staff is verified on source shift when approved swap exists
// ---------------------------------------------------------------------------
test('RC1.7A: Replacement staff is verified on source shift when approved swap exists', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'shift-pass-src',
                status: 'completed',
                host_id: 'host-alice',
              },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-bob', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-approved-1',
                source_shift_id: 'shift-pass-src',
                requester_id: 'host-alice',
                replacement_staff_id: 'host-bob',
                operational_role: 'host',
                mode: 'replacement',
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          lt() { return this },
          gt() { return this },
          limit() { return Promise.resolve({ data: [], error: null }) },
          insert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: 'seg-bob-src', shift_id: row.shift_id, review_status: 'draft', version: 1 },
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-pass-src',
    staff_id: 'host-bob',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'replacement',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Bob taking over Alice shift per approved swap',
  }))

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.coverage_verification.assignment_verified, true)
  assert.equal(body.coverage_verification.matched_source, 'swap_request')
  assert.equal(body.coverage_verification.is_exception, false)
})

// ---------------------------------------------------------------------------
// TEST 24: Exchange mode correctly verifies bidirectional staffing on source and target
// ---------------------------------------------------------------------------
test('RC1.7A: Exchange mode correctly verifies bidirectional staffing on source and target shifts', async () => {
  const swapRecord = {
    id: 'swap-ex-bidirectional',
    source_shift_id: 'shift-A',
    target_shift_id: 'shift-B',
    requester_id: 'host-alice',
    counterpart_id: 'host-bob',
    operational_role: 'host',
    mode: 'exchange',
    status: 'completed', // completed status
    deleted_at: null,
  }

  const makeDb = (currentShiftId: string, currentStaffId: string) => () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: currentShiftId,
                status: 'completed',
                host_id: currentShiftId === 'shift-A' ? 'host-alice' : 'host-bob',
              },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: currentStaffId, status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({ data: [swapRecord], error: null })
          },
        }
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          lt() { return this },
          gt() { return this },
          limit() { return Promise.resolve({ data: [], error: null }) },
          insert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: `seg-${currentShiftId}-${currentStaffId}`, shift_id: row.shift_id, review_status: 'draft', version: 1 },
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  // Direction 1: Bob works on Shift A (source) -> Verified!
  const handlerA = createWorkforceActualHandler({
    isEnabled: () => true,
    client: makeDb('shift-A', 'host-bob') as never,
    resolveUser: leaderUser,
  })
  const resA = await handlerA.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-A',
    staff_id: 'host-bob',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'cover',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Bob covering Alice shift A in exchange',
  }))
  assert.equal(resA.status, 201)
  const bodyA = await resA.json()
  assert.equal(bodyA.coverage_verification.assignment_verified, true)
  assert.equal(bodyA.coverage_verification.matched_source, 'swap_request')

  // Direction 2: Alice works on Shift B (target) -> Verified!
  const handlerB = createWorkforceActualHandler({
    isEnabled: () => true,
    client: makeDb('shift-B', 'host-alice') as never,
    resolveUser: leaderUser,
  })
  const resB = await handlerB.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-B',
    staff_id: 'host-alice',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'cover',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Alice covering Bob shift B in exchange',
  }))
  assert.equal(resB.status, 201)
  const bodyB = await resB.json()
  assert.equal(bodyB.coverage_verification.assignment_verified, true)
  assert.equal(bodyB.coverage_verification.matched_source, 'swap_request')

  // Inverse: Alice on Shift A (surrendered) is NOT verified
  const handlerASurrendered = createWorkforceActualHandler({
    isEnabled: () => true,
    client: makeDb('shift-A', 'host-alice') as never,
    resolveUser: leaderUser,
  })
  const resASurrender = await handlerASurrendered.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-A',
    staff_id: 'host-alice',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Alice attempting planned on surrendered shift A',
  }))
  assert.equal(resASurrender.status, 409)

  // Inverse: Bob on Shift B (surrendered) is NOT verified
  const handlerBSurrendered = createWorkforceActualHandler({
    isEnabled: () => true,
    client: makeDb('shift-B', 'host-bob') as never,
    resolveUser: leaderUser,
  })
  const resBSurrender = await handlerBSurrendered.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-B',
    staff_id: 'host-bob',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Bob attempting planned on surrendered shift B',
  }))
  assert.equal(resBSurrender.status, 409)
})

// ---------------------------------------------------------------------------
// TEST 25: Operational role mismatch between swap request and recorded segment is rejected
// ---------------------------------------------------------------------------
test('RC1.7A: Operational role mismatch between swap request and segment is rejected', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-mismatch', status: 'completed', host_id: 'host-orig', support_id: 'supp-orig' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'staff-charlie', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-host-only',
                source_shift_id: 'shift-mismatch',
                requester_id: 'host-orig',
                replacement_staff_id: 'staff-charlie',
                operational_role: 'host', // Swap is only for HOST role
                mode: 'replacement',
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Charlie records segment as 'support' (mismatch with swap's 'host' role)
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-mismatch',
    staff_id: 'staff-charlie',
    operational_role: 'support', // Trying to claim support role!
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Charlie claiming support role on host swap',
  }))
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_PLANNED_STAFF_UNSCHEDULED')
})

// ---------------------------------------------------------------------------
// TEST 26: Swaps in pending, rejected, or cancelled status do NOT verify assignment
// ---------------------------------------------------------------------------
test('RC1.7A: Pending, rejected, and cancelled swaps do NOT verify assignment', async () => {
  const invalidStatuses = ['pending', 'rejected', 'cancelled']

  for (const status of invalidStatuses) {
    const fakeDb = () => ({
      from(table: string) {
        if (table === 'shifts') {
          return {
            select() { return this },
            eq() { return this },
            is() { return this },
            maybeSingle() {
              return Promise.resolve({
                data: { id: `shift-${status}`, status: 'completed', host_id: 'host-orig' },
                error: null,
              })
            },
          }
        }
        if (table === 'business_users') {
          return {
            select() { return this },
            eq() { return this },
            is() { return this },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'host-sub', status: 'active', deleted_at: null },
                error: null,
              })
            },
          }
        }
        if (table === 'swap_requests') {
          return {
            select() { return this },
            in() { return this },
            or() {
              return Promise.resolve({
                data: [{
                  id: `swap-${status}`,
                  source_shift_id: `shift-${status}`,
                  requester_id: 'host-orig',
                  replacement_staff_id: 'host-sub',
                  operational_role: 'host',
                  mode: 'replacement',
                  status,
                  deleted_at: null,
                }],
                error: null,
              })
            },
          }
        }
        return safeDbFallback(table)
      },
    })

    const handler = createWorkforceActualHandler({
      isEnabled: () => true,
      client: fakeDb as never,
      resolveUser: leaderUser,
    })

    const res = await handler.POST(post('https://example.test/api/workforce/actual', {
      action: 'record',
      shift_id: `shift-${status}`,
      staff_id: 'host-sub',
      operational_role: 'host',
      event_kind: 'worked',
      coverage_kind: 'planned',
      actual_start_at: '2026-10-17T19:00:00+07:00',
      actual_end_at: '2026-10-17T21:00:00+07:00',
      evidence_note: `Sub on ${status} swap`,
    }))
    assert.equal(res.status, 409, `Status ${status} should not verify planned coverage`)
  }
})

// ---------------------------------------------------------------------------
// TEST 27: Accepted status is NOT yet admin approved; completed and approved ARE verified
// ---------------------------------------------------------------------------
test('RC1.7A: Accepted status is NOT yet admin approved; completed and approved ARE verified', async () => {
  const checkStatus = async (status: string, expectedStatus: number) => {
    const fakeDb = () => ({
      from(table: string) {
        if (table === 'shifts') {
          return {
            select() { return this },
            eq() { return this },
            is() { return this },
            maybeSingle() {
              return Promise.resolve({
                data: { id: `shift-st-${status}`, status: 'completed', host_id: 'host-orig' },
                error: null,
              })
            },
          }
        }
        if (table === 'business_users') {
          return {
            select() { return this },
            eq() { return this },
            is() { return this },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'host-sub', status: 'active', deleted_at: null },
                error: null,
              })
            },
          }
        }
        if (table === 'swap_requests') {
          return {
            select() { return this },
            in() { return this },
            or() {
              return Promise.resolve({
                data: [{
                  id: `swap-${status}`,
                  source_shift_id: `shift-st-${status}`,
                  requester_id: 'host-orig',
                  replacement_staff_id: 'host-sub',
                  operational_role: 'host',
                  mode: 'replacement',
                  status,
                  deleted_at: null,
                }],
                error: null,
              })
            },
          }
        }
        if (table === 'workforce_actual_segments') {
          return {
            select() { return this },
            eq() { return this },
            lt() { return this },
            gt() { return this },
            limit() { return Promise.resolve({ data: [], error: null }) },
            insert(row: Record<string, unknown>) {
              return {
                select() {
                  return {
                    single() {
                      return Promise.resolve({
                        data: { id: 'seg-test', shift_id: row.shift_id, review_status: 'draft', version: 1 },
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }
        return safeDbFallback(table)
      },
    })

    const handler = createWorkforceActualHandler({
      isEnabled: () => true,
      client: fakeDb as never,
      resolveUser: leaderUser,
    })

    const res = await handler.POST(post('https://example.test/api/workforce/actual', {
      action: 'record',
      shift_id: `shift-st-${status}`,
      staff_id: 'host-sub',
      operational_role: 'host',
      event_kind: 'worked',
      coverage_kind: 'planned',
      actual_start_at: '2026-10-17T19:00:00+07:00',
      actual_end_at: '2026-10-17T21:00:00+07:00',
      evidence_note: `Sub on ${status} swap`,
    }))
    assert.equal(res.status, expectedStatus)
  }

  // 'accepted' is only participant accepted, NOT yet admin approved -> 409
  await checkStatus('accepted', 409)
  // 'approved' is admin approved -> 201
  await checkStatus('approved', 201)
  // 'completed' is fully executed -> 201
  await checkStatus('completed', 201)
})

// ---------------------------------------------------------------------------
// TEST 28: Soft-deleted swap requests are ignored
// ---------------------------------------------------------------------------
test('RC1.7A: Soft-deleted swap requests (deleted_at NOT NULL) are ignored', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-soft-del', status: 'completed', host_id: 'host-orig' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-sub', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-deleted-1',
                source_shift_id: 'shift-soft-del',
                requester_id: 'host-orig',
                replacement_staff_id: 'host-sub',
                operational_role: 'host',
                mode: 'replacement',
                status: 'approved',
                deleted_at: '2026-10-18T10:00:00Z', // Soft-deleted!
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-soft-del',
    staff_id: 'host-sub',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Sub trying to use soft deleted swap',
  }))
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_PLANNED_STAFF_UNSCHEDULED')
})

// ---------------------------------------------------------------------------
// TEST 29: Database error on swap_requests fails closed with HTTP 503 across GET, record, and review
// ---------------------------------------------------------------------------
test('RC1.7A: Database error on swap_requests fails closed with HTTP 503 across GET, record, and review', async () => {
  const dbErrorDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-dberr', status: 'completed', host_id: 'host-orig' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-sub', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          order() { return this },
          limit() { return Promise.resolve({ data: [{ id: 'seg-dberr', shift_id: 'shift-dberr', staff_id: 'host-sub', operational_role: 'host', coverage_kind: 'planned', review_status: 'draft', version: 1 }], error: null }) },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'seg-dberr', shift_id: 'shift-dberr', staff_id: 'host-sub', operational_role: 'host', coverage_kind: 'planned', review_status: 'draft', version: 1, created_by: 'leader-1' },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({ data: null, error: { message: 'swap_requests connection failure' } })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: dbErrorDb as never,
    resolveUser: reviewerUser,
  })

  // 1. GET fails closed with 503
  const getRes = await handler.GET(get('https://example.test/api/workforce/actual?shift_id=shift-dberr'))
  assert.equal(getRes.status, 503)
  const getBody = await getRes.json()
  assert.equal(getBody.error.code, 'WORKFORCE_SCOPE_LOOKUP_FAILED')

  // 2. POST record fails closed with 503
  const recordRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-dberr',
    staff_id: 'host-sub',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'cover',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Covering during db outage with sufficient length note',
  }))
  assert.equal(recordRes.status, 503)
  const recordBody = await recordRes.json()
  assert.equal(recordBody.error.code, 'WORKFORCE_SCOPE_LOOKUP_FAILED')

  // 3. POST review fails closed with 503
  const reviewRes = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-dberr',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Approving segment during db outage with note >= 15 chars',
  }))
  assert.equal(reviewRes.status, 503)
  const reviewBody = await reviewRes.json()
  assert.equal(reviewBody.error.code, 'WORKFORCE_SCOPE_LOOKUP_FAILED')
})

// ---------------------------------------------------------------------------
// TEST 30: GET, record, and review return identical verification outcomes
// ---------------------------------------------------------------------------
test('RC1.7A: GET, record, and review return identical verification outcomes', async () => {
  const shiftRecord = {
    id: 'shift-identical',
    status: 'completed',
    host_id: 'host-alice',
    support_id: null,
    technical_id: null,
  }

  const swapRecord = {
    id: 'swap-identical',
    source_shift_id: 'shift-identical',
    requester_id: 'host-alice',
    replacement_staff_id: 'host-bob',
    operational_role: 'host',
    mode: 'replacement',
    status: 'approved',
    deleted_at: null,
  }

  let segmentStore: Record<string, unknown> | null = null

  const sharedDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({ data: shiftRecord, error: null })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({ data: { id: 'host-bob', status: 'active', deleted_at: null }, error: null })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({ data: [swapRecord], error: null })
          },
        }
      }
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          neq() { return this },
          lt() { return this },
          gt() { return this },
          order() {
            return {
              limit() {
                return Promise.resolve({
                  data: segmentStore ? [segmentStore] : [],
                  error: null,
                })
              },
            }
          },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
          maybeSingle() {
            return Promise.resolve({
              data: segmentStore,
              error: null,
            })
          },
          insert(row: Record<string, unknown>) {
            segmentStore = {
              ...row,
              id: 'seg-identical-1',
              review_status: 'draft',
              version: 1,
              created_by: 'leader-1',
            }
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: segmentStore,
                      error: null,
                    })
                  },
                }
              },
            }
          },
          update(patch: Record<string, unknown>) {
            segmentStore = { ...segmentStore, ...patch }
            return {
              eq() { return this },
              select() {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: segmentStore, error: null })
                  },
                }
              },
            }
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const recorderHandler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: sharedDb as never,
    resolveUser: leaderUser,
  })

  // 1. POST record: Bob records replacement
  const recordRes = await recorderHandler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-identical',
    staff_id: 'host-bob',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'replacement',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Bob taking over Alice shift with verified swap record',
  }))
  assert.equal(recordRes.status, 201)
  const recordBody = await recordRes.json()
  assert.equal(recordBody.coverage_verification.assignment_verified, true)
  assert.equal(recordBody.coverage_verification.matched_source, 'swap_request')
  assert.equal(recordBody.coverage_verification.is_exception, false)

  // 2. GET: returns exact same verification for that segment
  const getRes = await recorderHandler.GET(get('https://example.test/api/workforce/actual?shift_id=shift-identical'))
  assert.equal(getRes.status, 200)
  const getBody = await getRes.json()
  assert.equal(getBody.segments.length, 1)
  const getVerification = getBody.segments[0].coverage_verification
  assert.equal(getVerification.assignment_verified, recordBody.coverage_verification.assignment_verified)
  assert.equal(getVerification.matched_source, recordBody.coverage_verification.matched_source)
  assert.equal(getVerification.is_exception, recordBody.coverage_verification.is_exception)

  // 3. POST review: reviewer approves without needing exception override because assignment is verified
  const reviewerHandler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: sharedDb as never,
    resolveUser: reviewerUser,
  })
  const reviewRes = await reviewerHandler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-identical-1',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Standard approval note for verified replacement',
  }))
  assert.equal(reviewRes.status, 200)
  const reviewBody = await reviewRes.json()
  assert.equal(reviewBody.ok, true)
  assert.equal(reviewBody.segment.review_status, 'approved')
})
// ---------------------------------------------------------------------------
// TEST 31: Swap with mode NULL fails closed (unverified exception)
// ---------------------------------------------------------------------------
test('RC1.7A: Swap with mode NULL fails closed (unverified exception)', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-null-mode', status: 'completed', host_id: 'host-orig' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-sub', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-null-mode',
                source_shift_id: 'shift-null-mode',
                requester_id: 'host-orig',
                replacement_staff_id: 'host-sub',
                operational_role: 'host',
                mode: null, // NULL mode
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-null-mode',
    staff_id: 'host-sub',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Sub on null mode swap',
  }))
  assert.equal(res.status, 409, 'Swap with mode NULL must not verify planned assignment')
})

// ---------------------------------------------------------------------------
// TEST 32: Legacy swap with mode MOVE fails closed (unverified exception)
// ---------------------------------------------------------------------------
test('RC1.7A: Legacy swap with mode MOVE fails closed (unverified exception)', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-legacy-move', status: 'completed', host_id: 'host-orig' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-sub', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-legacy-move',
                source_shift_id: 'shift-legacy-move',
                requester_id: 'host-orig',
                replacement_staff_id: 'host-sub',
                operational_role: 'host',
                mode: 'move', // Legacy move mode
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-legacy-move',
    staff_id: 'host-sub',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Sub on legacy move mode swap',
  }))
  assert.equal(res.status, 409, 'Legacy swap with mode MOVE must not verify planned assignment')
})

// ---------------------------------------------------------------------------
// TEST 33: Operational role mismatch (swap role host vs segment role support) is blocked
// ---------------------------------------------------------------------------
test('RC1.7A: Operational role mismatch (swap role host vs segment role support) is blocked', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-role-mismatch', status: 'completed', host_id: 'host-orig' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-sub', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-role-host',
                source_shift_id: 'shift-role-mismatch',
                requester_id: 'host-orig',
                replacement_staff_id: 'host-sub',
                operational_role: 'host', // Swap is for HOST role
                mode: 'replacement',
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Staff records as 'support' instead of 'host'
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-role-mismatch',
    staff_id: 'host-sub',
    operational_role: 'support', // Segment role is SUPPORT
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Attempting to claim support with host swap',
  }))
  assert.equal(res.status, 409, 'Role mismatch between swap and segment must not verify planned assignment')
})

// ---------------------------------------------------------------------------
// TEST 34: Missing operational_role (NULL/undefined) on swap fails closed (no wildcard match)
// ---------------------------------------------------------------------------
test('RC1.7A: Missing operational_role (NULL/undefined) on swap fails closed (no wildcard match)', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-null-role', status: 'completed', host_id: 'host-orig' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-sub', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-null-role',
                source_shift_id: 'shift-null-role',
                requester_id: 'host-orig',
                replacement_staff_id: 'host-sub',
                operational_role: null, // Missing / NULL operational_role
                mode: 'replacement',
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-null-role',
    staff_id: 'host-sub',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Sub claiming host on swap with null role',
  }))
  assert.equal(res.status, 409, 'Swap with NULL operational_role must not wildcard-match planned assignment')
})

// ---------------------------------------------------------------------------
// TEST 35: Target shift in mode replacement does NOT verify incoming staff
// ---------------------------------------------------------------------------
test('RC1.7A: Target shift in mode replacement does NOT verify incoming staff', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-target-pass', status: 'completed', host_id: 'host-counterpart' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-alice', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-pass-with-target',
                source_shift_id: 'shift-source-pass',
                target_shift_id: 'shift-target-pass',
                requester_id: 'host-alice',
                counterpart_id: 'host-bob',
                replacement_staff_id: 'host-bob',
                operational_role: 'host',
                mode: 'replacement', // 1-way PASS: target shift should NOT verify Alice
                status: 'approved',
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Alice tries to claim work on target_shift_id in a replacement (PASS) swap
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-target-pass',
    staff_id: 'host-alice',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Requester trying to claim target shift in a replacement swap',
  }))
  assert.equal(res.status, 409, 'Target shift in mode replacement must NOT verify incoming staff')
})

// ---------------------------------------------------------------------------
// TEST 36: Stale roster after handover: Handover staff remaining in roster cannot override approved swap surrender
// ---------------------------------------------------------------------------
test('RC1.7A: Stale roster after handover: Handover staff remaining in roster cannot override approved swap surrender', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              // Stale roster: Alice is STILL listed as host_id on shift-stale-roster
              data: { id: 'shift-stale-roster', status: 'completed', host_id: 'host-alice' },
              error: null,
            })
          },
        }
      }
      if (table === 'business_users') {
        return {
          select() { return this },
          eq() { return this },
          is() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'host-alice', status: 'active', deleted_at: null },
              error: null,
            })
          },
        }
      }
      if (table === 'swap_requests') {
        return {
          select() { return this },
          in() { return this },
          or() {
            return Promise.resolve({
              data: [{
                id: 'swap-surrender-stale',
                source_shift_id: 'shift-stale-roster',
                requester_id: 'host-alice', // Alice surrendered this shift
                replacement_staff_id: 'host-bob',
                operational_role: 'host',
                mode: 'replacement',
                status: 'approved', // Approved swap
                deleted_at: null,
              }],
              error: null,
            })
          },
        }
      }
      return safeDbFallback(table)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Alice tries to record as planned because she is still in the old shifts.host_id roster
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'record',
    shift_id: 'shift-stale-roster',
    staff_id: 'host-alice',
    operational_role: 'host',
    event_kind: 'worked',
    coverage_kind: 'planned',
    actual_start_at: '2026-10-17T19:00:00+07:00',
    actual_end_at: '2026-10-17T21:00:00+07:00',
    evidence_note: 'Handover staff attempting to claim old roster slot after approved swap',
  }))
  assert.equal(res.status, 409, 'Stale roster must not override approved swap surrender')
})
