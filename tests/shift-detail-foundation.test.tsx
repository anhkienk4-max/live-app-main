import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  buildShiftStaffing,
  getShiftStatusClass,
  safeFormatShiftDate,
  ShiftDetailActions,
} from '../components/features/shifts/ShiftDetailModal.tsx'
import { resolveShiftDateTime } from '../lib/utils/shiftUtils.ts'
import type { Shift, ShiftRegistration, ShiftStatus, User } from '../lib/types/database.types.ts'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

const baseShift: Shift = {
  id: 'shift-s1-test',
  title: 'Overnight campaign live',
  date: '2026-08-11',
  start_time: '22:00',
  end_time: '02:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  host_id: 'host-1',
  technical_id: 'technical-1',
  required_host_count: 2,
  required_support_count: 1,
  required_technical_count: 1,
  status: 'scheduled',
  created_at: '2026-08-01T08:00:00.000Z',
  updated_at: '2026-08-02T09:00:00.000Z',
}

const user = (
  id: string,
  fullName: string,
  systemPermission: 'admin' | 'leader' | 'member' = 'member',
): User => ({
  id,
  email: `${id}@example.test`,
  full_name: fullName,
  role: systemPermission === 'member' ? 'staff' : systemPermission,
  system_permission: systemPermission,
  operational_roles: [],
  status: 'active',
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
})

const registration = (
  id: string,
  userId: string,
  role: 'host' | 'support' | 'technical',
  status: ShiftRegistration['status'],
): ShiftRegistration => ({
  id,
  shift_id: baseShift.id,
  user_id: userId,
  operational_role: role,
  status,
  source: 'self_registration',
  requested_at: '2026-08-01T10:00:00.000Z',
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: '2026-08-01T10:00:00.000Z',
})

test('Shift Detail aggregates direct and approved multi-person staffing without borrowing pending records', () => {
  const users = [
    user('host-1', 'Direct Host'),
    user('host-2', 'Approved Host'),
    user('support-1', 'Pending Support'),
    user('technical-1', 'Direct Technical'),
    user('technical-2', 'Manual Technical'),
  ]
  const staffing = buildShiftStaffing(baseShift, [
    registration('registration-host', 'host-2', 'host', 'approved'),
    registration('registration-support', 'support-1', 'support', 'pending'),
    registration('registration-technical', 'technical-2', 'technical', 'manually_assigned'),
  ], users)

  assert.deepEqual(staffing.host.map(item => item.user?.full_name), ['Direct Host', 'Approved Host'])
  assert.deepEqual(staffing.support, [])
  assert.deepEqual(staffing.technical.map(item => item.user?.full_name), ['Direct Technical', 'Manual Technical'])
  assert.equal(staffing.technical[1].status, 'manually_assigned')
})

test('Shift Detail de-duplicates a direct assignment represented by registration history', () => {
  const staffing = buildShiftStaffing(baseShift, [
    registration('registration-host', 'host-1', 'host', 'manually_assigned'),
  ], [user('host-1', 'Direct Host')])

  assert.equal(staffing.host.length, 1)
  assert.equal(staffing.host[0].status, 'manually_assigned')
})

test('overnight shift resolves to the next day with a positive duration', () => {
  const resolved = resolveShiftDateTime(baseShift.date, baseShift.start_time, baseShift.end_time)
  assert.ok(resolved?.valid)
  assert.equal(resolved.crossesMidnight, true)
  assert.equal(resolved.endDate, '2026-08-12')
  assert.equal(resolved.durationMinutes, 240)
})

test('safe date formatting never emits Invalid Date for partial records', () => {
  assert.equal(safeFormatShiftDate(undefined, 'PP', 'en', 'Not provided'), 'Not provided')
  assert.equal(safeFormatShiftDate('not-a-date', 'PP', 'en', 'Not provided'), 'Not provided')
  assert.doesNotMatch(safeFormatShiftDate('2026-08-11', 'PP', 'en', 'Not provided'), /Invalid Date/)
  assert.doesNotMatch(safeFormatShiftDate('2026-08-11', 'PP', 'vi', 'Chưa cung cấp'), /Invalid Date/)
})

test('status presentation covers only the six persisted Shift statuses', () => {
  const statuses: ShiftStatus[] = ['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled']
  assert.equal(new Set(statuses.map(getShiftStatusClass)).size, statuses.length)
  assert.ok(statuses.every(status => getShiftStatusClass(status).length > 0))
})

const renderActions = (currentUser: User, withEdit = true) => renderToStaticMarkup(React.createElement(ShiftDetailActions, {
  currentUser,
  busy: false,
  onEdit: withEdit ? () => undefined : undefined,
  onDelete: () => undefined,
  onClose: () => undefined,
  editLabel: 'Edit',
  deleteLabel: 'Delete',
  closeLabel: 'Close',
}))

test('Shift Detail actions remain permission-aware and never expose a fake edit action', () => {
  const memberMarkup = renderActions(user('member', 'Member', 'member'))
  assert.doesNotMatch(memberMarkup, /edit-shift-detail/)
  assert.doesNotMatch(memberMarkup, /delete-shift-detail/)

  const leaderMarkup = renderActions(user('leader', 'Leader', 'leader'))
  assert.match(leaderMarkup, /edit-shift-detail/)
  assert.doesNotMatch(leaderMarkup, /delete-shift-detail/)

  const adminMarkup = renderActions(user('admin', 'Admin', 'admin'))
  assert.match(adminMarkup, /edit-shift-detail/)
  assert.match(adminMarkup, /delete-shift-detail/)

  const unsupportedEditMarkup = renderActions(user('leader-no-edit-surface', 'Leader', 'leader'), false)
  assert.doesNotMatch(unsupportedEditMarkup, /edit-shift-detail/)
})

test('Calendar, Day Sessions, Shift List, compact and table surfaces share the canonical modal', () => {
  const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8')
  const calendar = read('components/features/calendar/CalendarView.tsx')
  const daySessions = read('components/features/calendar/DaySessionsDialog.tsx')
  const shiftList = read('components/features/shifts/ShiftList.tsx')
  const registrationBoard = read('components/features/calendar/ShiftRegistrationBoard.tsx')

  assert.match(calendar, /<ShiftDetailModal/)
  assert.match(calendar, /onShiftClick=\{setSelectedShift\}/)
  assert.match(daySessions, /day-session-view-shift-/)
  assert.match(shiftList, /<ShiftDetailModal/)
  assert.match(shiftList, /view-shift-\$\{row\.id\}/)
  assert.match(registrationBoard, /open-shift-detail-compact-/)
  assert.match(registrationBoard, /open-shift-detail-table-/)
  assert.doesNotMatch(registrationBoard, /onManage=\{\(\) => changeViewMode\('card'\)\}/)
})
