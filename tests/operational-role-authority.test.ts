import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { User } from '../lib/types/database.types.ts'
import { deriveShiftStaffIdentityMatch } from '../lib/utils/staffIdentityMatching.ts'

const user = (overrides: Partial<User> & Record<string, unknown> = {}): User => ({
  id: 'user-1',
  email: 'user@example.com',
  full_name: 'User',
  role: 'staff',
  system_permission: 'member',
  operational_roles: [],
  status: 'active',
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

test('operational role is the only staffing eligibility authority', () => {
  const candidates = deriveShiftStaffIdentityMatch('Alex', 'host', [
    user({ id: 'eligible', full_name: 'Alex', operational_roles: ['host'] }),
    user({ id: 'department-only', full_name: 'Alex', department: 'Live Host' }),
    user({ id: 'preference-only', full_name: 'Alex', preferred_roles: ['host'] }),
  ])

  assert.deepEqual(candidates.candidates.map(candidate => candidate.id), ['eligible'])
})

test('production candidate paths do not grant eligibility from profile metadata', () => {
  const sourceFiles = [
    '../lib/services/dataService.ts',
    '../components/features/swaps/SwapRequestFormModal.tsx',
    '../components/features/shifts/ShiftFormDialog.tsx',
    '../components/features/calendar/CalendarView.tsx',
  ]

  for (const relativePath of sourceFiles) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /department\s*===\s*['"]Live (Host|Support)['"]$/m)
  }

  const dataService = readFileSync(new URL('../lib/services/dataService.ts', import.meta.url), 'utf8')
  assert.match(dataService, /getByOperationalRole[\s\S]*?operational_roles\?\.includes\(role\)/)
})
