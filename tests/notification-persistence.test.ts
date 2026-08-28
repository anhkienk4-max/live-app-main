import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { currentUserService } from '../lib/services/dataService.ts'
import { notificationEvents } from '../lib/services/notificationEventAdapter.ts'
import { notificationService } from '../lib/services/notificationService.ts'
import { createSupabaseNotificationRepository } from '../lib/services/supabaseNotificationService.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20260827110001_notifications_persistent_realtime.sql', import.meta.url),
  'utf8',
)

function repositoryDouble() {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = []
  const channel = {
    on() { return channel },
    subscribe(callback: () => void) { callback(); return channel },
  }
  const client = {
    from() {
      return {
        select() {
          return {
            order: async () => ({
              data: [{
                id: 'notification-1',
                user_id: null,
                recipient_id: 'member-1',
                type: 'shift',
                notification_type: 'staffing_approval',
                severity: 'success',
                title: 'Approved',
                message: 'Approved',
                related_entity_type: 'shift',
                related_entity_id: 'shift-1',
                action_url: '/calendar',
                event_key: 'staffing_approval:registration-1:member-1',
                read: false,
                read_at: null,
                created_at: '2031-08-20T00:00:00.000Z',
              }],
              error: null,
            }),
          }
        },
      }
    },
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args })
      return Promise.resolve({ data: null, error: null })
    },
    channel() { return channel },
    removeChannel() { return Promise.resolve('ok') },
  } as unknown as SupabaseClient
  return { repository: createSupabaseNotificationRepository(client), calls }
}

test('notification migration is additive and preserves legacy contract', () => {
  assert.match(migration, /create table if not exists public\.notifications/)
  assert.match(migration, /add column if not exists recipient_id/)
  assert.match(migration, /add column if not exists event_key/)
  assert.match(migration, /add column if not exists read_at/)
  assert.doesNotMatch(migration, /drop table public\.notifications/)
  assert.doesNotMatch(migration, /drop column .*notifications/)
  assert.match(migration, /set read_at = created_at\s+where read = true/)
  assert.match(migration, /old\.status in \('draft', 'reopened'\) and new\.status = 'in_review'/)
})

test('notification migration denies generic writes and exposes dedicated read-state RPCs', () => {
  assert.match(migration, /revoke all on table public\.notifications from anon, authenticated/)
  assert.match(migration, /grant select on table public\.notifications to authenticated/)
  assert.match(migration, /create policy notifications_select_own/)
  assert.match(migration, /create or replace function public\.mark_notification_read\(p_notification_id uuid\)/)
  assert.match(migration, /create or replace function public\.mark_all_notifications_read\(\)/)
  assert.match(migration, /revoke all on function private\.insert_notification/)
  assert.doesNotMatch(migration, /grant .*insert on table public\.notifications/)
})

test('Supabase notification repository uses persistent reads and dedicated read-state RPCs', async () => {
  const { repository, calls } = repositoryDouble()
  const items = await repository.getForCurrentUser()
  assert.equal(items[0].user_id, 'member-1')
  assert.equal(items[0].type, 'staffing_approval')
  assert.equal(items[0].read_at, null)
  await repository.markRead('notification-1')
  await repository.markAllRead()
  assert.deepEqual(calls.map(call => call.name), ['mark_notification_read', 'mark_all_notifications_read'])
  assert.equal(calls[0].args?.p_notification_id, 'notification-1')
})

test('Supabase realtime subscription is recipient-scoped and reconnect callback is callable', () => {
  let changes = 0
  const { repository } = repositoryDouble()
  const unsubscribe = repository.subscribe('member-1', () => { changes += 1 })
  assert.equal(changes, 1)
  unsubscribe()
})

test('production notification service fails closed instead of falling back to memory', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
    currentUserService.bindAuthenticatedUser({
      id: 'member-1', email: 'member@example.test', full_name: 'Member', role: 'staff', system_permission: 'member',
      operational_roles: ['host'], status: 'active', account_status: 'active', join_date: '2031-01-01',
      created_at: '2031-01-01T00:00:00.000Z', updated_at: '2031-01-01T00:00:00.000Z',
    })
    assert.throws(() => notificationService._create({
      user_id: 'member-1', type: 'system', title: 'x', message: 'x', severity: 'info', event_key: 'test:event',
    }), /explicit mock mode/)
  } finally {
    currentUserService.clearAuthenticatedUser()
    notificationService._resetForTests()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('mock event adapter deduplicates by deterministic event key', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    notificationService._resetForTests()
    const first = notificationEvents.staffingApproved('1', 'registration-1', 'shift-1')
    const second = notificationEvents.staffingApproved('1', 'registration-1', 'shift-1')
    assert.equal(first.id, second.id)
    assert.equal((await notificationService.getForCurrentUser()).length, 1)
  } finally {
    currentUserService.clearAuthenticatedUser()
    notificationService._resetForTests()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

