import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolveNotificationDestination } from '../lib/services/notificationRoutes'
import type { AppNotification } from '../lib/types/database.types'

const migration = readFileSync(
  new URL('../supabase/migrations/20261021190000_global_report_notification_transition_keys.sql', import.meta.url),
  'utf8',
)

function notice(action_url?: string): AppNotification {
  return {
    id: 'synthetic-notification',
    user_id: 'synthetic-member',
    type: 'report_submitted',
    severity: 'info',
    title: 'Report submitted',
    message: 'Ready for review',
    related_entity_type: 'report',
    related_entity_id: 'synthetic-report',
    action_url,
    read_at: null,
    created_at: '2026-10-21T00:00:00Z',
  }
}

test('report notifications link to the exact shift, not just the Reports landing page', () => {
  assert.equal(resolveNotificationDestination(notice('/reports?shiftId=shift-123_A')),
    '/reports?shiftId=shift-123_A')
  assert.equal(resolveNotificationDestination(notice('/reports')), '/reports')
})

test('deep link URL parser fails closed on additional parameters or off-site addresses', () => {
  for (const unsafe of [
    'https://example.org/reports?shiftId=1',
    '//example.org/reports?shiftId=1',
    '/reports?shiftId=shift-a&redirect=https://example.org',
    '/reports?shiftId=shift-a#fragment',
    '/reports?shiftId=%2F%2Fevil',
    '/reports?shiftId=shift a',
    '/reports?shiftId=',
    '/reports?shiftId=' + 'x'.repeat(129),
  ]) {
    assert.equal(resolveNotificationDestination(notice(unsafe)), '/reports', unsafe)
  }
})

test('lifecycle migration is additive and uses a versioned transition per recipient', () => {
  assert.match(migration, /create or replace function private\.emit_report_notification\(\)/i)
  assert.match(migration, /old\.version_number, 0\) \+ 1/i)
  assert.match(migration, /'report_submitted:' \|\| new\.id \|\| ':' \|\| transition_version/i)
  assert.match(migration, /event_type \|\| ':' \|\| new\.id \|\| ':' \|\| transition_version/i)
  assert.match(migration, /'\/reports\?shiftId=' \|\| new\.shift_id/)
  assert.match(migration, /revoke all on function private\.emit_report_notification\(\)/i)
  assert.doesNotMatch(migration, /drop (?:table|trigger|index)/i)
  assert.doesNotMatch(migration, /update public\.notifications/i)
})
