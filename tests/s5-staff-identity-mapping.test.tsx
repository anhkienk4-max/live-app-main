import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ImportedStaffIdentityMapping } from '../components/features/shifts/ShiftDetailModal.tsx'
import type { Shift, ShiftRegistration, User } from '../lib/types/database.types.ts'
import {
  deriveShiftStaffIdentityMatch,
  normalizeStaffIdentityName,
} from '../lib/utils/staffIdentityMatching.ts'

const { createElement } = React
;(globalThis as typeof globalThis & { React: typeof React }).React = React

const user = (id: string, fullName: string, overrides: Partial<User> = {}): User => ({
  id,
  email: `${id}@example.test`,
  full_name: fullName,
  role: 'staff',
  system_permission: 'member',
  operational_roles: ['host'],
  status: 'active',
  join_date: '2031-01-01',
  created_at: '2031-01-01T00:00:00.000Z',
  updated_at: '2031-01-01T00:00:00.000Z',
  ...overrides,
})

const shift: Shift = {
  id: 'shift-s5',
  date: '2031-09-01',
  start_time: '09:00',
  end_time: '11:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  host_names: ['Hương'],
  assistant_names: ['An'],
  technical_names: [],
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 1,
  status: 'scheduled',
  created_at: '2031-09-01T00:00:00.000Z',
  updated_at: '2031-09-01T00:00:00.000Z',
}

test('identity normalization is accent-insensitive and whitespace-stable', () => {
  assert.equal(normalizeStaffIdentityName('  Đặng   Hương  '), 'dang huong')
  assert.equal(normalizeStaffIdentityName('DANG HUONG'), 'dang huong')
})

test('exact matching wins before normalized matching', () => {
  const exact = user('exact', 'Ánh')
  const normalizedCollision = user('normalized-collision', 'Anh')
  const result = deriveShiftStaffIdentityMatch('ÁNH', 'host', [exact, normalizedCollision])

  assert.equal(result.status, 'candidate')
  assert.equal(result.method, 'exact')
  assert.equal(result.suggestedUser?.id, exact.id)
})

test('one normalized candidate is suggested but never persisted or auto-assigned', () => {
  const candidate = user('candidate', 'Hương')
  const result = deriveShiftStaffIdentityMatch('Huong', 'host', [candidate])

  assert.equal(result.status, 'candidate')
  assert.equal(result.method, 'normalized')
  assert.equal(result.suggestedUser?.id, candidate.id)
  assert.equal('user_id' in result, false)
  assert.equal('registration' in result, false)
})

test('ambiguous, unmatched, inactive and wrong-role users are derived without fuzzy matching', () => {
  const ambiguous = deriveShiftStaffIdentityMatch('Huong', 'host', [
    user('one', 'Hương'),
    user('two', 'Hưởng'),
  ])
  assert.equal(ambiguous.status, 'ambiguous')
  assert.deepEqual(ambiguous.candidates.map(candidate => candidate.id), ['one', 'two'])

  const unmatched = deriveShiftStaffIdentityMatch('Hương Nguyễn', 'host', [
    user('reordered', 'Nguyễn Hương'),
    user('inactive', 'Hương Nguyễn', { status: 'inactive' }),
    user('wrong-role', 'Hương Nguyễn', { operational_roles: ['support'] }),
  ])
  assert.equal(unmatched.status, 'unmatched')
  assert.equal(unmatched.candidates.length, 0)
})

test('mapping UI keeps schedule labels and canonical assignment visibly distinct', () => {
  const users = [
    user('host-1', 'Hương'),
    user('support-1', 'An', { operational_roles: ['support'] }),
  ]
  const registration: ShiftRegistration = {
    id: 'reg-s5',
    shift_id: shift.id,
    user_id: 'host-1',
    operational_role: 'host',
    status: 'manually_assigned',
    source: 'manual_assignment',
    requested_at: '2031-09-01T00:00:00.000Z',
    reviewed_by: 'leader-1',
    reviewed_at: '2031-09-01T00:01:00.000Z',
    imported_name: 'Hương',
    match_method: 'exact',
    created_at: '2031-09-01T00:00:00.000Z',
    updated_at: '2031-09-01T00:01:00.000Z',
  }
  const markup = renderToStaticMarkup(createElement(ImportedStaffIdentityMapping, {
    busy: false,
    canAssign: false,
    onAssign: async () => undefined,
    registrations: [registration],
    shift,
    t: (key: string) => key,
    users,
  }))

  assert.match(markup, /shift-imported-staff-identity-mapping/)
  assert.match(markup, /scheduleStaffingName/)
  assert.match(markup, />Hương</)
  assert.match(markup, /actualAssignment: Hương/)
  assert.match(markup, /staffMatchAssigned/)
})

test('a unique candidate is only suggested until a Leader/Admin confirms it', () => {
  const candidateOnlyShift = { ...shift, assistant_names: [] }
  const candidate = user('host-1', 'Hương')
  const memberMarkup = renderToStaticMarkup(createElement(ImportedStaffIdentityMapping, {
    busy: false,
    canAssign: false,
    onAssign: async () => undefined,
    registrations: [],
    shift: candidateOnlyShift,
    t: (key: string) => key,
    users: [candidate],
  }))
  const managerMarkup = renderToStaticMarkup(createElement(ImportedStaffIdentityMapping, {
    busy: false,
    canAssign: true,
    onAssign: async () => undefined,
    registrations: [],
    shift: candidateOnlyShift,
    t: (key: string) => key,
    users: [candidate],
  }))

  assert.match(memberMarkup, /staffMatchCandidate/)
  assert.match(memberMarkup, /suggestedCandidate: Hương/)
  assert.doesNotMatch(memberMarkup, /staffMatchAssigned/)
  assert.doesNotMatch(memberMarkup, /-confirm"/)
  assert.match(managerMarkup, /host:0:Hương-confirm/)
  assert.doesNotMatch(managerMarkup, /staffMatchAssigned/)
})

test('S5 migration is additive, hardened and uses a dedicated imported-assignment RPC', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260822160308_s5_staff_identity_mapping.sql', import.meta.url),
    'utf8',
  )
  const rpc = sql.match(
    /create or replace function public\.manual_assign_imported_shift_staff\([\s\S]*?\n\$\$;/i,
  )?.[0] ?? ''

  assert.match(sql, /add column if not exists imported_name text null/i)
  assert.match(sql, /add column if not exists match_method text null/i)
  assert.match(sql, /match_method is null or match_method in \('exact', 'normalized', 'manual'\)/i)
  assert.match(sql, /create or replace function public\.manual_assign_imported_shift_staff/i)
  assert.match(rpc, /security definer\s+set search_path = ''/i)
  assert.match(rpc, /private\.require_shift_actor\(true\)/i)
  assert.match(rpc, /private\.insert_manual_shift_assignment\(/i)
  assert.match(rpc, /update public\.shift_registrations/i)
  assert.match(rpc, /imported_name = btrim\(p_imported_name\)/i)
  assert.match(rpc, /match_method = p_match_method/i)
  assert.doesNotMatch(rpc, /update public\.shifts/i)
  assert.match(sql, /revoke all on function public\.manual_assign_imported_shift_staff\(text, text, text, text, text, text\)\s+from public, anon, authenticated/i)
  assert.match(sql, /grant execute on function public\.manual_assign_imported_shift_staff\(text, text, text, text, text, text\)\s+to authenticated/i)
  assert.doesNotMatch(sql, /add column if not exists (unmatched|candidate|ambiguous)/i)
})

test('runtime and UI use the dedicated imported staffing assignment path', () => {
  const repositorySource = readFileSync(
    new URL('../lib/services/supabaseShiftRegistrationService.ts', import.meta.url),
    'utf8',
  )
  const detailSource = readFileSync(
    new URL('../components/features/shifts/ShiftDetailModal.tsx', import.meta.url),
    'utf8',
  )

  assert.match(repositorySource, /async assignImported\([\s\S]*?client\.rpc\('manual_assign_imported_shift_staff'/)
  assert.match(detailSource, /deriveShiftStaffIdentityMatches/)
  assert.match(detailSource, /shiftRegistrationService\.assignImported\(/)
  assert.match(detailSource, /canAssign=\{canAssignStaff\}/)
})
