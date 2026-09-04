import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { currentUserService } from '../lib/services/dataService.ts'
import { notificationService } from '../lib/services/notificationService.ts'
import { resolveNotificationDestination } from '../lib/services/notificationRoutes.ts'
import { createSupabaseNotificationRepository } from '../lib/services/supabaseNotificationService.ts'
import type { AppNotification } from '../lib/types/database.types.ts'

const notificationsMigration = readFileSync(
  new URL('../supabase/migrations/20260827110001_notifications_persistent_realtime.sql', import.meta.url),
  'utf8',
)
const accountReviewMigration = readFileSync(
  new URL('../supabase/migrations/20260902110000_account_request_review.sql', import.meta.url),
  'utf8',
)

function sliceAfter(source: string, marker: RegExp): string {
  const match = source.match(marker)
  assert.ok(match?.index !== undefined, `expected migration to contain ${marker}`)
  return source.slice(match.index as number)
}

// ---------------------------------------------------------------------------
// 1. Correct recipient per business event (authoritative backend contract).
// ---------------------------------------------------------------------------

test('GL-11 registration submit notifies shift leader/admin reviewers only', () => {
  const body = sliceAfter(notificationsMigration, /emit_shift_registration_notification/)
  assert.match(body, /new\.status = 'pending'/)
  assert.match(body, /for reviewer_id in select private\.notification_reviewer_ids\(new\.shift_id\)/)
  assert.match(body, /'registration_submitted:' \|\| new\.id \|\| ':' \|\| reviewer_id/)
  const reviewers = sliceAfter(notificationsMigration, /notification_reviewer_ids/)
  assert.match(reviewers, /system_permission in \('leader', 'admin'\)/)
})

test('GL-11 manual staffing assignment notifies the assignee', () => {
  const body = sliceAfter(notificationsMigration, /emit_shift_registration_notification/)
  assert.match(body, /new\.status = 'manually_assigned'/)
  assert.match(body, /new\.user_id, 'shift_assigned'/)
})

test('GL-11 registration approval/rejection notifies the requesting member', () => {
  const body = sliceAfter(notificationsMigration, /emit_shift_registration_notification/)
  assert.match(body, /old\.status = 'pending' and new\.status in \('approved', 'rejected'\)/)
  assert.match(body, /new\.user_id, notification_type/)
  assert.match(body, /'staffing_approval'/)
  assert.match(body, /'staffing_rejection'/)
})

test('GL-11 swap request notifies the intended participant, not a broadcast', () => {
  const body = sliceAfter(notificationsMigration, /emit_swap_notification/)
  assert.match(body, /participant_id := coalesce\(new\.counterpart_id, new\.replacement_staff_id\)/)
  assert.match(body, /'swap_request:' \|\| related_id \|\| ':' \|\| participant_id/)
})

test('GL-11 swap outcome notifies requester and participants only', () => {
  const body = sliceAfter(notificationsMigration, /emit_swap_notification/)
  assert.match(body, /array_remove\(array\[new\.requester_id, new\.counterpart_id, new\.replacement_staff_id\], null\)/)
  assert.match(body, /'swap_accepted'/)
  assert.match(body, /'swap_rejected'/)
  assert.match(body, /'swap_approved'/)
})

test('GL-11 report submit notifies reviewers; review notifies the submitter', () => {
  const body = sliceAfter(notificationsMigration, /emit_report_notification/)
  assert.match(body, /for recipient_id in select private\.notification_reviewer_ids\(new\.shift_id\)/)
  assert.match(body, /'report_submitted:' \|\| new\.id \|\| ':' \|\| recipient_id/)
  assert.match(body, /new\.submitted_by, event_type/)
  assert.match(body, /'report_reviewed'/)
})

test('GL-11 import completion notifies the importing user', () => {
  const body = sliceAfter(notificationsMigration, /emit_import_notification/)
  assert.match(body, /new\.created_by, event_type/)
  assert.match(body, /'import_completed'/)
  assert.match(body, /'import_failure'/)
})

test('GL-11 account request notifies active admins only', () => {
  const body = sliceAfter(accountReviewMigration, /emit_account_request_notification/)
  assert.match(body, /system_permission = 'admin'/)
  assert.match(body, /'account_request_submitted:'/)
  assert.doesNotMatch(body, /system_permission in \('leader', 'admin'\)/)
})

// ---------------------------------------------------------------------------
// 2. Wrong recipients are excluded.
// ---------------------------------------------------------------------------

test('GL-11 reviewer scope excludes inactive, archived, and deleted users', () => {
  const reviewers = sliceAfter(notificationsMigration, /notification_reviewer_ids/)
  assert.match(reviewers, /status = 'active'/)
  assert.match(reviewers, /account_status = 'active'/)
  assert.match(reviewers, /archived_at is null/)
  assert.match(reviewers, /deleted_at is null/)
})

test('GL-11 inactive recipients are dropped instead of notified', () => {
  assert.match(notificationsMigration, /if p_recipient_id is null or not exists/)
  assert.match(notificationsMigration, /and business_user\.status = 'active'/)
})

// ---------------------------------------------------------------------------
// 3. Correct notification type and target route per event.
// ---------------------------------------------------------------------------

test('GL-11 every persisted event carries a valid in-app target route', () => {
  for (const url of ["'/calendar'", "'/swaps'", "'/reports'", "'/staff'"]) {
    assert.ok(
      notificationsMigration.includes(url) || accountReviewMigration.includes(url),
      `expected a notification target ${url}`,
    )
  }
  assert.doesNotMatch(notificationsMigration, /href="#"|placeholder|action_url'\s+text\s+not null/)
})

function notification(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: 'n-1',
    type: 'system',
    title: 't',
    message: 'm',
    severity: 'info',
    user_id: 'member-1',
    created_at: '2031-08-20T00:00:00.000Z',
    ...overrides,
  }
}

test('GL-11 resolver keeps real stored routes and maps every canonical type', () => {
  assert.equal(resolveNotificationDestination(notification({ type: 'shift_assigned', action_url: '/calendar' })), '/calendar')
  assert.equal(resolveNotificationDestination(notification({ type: 'swap_request', action_url: '/swaps' })), '/swaps')
  assert.equal(resolveNotificationDestination(notification({ type: 'report_submitted', action_url: '/reports' })), '/reports')
  assert.equal(resolveNotificationDestination(notification({ type: 'account_request_submitted', action_url: '/staff' })), '/staff')
  assert.equal(resolveNotificationDestination(notification({ type: 'registration_submitted' })), '/calendar')
  assert.equal(resolveNotificationDestination(notification({ type: 'staffing_approval' })), '/calendar')
  assert.equal(resolveNotificationDestination(notification({ type: 'staffing_rejection' })), '/calendar')
  assert.equal(resolveNotificationDestination(notification({ type: 'shift_assigned' })), '/calendar?tab=mine')
  assert.equal(resolveNotificationDestination(notification({ type: 'swap_accepted' })), '/swaps')
  assert.equal(resolveNotificationDestination(notification({ type: 'report_reviewed' })), '/reports')
  assert.equal(resolveNotificationDestination(notification({ type: 'import_completed' })), '/calendar')
  assert.equal(resolveNotificationDestination(notification({ type: 'import_failure' })), '/calendar')
  assert.equal(resolveNotificationDestination(notification({ type: 'account_request_submitted' })), '/staff')
  assert.equal(resolveNotificationDestination(notification({ type: 'system' })), '/notifications')
})

test('GL-11 resolver never navigates to untrusted or unknown destinations', () => {
  assert.equal(
    resolveNotificationDestination(notification({ type: 'swap_request', action_url: 'https://evil.test/x' })),
    '/swaps',
  )
  assert.equal(
    resolveNotificationDestination(notification({ type: 'report_submitted', action_url: '//evil.test' })),
    '/reports',
  )
  assert.equal(
    resolveNotificationDestination(notification({ type: 'shift_assigned', action_url: '/nonexistent-route' })),
    '/calendar?tab=mine',
  )
})

// ---------------------------------------------------------------------------
// 4. Read/unread persistence against a stateful repository double.
// ---------------------------------------------------------------------------

interface FixtureRow {
  id: string
  user_id: string | null
  recipient_id: string | null
  type: string
  notification_type: string | null
  severity: string | null
  title: string
  message: string
  related_entity_type: string | null
  related_entity_id: string | null
  action_url: string | null
  event_key: string | null
  read: boolean | null
  read_at: string | null
  created_at: string
}

function statefulDouble(rows: FixtureRow[], rpcError: { message: string } | null = null) {
  const calls: string[] = []
  const channel = { on() { return channel }, subscribe() { return channel } }
  const client = {
    from() {
      return {
        select() {
          return {
            order: async () => ({ data: rows.map(row => ({ ...row })), error: null }),
          }
        },
      }
    },
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push(name)
      if (rpcError) return Promise.resolve({ data: null, error: rpcError })
      if (name === 'mark_notification_read') {
        const row = rows.find(item => item.id === args?.p_notification_id)
        if (!row) return Promise.resolve({ data: null, error: { message: 'NOTIFICATION_NOT_OWNED' } })
        row.read = true
        row.read_at = row.read_at ?? '2031-08-21T00:00:00.000Z'
      }
      if (name === 'mark_all_notifications_read') {
        for (const row of rows) {
          if (!row.read_at) {
            row.read = true
            row.read_at = '2031-08-21T00:00:00.000Z'
          }
        }
      }
      return Promise.resolve({ data: null, error: null })
    },
    channel() { return channel },
    removeChannel() { return Promise.resolve('ok') },
  } as unknown as SupabaseClient
  return { repository: createSupabaseNotificationRepository(client), calls }
}

function unreadRow(id: string, eventKey: string): FixtureRow {
  return {
    id, user_id: null, recipient_id: 'member-1', type: 'shift', notification_type: 'staffing_approval',
    severity: 'success', title: 'Approved', message: 'Approved', related_entity_type: 'shift',
    related_entity_id: 'shift-1', action_url: '/calendar', event_key: eventKey,
    read: false, read_at: null, created_at: '2031-08-20T00:00:00.000Z',
  }
}

test('GL-11 single read persists across a simulated refresh', async () => {
  const rows = [unreadRow('notification-1', 'staffing_approval:r1:member-1'), unreadRow('notification-2', 'staffing_approval:r2:member-1')]
  const { repository } = statefulDouble(rows)
  assert.equal(await repository.getForCurrentUser().then(items => items.filter(item => !item.read_at).length), 2)
  await repository.markRead('notification-1')
  const refreshed = await repository.getForCurrentUser()
  assert.equal(refreshed.find(item => item.id === 'notification-1')?.read_at, '2031-08-21T00:00:00.000Z')
  assert.equal(refreshed.filter(item => !item.read_at).length, 1)
})

test('GL-11 mark-all persists and a later notification stays unread', async () => {
  const rows = [unreadRow('notification-1', 'staffing_approval:r1:member-1')]
  const { repository } = statefulDouble(rows)
  await repository.markAllRead()
  assert.equal((await repository.getForCurrentUser()).filter(item => !item.read_at).length, 0)
  rows.push(unreadRow('notification-2', 'staffing_approval:r2:member-1'))
  const refreshed = await repository.getForCurrentUser()
  assert.equal(refreshed.filter(item => !item.read_at).length, 1)
  assert.equal(refreshed.find(item => item.id === 'notification-2')?.read_at, null)
})

test('GL-11 unread count equals authoritative unread state', async () => {
  const rows = [unreadRow('notification-1', 'staffing_approval:r1:member-1'), unreadRow('notification-2', 'staffing_approval:r2:member-1')]
  const { repository } = statefulDouble(rows)
  await repository.markRead('notification-2')
  const items = await repository.getForCurrentUser()
  assert.equal(items.filter(item => !item.read_at).length, 1)
})

// ---------------------------------------------------------------------------
// 5. Backend failure and unauthorized mutation never report success.
// ---------------------------------------------------------------------------

test('GL-11 backend failure rejects instead of reporting success', async () => {
  const { repository } = statefulDouble([unreadRow('notification-1', 'staffing_approval:r1:member-1')], { message: 'boom' })
  await assert.rejects(() => repository.markRead('notification-1'), /boom/)
  await assert.rejects(() => repository.markAllRead(), /boom/)
  const items = await repository.getForCurrentUser()
  assert.equal(items.find(item => item.id === 'notification-1')?.read_at, null)
})

test('GL-11 unknown notification id is treated as not owned', async () => {
  const { repository } = statefulDouble([unreadRow('notification-1', 'staffing_approval:r1:member-1')])
  await assert.rejects(() => repository.markRead('missing-id'), /NOTIFICATION_NOT_OWNED/)
})

test('GL-11 read-state RPCs enforce per-user ownership in the backend', () => {
  assert.match(notificationsMigration, /raise exception.*NOTIFICATION_NOT_OWNED/)
  assert.match(
    notificationsMigration,
    /recipient_id = \(select private\.current_business_user_id\(\)\)\s+or user_id = \(select auth\.uid\(\)\)/,
  )
})

// ---------------------------------------------------------------------------
// 6. Mock-mode service behavior: recipient isolation and persistence.
// ---------------------------------------------------------------------------

function useMockMode() {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  notificationService._resetForTests()
  return () => {
    currentUserService.clearAuthenticatedUser()
    notificationService._resetForTests()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

test('GL-11 service isolates recipients and persists read state', async () => {
  const restore = useMockMode()
  try {
    // In mock mode the deterministic node identity is '1' (see currentUserService.getId).
    notificationService._create({
      user_id: '1', type: 'staffing_approval', title: 'Approved', message: 'Approved',
      severity: 'success', event_key: 'staffing_approval:r1:1',
    })
    notificationService._create({
      user_id: '2', type: 'staffing_approval', title: 'Approved', message: 'Approved',
      severity: 'success', event_key: 'staffing_approval:r1:2',
    })
    assert.equal((await notificationService.getForCurrentUser()).length, 1)
    assert.equal(await notificationService.getUnreadCount(), 1)
    const [item] = await notificationService.getForCurrentUser()
    await notificationService.markRead(item.id)
    assert.equal(await notificationService.getUnreadCount(), 0)
    await notificationService.markAllRead()
    assert.equal(await notificationService.getUnreadCount(), 0)
    notificationService._create({
      user_id: '1', type: 'swap_request', title: 'Swap', message: 'Swap',
      severity: 'info', event_key: 'swap_request:s9:1',
    })
    assert.equal(await notificationService.getUnreadCount(), 1)
  } finally {
    restore()
  }
})

test('GL-11 service ignores cross-user read attempts', async () => {
  const restore = useMockMode()
  try {
    const mine = notificationService._create({
      user_id: '1', type: 'swap_request', title: 'Swap', message: 'Swap',
      severity: 'info', event_key: 'swap_request:s1:1',
    })
    const foreign = notificationService._create({
      user_id: '2', type: 'swap_request', title: 'Swap', message: 'Swap',
      severity: 'info', event_key: 'swap_request:s1:2',
    })
    await notificationService.markRead(foreign.id)
    assert.equal(await notificationService.getUnreadCount(), 1)
    const [remaining] = await notificationService.getForCurrentUser()
    assert.equal(remaining.id, mine.id)
  } finally {
    restore()
  }
})
