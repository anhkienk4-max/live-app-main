import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'

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

test('RC1.7A: Actual Staffing GET returns segments, shift_context, and planned_staff', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
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
      throw new Error(`Unexpected table ${table}`)
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
})

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
              data: { id: 'shift-cohost', status: 'completed', deleted_at: null },
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
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() { return this },
          lt() { return this },
          gt() { return this },
          limit() {
            // No conflicting overlap for this distinct staff member
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
      throw new Error(`Unexpected table ${table}`)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser,
  })

  // Host A records worked (19:00 - 21:00)
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

  // Host B co-hosts simultaneously (19:00 - 21:00)
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
              data: { id: 'shift-split-2', status: 'completed', deleted_at: null },
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
      throw new Error(`Unexpected table ${table}`)
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

test('RC1.7A: Segregation of Duties: Creator cannot approve their own recorded evidence', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() {
            return {
              maybeSingle() {
                return Promise.resolve({
                  data: {
                    id: 'seg-creator-1',
                    shift_id: 'shift-1',
                    staff_id: 'host-1',
                    operational_role: 'host',
                    event_kind: 'worked',
                    actual_start_at: '2026-10-17T19:00:00+07:00',
                    actual_end_at: '2026-10-17T21:00:00+07:00',
                    review_status: 'draft',
                    version: 1,
                    created_by: 'leader-1', // created by leader-1
                  },
                  error: null,
                })
              },
            }
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  })

  // Same user (leader-1) attempts to review
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: leaderUser, // businessUserId = 'leader-1'
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-creator-1',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Self approval attempt must fail',
  }))

  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_SELF_REVIEW_BLOCKED')
})

test('RC1.7A: Independent Reviewer can approve with optimistic locking version increment', async () => {
  let updatedPayload: Record<string, unknown> | null = null
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        const queryBuilder = {
          select() { return this },
          eq(col: string, val: unknown) {
            return this
          },
          neq() { return this },
          lt() { return this },
          gt() { return this },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'seg-creator-1',
                shift_id: 'shift-1',
                staff_id: 'host-1',
                operational_role: 'host',
                event_kind: 'worked',
                actual_start_at: '2026-10-17T19:00:00+07:00',
                actual_end_at: '2026-10-17T21:00:00+07:00',
                review_status: 'draft',
                version: 1,
                created_by: 'leader-1', // created by leader-1
              },
              error: null,
            })
          },
          update(patch: Record<string, unknown>) {
            updatedPayload = patch
            return {
              eq() { return this },
              select() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: { id: 'seg-creator-1', review_status: patch.review_status, version: patch.version },
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
        return queryBuilder
      }
      if (table === 'shifts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'shift-1', status: 'completed' },
              error: null,
            })
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  })

  // Independent reviewer (leader-2) reviews
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: reviewerUser, // businessUserId = 'leader-2'
  })

  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-creator-1',
    expected_version: 1,
    decision: 'approved',
    review_note: 'Verified against studio check-in sheet',
  }))

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.segment.review_status, 'approved')
  assert.equal(body.segment.version, 2)
  assert.equal(updatedPayload?.reviewed_by, 'leader-2')
})
// Additional tests appended to tests/rc17a-actual-staffing.test.ts

test('RC1.7A: Optimistic Locking rejects stale expected_version with HTTP 409', async () => {
  const fakeDb = () => ({
    from(table: string) {
      if (table === 'workforce_actual_segments') {
        return {
          select() { return this },
          eq() {
            return {
              maybeSingle() {
                return Promise.resolve({
                  data: {
                    id: 'seg-version-2',
                    shift_id: 'shift-1',
                    staff_id: 'host-1',
                    operational_role: 'host',
                    event_kind: 'worked',
                    review_status: 'draft',
                    version: 2, // version in database is 2
                    created_by: 'leader-1',
                  },
                  error: null,
                })
              },
            }
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  })

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: fakeDb as never,
    resolveUser: reviewerUser, // leader-2
  })

  // Reviewer sends stale expected_version: 1
  const res = await handler.POST(post('https://example.test/api/workforce/actual', {
    action: 'review',
    segment_id: 'seg-version-2',
    expected_version: 1, // Stale!
    decision: 'approved',
    review_note: 'Attempting to approve with stale version',
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_ACTUAL_STALE_OR_LOCKED')
})

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
              data: { id: 'shift-contra', status: 'completed', deleted_at: null },
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
          eq(col: string, val: unknown) {
            return this
          },
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
      throw new Error(`Unexpected table ${table}`)
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
    evidence_note: 'Host claimed no show despite already being approved as worked',
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error.code, 'WORKFORCE_APPROVED_NO_SHOW_CONFLICT')
})
