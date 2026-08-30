import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260830102222_core_v1_permission_rls_final.sql',
  'utf8',
)

const guarded = [
  ['approve_shift_registration', 'text, text, integer'],
  ['approve_shift_swap_request', 'text, text, integer'],
  ['cancel_own_shift_registration', 'text, text, integer'],
  ['cancel_own_shift_swap_request', 'text, text, integer'],
  ['manual_assign_imported_shift_staff', 'text, text, text, text, text, text, integer'],
  ['manual_assign_shift_staff', 'text, text, text, text, integer'],
  ['reject_shift_registration', 'text, text, integer'],
  ['reject_shift_swap_request', 'text, text, integer'],
  ['remove_shift_staffing', 'text, text, integer'],
  ['respond_shift_swap_request', 'text, text, text, integer'],
  ['restore_shift', 'text, integer'],
  ['set_shift_registration_lock', 'text, boolean, integer'],
  ['soft_delete_shift', 'text, text, integer'],
  ['update_shift', 'text, jsonb, boolean, integer'],
  ['update_shift_staffing_labels', 'text, text[], text[], text[], integer'],
] as const

test('permission migration revokes PUBLIC and anon from all guarded RPCs', () => {
  for (const [name, args] of guarded) {
    const escaped = `revoke all on function public\\.${name}\\(${args.replace(/[()[\].]/g, '\\$&')}\\) from public, anon;`
    assert.match(migration, new RegExp(escaped, 'i'), `${name} must be client-authenticated only`)
  }
  assert.doesNotMatch(migration, /grant execute on function public\.[^(]+\([^)]*\) to anon/i)
})

test('legacy pre-expected-version overloads are revoked from authenticated clients', () => {
  const legacyNames = [
    'approve_shift_registration',
    'approve_shift_swap_request',
    'cancel_own_shift_registration',
    'cancel_own_shift_swap_request',
    'manual_assign_imported_shift_staff',
    'manual_assign_shift_staff',
    'reject_shift_registration',
    'reject_shift_swap_request',
    'remove_shift_staffing',
    'respond_shift_swap_request',
    'restore_shift',
    'set_shift_registration_lock',
    'soft_delete_shift',
    'update_shift',
    'update_shift_staffing_labels',
  ]
  for (const name of legacyNames) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\([^;]+\\) from public, anon, authenticated;`, 'i'),
      `${name} legacy overload must remain unavailable`,
    )
  }
})

test('migration is grant-only security hardening and has no schema or data writes', () => {
  assert.doesNotMatch(migration, /create table|alter table|insert into|update public\.|delete from/i)
  assert.doesNotMatch(migration, /service_role.*grant execute/i)
})
