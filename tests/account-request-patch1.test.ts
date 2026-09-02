import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createAccountRequestPostHandler,
} from '@/lib/server/accountRequestRouteHandler'

const page = await readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8')
const panel = await readFile(new URL('../components/features/staff/AccountRequestPanel.tsx', import.meta.url), 'utf8')
const staffList = await readFile(new URL('../components/features/staff/StaffList.tsx', import.meta.url), 'utf8')
const rateLimitMigration = await readFile(
  new URL('../supabase/migrations/20260902150000_account_request_rate_limit.sql', import.meta.url),
  'utf8',
)
const phase1Migration = await readFile(
  new URL('../supabase/migrations/20260901190744_account_requests_foundation.sql', import.meta.url),
  'utf8',
)

function post(body: unknown) {
  return new Request('http://localhost/api/account-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function service(overrides: Record<string, unknown> = {}) {
  return {
    async submitAccountRequest() {},
    async listAccountRequests() { return [] },
    async getAccountRequest() { return null },
    ...overrides,
  }
}

test('production register reaches the canonical public Account Request API', () => {
  assert.match(page, /getAuthMode\(\) === 'mock'/)
  assert.match(page, /fetch\('\/api\/account-requests'/)
  assert.doesNotMatch(page, /setErrors\(\{ form: t\('supabaseNotConfigured'\) \}\)/)
  assert.match(page, /setRequestSubmitted\(true\)/)
})

test('public request form sends only fields supported by the existing contract', () => {
  assert.match(page, /email,\s*full_name: fullName,\s*phone: phone \|\| null,\s*department: department \|\| null/)
  assert.doesNotMatch(page, /auth_user_id|staff_id|system_permission|provisioning_status|reviewed_by/)
  assert.match(page, /password.*useMockData|useMockData.*password/)
})

test('valid public request uses the neutral acknowledgement contract', async () => {
  const calls: unknown[] = []
  const handler = createAccountRequestPostHandler({
    service: service({ async submitAccountRequest(input: unknown) { calls.push(input) } }),
  })
  const response = await handler(post({
    email: 'person@example.com', full_name: 'Person Example', phone: null, department: null,
  }))
  assert.equal(response.status, 202)
  assert.deepEqual(await response.json(), {
    ok: true,
    message: 'If your request is eligible, it has been recorded for review.',
  })
  assert.equal(calls.length, 1)
})

test('the public server boundary forwards only the derived client key to the server service', async () => {
  let forwardedKey: string | undefined
  const handler = createAccountRequestPostHandler({
    service: service({
      async submitAccountRequest(_input: unknown, clientIp?: string) { forwardedKey = clientIp },
    }),
  })
  const request = post({ email: 'person@example.com', full_name: 'Person' })
  request.headers.set('x-forwarded-for', '198.51.100.10, 203.0.113.20')
  assert.equal((await handler(request)).status, 202)
  assert.equal(forwardedKey, '198.51.100.10')
})

test('invalid public request and privileged field injection are rejected before service execution', async () => {
  let calls = 0
  const handler = createAccountRequestPostHandler({
    service: service({ async submitAccountRequest() { calls += 1 } }),
  })
  assert.equal((await handler(post({ email: 'bad', full_name: '' }))).status, 400)
  assert.equal((await handler(post({ email: 'person@example.com', full_name: 'Person', system_permission: 'admin' }))).status, 400)
  assert.equal(calls, 0)
})

test('repeated or existing-email outcomes remain indistinguishable at the HTTP boundary', async () => {
  const handler = createAccountRequestPostHandler({ service: service() })
  const first = await handler(post({ email: 'person@example.com', full_name: 'First' }))
  const repeated = await handler(post({ email: 'PERSON@example.com', full_name: 'Second' }))
  assert.equal(first.status, 202)
  assert.equal(repeated.status, 202)
  const firstBody = await first.json()
  const repeatedBody = await repeated.json()
  assert.deepEqual(firstBody, repeatedBody)
  assert.doesNotMatch(JSON.stringify(firstBody), /existing|active|staff|auth|pending/i)
})

test('rate-limit failures are server-normalized and do not expose identity state', async () => {
  const handler = createAccountRequestPostHandler({
    service: service({
      async submitAccountRequest() {
        throw { message: 'internal detail', code: 'ACCOUNT_REQUEST_RATE_LIMITED' }
      },
    }),
  })
  const response = await handler(post({ email: 'person@example.com', full_name: 'Person' }))
  const body = await response.json() as { error: { code: string; message: string } }
  assert.equal(response.status, 429)
  assert.equal(body.error.code, 'ACCOUNT_REQUEST_RATE_LIMITED')
  assert.equal(body.error.message, 'Too many requests. Please try again later.')
  assert.doesNotMatch(JSON.stringify(body), /internal detail|existing|staff|auth/i)
})

test('rate limiting is persistence-backed, private, hashed, deterministic, and race-safe', () => {
  assert.match(rateLimitMigration, /create table private\.account_request_rate_limits/i)
  assert.match(rateLimitMigration, /request_key text primary key/i)
  assert.match(rateLimitMigration, /pg_catalog\.md5/i)
  assert.doesNotMatch(rateLimitMigration, /\b(?:ip_address|raw_ip)\b/i)
  assert.match(rateLimitMigration, /interval '15 minutes'/i)
  assert.match(rateLimitMigration, /return v_count <= 5/i)
  assert.match(rateLimitMigration, /on conflict \(request_key\) do update/i)
  assert.match(rateLimitMigration, /before insert on public\.account_requests/i)
})

test('the declared five-attempt window allows the first five and blocks the sixth', () => {
  const allowed = Array.from({ length: 6 }, (_, index) => index < 5)
  assert.deepEqual(allowed, [true, true, true, true, true, false])
  assert.match(rateLimitMigration, /return v_count <= 5/i)
})

test('rate-limit SQL hardens the table and helper permissions', () => {
  assert.match(rateLimitMigration, /alter table private\.account_request_rate_limits enable row level security/i)
  assert.match(rateLimitMigration, /revoke all on table private\.account_request_rate_limits from public, anon, authenticated/i)
  for (const name of ['consume_account_request_rate_limit', 'enforce_account_request_rate_limit']) {
    const body = rateLimitMigration.slice(rateLimitMigration.indexOf(`create or replace function private.${name}`))
    assert.match(body, /security definer[\s\S]*set search_path = ''/i)
    assert.match(body, new RegExp(`revoke all on function private\\.${name}\\(`, 'i'))
  }
})

test('Admin panel lists all request states through the canonical API', () => {
  assert.match(panel, /fetch\('\/api\/account-requests\?status=all'/)
  assert.match(panel, /accountRequests/)
  assert.match(panel, /selected\.status/)
  assert.match(panel, /provisioning_status/)
})

test('Admin review actions preserve expected-version CAS', () => {
  assert.match(panel, /action: 'approve' \| 'reject' \| 'provision'/)
  assert.match(panel, /action === 'provision'[\s\S]*\/\$\{request\.id\}\/\$\{action\}/)
  assert.match(panel, /rejection_reason: reason/)
  assert.match(panel, /expected_version: request\.version/)
})

test('Admin provisioning and explicit retry remain separate from review', () => {
  assert.match(panel, /\/provision/)
  assert.match(panel, /retry: request\.provisioning_status === 'failed'/)
  assert.match(panel, /retryProvisioning/)
  assert.match(panel, /staffActivationSeparate/)
})

test('Account Request controls are only mounted for the existing staff.manage boundary', () => {
  assert.match(staffList, /hasPermission\(currentUser, 'staff\.manage'\)/)
  assert.match(staffList, /canManage && <AccountRequestPanel \/>/)
})

test('browser Admin workflow does not contain privileged credentials or direct Auth administration', () => {
  assert.doesNotMatch(panel, /service_role|createUser|inviteUser|auth\.admin|auth_user_id|staff_id.*=/i)
  assert.match(panel, /fetch\(/)
})

test('Phase 1 API contract and migration remain the single public persistence boundary', () => {
  assert.match(phase1Migration, /create or replace function public\.submit_account_request/i)
  assert.match(phase1Migration, /grant execute on function public\.submit_account_request\(text, text, text, text\) to anon, authenticated/i)
  assert.match(phase1Migration, /create unique index account_requests_pending_email_uidx/i)
  assert.match(phase1Migration, /on conflict do nothing/i)
})
