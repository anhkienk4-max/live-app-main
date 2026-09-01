import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createAccountRequestGetHandler,
  createAccountRequestPostHandler,
} from '@/lib/server/accountRequestRouteHandler'

const migration = await readFile(
  new URL('../supabase/migrations/20260901190744_account_requests_foundation.sql', import.meta.url),
  'utf8',
)

const admin = { id: 'admin-auth', systemPermission: 'admin' as const }
const leader = { id: 'leader-auth', systemPermission: 'leader' as const }
const member = { id: 'member-auth', systemPermission: 'member' as const }

function post(body: unknown) {
  return new Request('http://localhost/api/account-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function get(query = '') {
  return new Request(`http://localhost/api/account-requests${query}`)
}

test('account_requests schema is additive and has no requester role fields', () => {
  assert.match(migration, /create table public\.account_requests/i)
  for (const column of ['id uuid primary key', 'email text not null', 'full_name text not null', 'phone text null', 'department text null', 'staff_id text null', 'auth_user_id uuid null']) {
    assert.match(migration, new RegExp(column.replace(/[()[\].]/g, '\\$&'), 'i'))
  }
  assert.doesNotMatch(migration, /requested_role|system_permission|\brole\s+text/i)
})

test('status and normalized pending-email constraints allow rejected/cancelled resubmission', () => {
  assert.match(migration, /status in \('pending', 'approved', 'rejected', 'cancelled'\)/i)
  assert.match(migration, /provisioning_status in \('not_started', 'in_progress', 'invited', 'linked', 'failed'\)/i)
  assert.match(migration, /create unique index account_requests_pending_email_uidx[\s\S]*lower\(btrim\(email\)\)[\s\S]*where status = 'pending'/i)
  assert.match(migration, /create index account_requests_status_submitted_at_idx[\s\S]*\(status, submitted_at desc\)/i)
  assert.match(migration, /create index account_requests_normalized_email_idx[\s\S]*lower\(btrim\(email\)\)/i)
  assert.doesNotMatch(migration, /where status in \('pending', 'rejected', 'cancelled'\)/i)
})

test('RLS and direct table grants fail closed', () => {
  assert.match(migration, /alter table public\.account_requests enable row level security/i)
  assert.match(migration, /revoke all on table public\.account_requests from public, anon, authenticated/i)
  assert.doesNotMatch(migration, /grant (select|insert|update|delete).*account_requests.*(anon|authenticated)/i)
})

test('submission RPC is SECURITY DEFINER, search-path hardened, narrowly granted, and has no provisioning writes', () => {
  assert.match(migration, /create or replace function public\.submit_account_request\(\s*p_email text,\s*p_full_name text,\s*p_phone text default null,\s*p_department text default null\s*\)/i)
  assert.match(migration, /submit_account_request[\s\S]*security definer[\s\S]*set search_path = ''/i)
  assert.match(migration, /revoke all on function public\.submit_account_request\(text, text, text, text\) from public/i)
  assert.match(migration, /grant execute on function public\.submit_account_request\(text, text, text, text\) to anon, authenticated/i)
  assert.doesNotMatch(migration, /insert into auth\.users|update auth\.users|delete from auth\.users/i)
  assert.doesNotMatch(migration, /insert into public\.business_users|update public\.business_users|delete from public\.business_users/i)
  assert.doesNotMatch(migration, /inviteUserByEmail|insert_notification|approve_staff_account|reject_staff_account/i)
})

test('submission RPC normalizes and validates input, and acknowledges conflict classes neutrally', () => {
  assert.match(migration, /lower\(btrim\(coalesce\(p_email, ''\)\)\)/i)
  assert.ok(migration.includes("v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'"))
  assert.match(migration, /active_linked_account|existing_staff|existing_auth|new/i)
  assert.match(migration, /on conflict do nothing/i)
  assert.equal((migration.match(/If your request is eligible, it has been recorded for review\./g) ?? []).length, 2)
  assert.doesNotMatch(migration, /p_role|p_system_permission|requested_role/i)
})

test('public submission boundary rejects role injection and returns identical acknowledgements', async () => {
  const submitted: unknown[] = []
  const handler = createAccountRequestPostHandler({
    service: {
      async submitAccountRequest(input) { submitted.push(input) },
      async listAccountRequests() { return [] },
      async getAccountRequest() { return null },
    },
  })

  const first = await handler(post({ email: 'new@example.com', full_name: 'New Person' }))
  const duplicate = await handler(post({ email: 'NEW@example.com', full_name: 'Other Name' }))
  assert.equal(first.status, 202)
  assert.equal(duplicate.status, 202)
  assert.deepEqual(await first.json(), await duplicate.json())
  assert.equal(submitted.length, 2)

  const roleAttempt = await handler(post({ email: 'role@example.com', full_name: 'Role Attempt', system_permission: 'admin' }))
  assert.equal(roleAttempt.status, 400)
  assert.equal(submitted.length, 2)
})

test('Admin read boundary allows Admin and denies Leader, Member, and anonymous callers', async () => {
  const handler = createAccountRequestGetHandler({
    resolveUser: async request => {
      const role = request.headers.get('x-test-role')
      return role === 'admin' ? admin : role === 'leader' ? leader : role === 'member' ? member : null
    },
    service: {
      async submitAccountRequest() {},
      async listAccountRequests() { return [] },
      async getAccountRequest() { return null },
    },
  })

  const adminRequest = get()
  adminRequest.headers.set('x-test-role', 'admin')
  assert.equal((await handler(adminRequest)).status, 200)

  for (const role of ['leader', 'member', null]) {
    const request = get()
    if (role) request.headers.set('x-test-role', role)
    assert.equal((await handler(request)).status, role ? 403 : 401)
  }
})

test('Admin read boundary supports pending list and detail without approval mutation', () => {
  assert.match(migration, /create or replace function public\.list_account_requests\(\s*p_status text default 'pending'/i)
  assert.match(migration, /create or replace function public\.get_account_request\(\s*p_request_id uuid/i)
  assert.match(migration, /perform private\.require_staff_admin\(\)/i)
  assert.doesNotMatch(migration, /create or replace function public\.(approve|reject)_account_request/i)
})

test('existing conflict handling leaves Auth/Staff identifiers null and preserves Google flow', () => {
  assert.match(migration, /Existing Staff-only and Auth-only identities are deliberately recorded\s+-- without identifiers/i)
  assert.match(migration, /staff_id text null/i)
  assert.match(migration, /auth_user_id uuid null/i)
  assert.doesNotMatch(migration, /update public\.business_users|insert into public\.business_users|update auth\.users|insert into auth\.users/i)
  assert.doesNotMatch(migration, /before_user_created_block_google|signInWithOAuth|google/i)
})
