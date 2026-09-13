import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { isActiveBusinessUser } from '@/lib/utils/accountIdentity'

const migration = await readFile(
  new URL('../supabase/migrations/20260913130000_account_request_active_lifecycle.sql', import.meta.url),
  'utf8',
)
const provisioningService = await readFile(
  new URL('../lib/server/accountRequestProvisioningService.ts', import.meta.url),
  'utf8',
)
const requestPanel = await readFile(
  new URL('../components/features/staff/AccountRequestPanel.tsx', import.meta.url),
  'utf8',
)
const approveRoute = await readFile(
  new URL('../app/api/account-requests/[id]/approve/route.ts', import.meta.url),
  'utf8',
)
const provisionRoute = await readFile(
  new URL('../app/api/account-requests/[id]/provision/route.ts', import.meta.url),
  'utf8',
)

test('approved provisioning activates the reconciled business user without collapsing approval and provisioning', () => {
  assert.match(migration, /set status = 'active',[\s\S]*account_status = 'active'/i)
  assert.match(approveRoute, /createAccountRequestReviewPostHandler\('approve'\)/)
  assert.match(provisionRoute, /createAccountRequestProvisioningPostHandler\(\)/)
  assert.match(requestPanel, /action === 'provision'/)
  assert.doesNotMatch(provisioningService, /approveAccountRequest/)
  assert.equal(isActiveBusinessUser({ status: 'active', account_status: 'active' }), true)
})

test('confirmation state is read from Supabase Auth and never fabricated', () => {
  assert.match(migration, /auth_user\.email_confirmed_at is not null/g)
  assert.doesNotMatch(migration, /email_verified\s*=\s*true/i)
  assert.match(migration, /email_verified = v_email_verified/i)
  assert.match(migration, /email_verified = coalesce\(v_email_verified, email_verified\)/i)
})

test('terminal retries are idempotent, while partial failures never become terminal success', () => {
  assert.match(provisioningService, /if \(request\.provisioning_status === 'invited' \|\| request\.provisioning_status === 'linked'\)[\s\S]*return request/)
  assert.match(provisioningService, /await staff\.fail\([\s\S]*errorCode: normalized\.code/)
  assert.match(migration, /if v_request\.provisioning_status in \('invited', 'linked'\) then[\s\S]*return v_request/i)
})

test('already-linked records are backfilled only when the request, Staff, and Auth identity agree', () => {
  assert.match(migration, /from public\.account_requests as request_row[\s\S]*join auth\.users as auth_user on auth_user\.id = request_row\.auth_user_id/i)
  assert.match(migration, /request_row\.staff_id = business_user\.id[\s\S]*business_user\.auth_user_id = request_row\.auth_user_id/i)
  assert.match(migration, /business_user\.archived_at is null[\s\S]*business_user\.deleted_at is null[\s\S]*business_user\.account_status <> 'rejected'/i)
})

test('deactivated or rejected business users remain ineligible until the existing permitted reactivation path runs', () => {
  assert.equal(isActiveBusinessUser({ status: 'inactive', account_status: 'active' }), false)
  assert.equal(isActiveBusinessUser({ status: 'active', account_status: 'rejected' }), false)
  assert.match(migration, /business_user\.account_status <> 'rejected'/i)
})
