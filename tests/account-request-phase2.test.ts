import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import type { AccountRequestService } from '@/lib/server/accountRequestService'
import { createAccountRequestReviewPostHandler } from '@/lib/server/accountRequestRouteHandler'

const migration = await readFile(
  new URL('../supabase/migrations/20260902110000_account_request_review.sql', import.meta.url),
  'utf8',
)
const adminGuardMigration = await readFile(
  new URL('../supabase/migrations/20260823120000_s2b_staff_management_writes.sql', import.meta.url),
  'utf8',
)
const canonicalAuditMigration = await readFile(
  new URL('../supabase/migrations/20260830113000_core_v1_persistent_audit.sql', import.meta.url),
  'utf8',
)

const requestId = '11111111-1111-4111-8111-111111111111'
const admin = { id: 'admin-auth', systemPermission: 'admin' as const }
const leader = { id: 'leader-auth', systemPermission: 'leader' as const }
const member = { id: 'member-auth', systemPermission: 'member' as const }

function reviewRequest(action: 'approve' | 'reject', body: unknown, role?: string, id = requestId) {
  const request = new Request(`http://localhost/api/account-requests/${id}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (role) request.headers.set('x-test-role', role)
  return request
}

function serviceWith(overrides: Partial<AccountRequestService> = {}): AccountRequestService {
  return {
    async submitAccountRequest() {},
    async listAccountRequests() { return [] },
    async getAccountRequest() { return null },
    async approveAccountRequest() {
      return { id: requestId, version: 1 } as never
    },
    async rejectAccountRequest() {
      return { id: requestId, version: 1 } as never
    },
    ...overrides,
  }
}

function extractAuditFunction(sql: string): string {
  const start = sql.indexOf('create or replace function private.capture_audit_row_change()')
  assert.notEqual(start, -1)
  const end = sql.indexOf('$$;', start)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

function normalizeExpectedPhase2AuditAdditions(sql: string): string {
  return sql
    .replace(/before_row := private\.audit_sanitize_row\(case when tg_op (?:= 'DELETE'|<> 'INSERT') then to_jsonb\(old\) else null end\);/, 'before_row := <canonical-before-row>;')
    .replace(/      when 'account_requests' then 'staff'\r?\n/, '')
    .replace(
      /    action_value, case when tg_table_name = 'account_requests' then 'account_requests' else replace\(tg_table_name, '_', ' '\) end,\r?\n    entity_id_value, entity_name_value,/,
      "    action_value, replace(tg_table_name, '_', ' '), entity_id_value, entity_name_value,",
    )
    .replace(
      /coalesce\(after_row->>'deletion_reason', after_row->>'rejection_reason', after_row->>'review_notes'\)|coalesce\(after_row->>'deletion_reason', after_row->>'review_notes'\)/,
      "coalesce(after_row->>'deletion_reason', after_row->>'review_notes')",
    )
}

test('review schema adds a server-controlled version and closed review state', () => {
  assert.match(migration, /alter table public\.account_requests[\s\S]*add column version integer not null default 0/i)
  assert.match(migration, /account_requests_version_nonnegative_check[\s\S]*check \(version >= 0\)/i)
  assert.match(migration, /status = 'approved'[\s\S]*provisioning_status = 'not_started'[\s\S]*version = request_row\.version \+ 1/i)
  assert.match(migration, /status = 'rejected'[\s\S]*provisioning_status = 'not_started'[\s\S]*version = request_row\.version \+ 1/i)
  assert.doesNotMatch(migration, /p_reviewed_by|p_role|p_system_permission/i)
})

test('approve and reject RPCs have the required hardened signatures', () => {
  assert.match(migration, /create or replace function public\.approve_account_request\(\s*p_request_id uuid,\s*p_expected_version integer\s*\)[\s\S]*returns public\.account_requests/i)
  assert.match(migration, /create or replace function public\.reject_account_request\(\s*p_request_id uuid,\s*p_expected_version integer,\s*p_rejection_reason text\s*\)[\s\S]*returns public\.account_requests/i)
  for (const functionName of ['approve_account_request', 'reject_account_request']) {
    const functionBody = migration.slice(migration.indexOf(`create or replace function public.${functionName}`))
    assert.match(functionBody, /language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i)
    assert.match(functionBody, /private\.require_staff_admin\(\)/i)
    assert.match(functionBody, /for update/i)
  }
})

test('review RPC permissions are authenticated-execute only', () => {
  assert.match(migration, /revoke all on function public\.approve_account_request\(uuid, integer\) from public, anon, authenticated/i)
  assert.match(migration, /grant execute on function public\.approve_account_request\(uuid, integer\) to authenticated/i)
  assert.match(migration, /revoke all on function public\.reject_account_request\(uuid, integer, text\) from public, anon, authenticated/i)
  assert.match(migration, /grant execute on function public\.reject_account_request\(uuid, integer, text\) to authenticated/i)
})

test('cancelled requests are explicitly rejected by both review routes', async () => {
  for (const action of ['approve', 'reject'] as const) {
    const handler = createAccountRequestReviewPostHandler(action, {
      resolveUser: async () => admin,
      service: serviceWith({
        ...(action === 'approve'
          ? { async approveAccountRequest() { throw { code: 'ACCOUNT_REQUEST_NOT_PENDING' } } }
          : { async rejectAccountRequest() { throw { code: 'ACCOUNT_REQUEST_NOT_PENDING' } } }),
      }),
    })
    const body = action === 'approve'
      ? { expected_version: 0 }
      : { expected_version: 0, rejection_reason: 'cancelled fixture' }
    const response = await handler(reviewRequest(action, body, 'admin'), requestId)
    const result = await response.json() as { error: { code: string } }
    assert.equal(response.status, 409)
    assert.equal(result.error.code, 'ACCOUNT_REQUEST_NOT_PENDING')
  }
})

test('reviewed_by is explicitly sourced through the canonical Admin identity chain', () => {
  assert.match(adminGuardMigration, /v_actor_id := private\.current_business_user_id\(\)/i)
  for (const functionName of ['approve_account_request', 'reject_account_request']) {
    const body = migration.slice(migration.indexOf(`create or replace function public.${functionName}`))
    assert.match(body, /v_actor_id := private\.require_staff_admin\(\)/i)
    assert.match(body, /reviewed_by = v_actor_id/i)
  }
})

test('reviewed_by is rejected explicitly from both HTTP review payloads', async () => {
  for (const action of ['approve', 'reject'] as const) {
    const handler = createAccountRequestReviewPostHandler(action, {
      resolveUser: async () => admin,
      service: serviceWith(),
    })
    const body = action === 'approve'
      ? { expected_version: 0, reviewed_by: 'client-controlled' }
      : { expected_version: 0, rejection_reason: 'invalid payload', reviewed_by: 'client-controlled' }
    const response = await handler(reviewRequest(action, body, 'admin'), requestId)
    assert.equal(response.status, 400)
  }
})

test('reviewed_by is not an RPC parameter', () => {
  assert.doesNotMatch(migration, /p_reviewed_by/i)
  assert.match(migration, /approve_account_request\(\s*p_request_id uuid,\s*p_expected_version integer/i)
  assert.match(migration, /reject_account_request\(\s*p_request_id uuid,\s*p_expected_version integer,\s*p_rejection_reason text/i)
})

test('approve route sends only request id and expected version to the service', async () => {
  const calls: unknown[] = []
  const handler = createAccountRequestReviewPostHandler('approve', {
    resolveUser: async () => admin,
    service: serviceWith({
      async approveAccountRequest(id, version) {
        calls.push([id, version])
        return { id, version: version + 1 } as never
      },
    }),
  })
  const rejected = await handler(reviewRequest('approve', { expected_version: 0, reviewed_by: 'attacker', system_permission: 'admin' }, 'admin'), requestId)
  assert.equal(rejected.status, 400)
  assert.deepEqual(calls, [])

  const response = await handler(reviewRequest('approve', { expected_version: 0 }, 'admin'), requestId)
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [[requestId, 0]])
})

test('reject route trims through the request contract and never accepts caller actor data', async () => {
  let call: unknown[] = []
  const handler = createAccountRequestReviewPostHandler('reject', {
    resolveUser: async () => admin,
    service: serviceWith({
      async rejectAccountRequest(id, version, reason) {
        call = [id, version, reason]
        return { id, version: version + 1, rejection_reason: reason } as never
      },
    }),
  })
  const response = await handler(reviewRequest('reject', { expected_version: 4, rejection_reason: '  duplicate  ', reviewed_by: 'attacker' }, 'admin'), requestId)
  assert.equal(response.status, 400)
  assert.deepEqual(call, [])

  const valid = await handler(reviewRequest('reject', { expected_version: 4, rejection_reason: '  duplicate  ' }, 'admin'), requestId)
  assert.equal(valid.status, 200)
  assert.deepEqual(call, [requestId, 4, 'duplicate'])
})

test('Admin succeeds while Leader, Member, and anonymous callers are denied', async () => {
  const service = serviceWith()
  for (const [role, expectedStatus] of [['admin', 200], ['leader', 403], ['member', 403], [undefined, 401]] as const) {
    const handler = createAccountRequestReviewPostHandler('approve', {
      resolveUser: async () => role === 'admin' ? admin : role === 'leader' ? leader : role === 'member' ? member : null,
      service,
    })
    assert.equal((await handler(reviewRequest('approve', { expected_version: 0 }, role), requestId)).status, expectedStatus)
  }
})

test('known review errors map to safe responses without raw database text', async () => {
  for (const [code, status] of [
    ['ACCOUNT_REQUEST_NOT_FOUND', 404],
    ['ACCOUNT_REQUEST_NOT_PENDING', 409],
    ['ACCOUNT_REQUEST_REVIEW_STALE', 409],
    ['ACCOUNT_REQUEST_REJECTION_REASON_REQUIRED', 400],
    ['ACCOUNT_REQUEST_REJECTION_REASON_TOO_LONG', 400],
  ] as const) {
    const handler = createAccountRequestReviewPostHandler('approve', {
      resolveUser: async () => admin,
      service: serviceWith({
        async approveAccountRequest() { throw { message: 'database detail must not escape', code } },
      }),
    })
    const response = await handler(reviewRequest('approve', { expected_version: 0 }, 'admin'), requestId)
    const body = await response.json() as { error: { code: string; message: string } }
    assert.equal(response.status, status)
    assert.equal(body.error.code, code)
    assert.doesNotMatch(body.error.message, /database detail/i)
  }
})

test('state machine is lock-based, CAS guarded, terminal-idempotent, and race deterministic', () => {
  assert.match(migration, /select request_row\.\*[\s\S]*from public\.account_requests as request_row[\s\S]*for update/i)
  assert.match(migration, /if v_request\.status = 'approved' then[\s\S]*return v_request/i)
  assert.match(migration, /if v_request\.status = 'rejected' then[\s\S]*return v_request/i)
  assert.match(migration, /if v_request\.status <> 'pending' then[\s\S]*ACCOUNT_REQUEST_NOT_PENDING/i)
  assert.match(migration, /p_expected_version is null or p_expected_version <> v_request\.version[\s\S]*ACCOUNT_REQUEST_REVIEW_STALE/i)
  assert.match(migration, /where request_row\.id = p_request_id[\s\S]*request_row\.status = 'pending'[\s\S]*request_row\.version = p_expected_version/i)
  assert.equal((migration.match(/version = request_row\.version \+ 1/g) ?? []).length, 2)
})

test('rejection reason is required, trimmed, and capped at 1000 characters', () => {
  assert.match(migration, /v_reason := btrim\(coalesce\(p_rejection_reason, ''\)\)/i)
  assert.match(migration, /v_reason = ''[\s\S]*ACCOUNT_REQUEST_REJECTION_REASON_REQUIRED/i)
  assert.match(migration, /char_length\(v_reason\) > 1000[\s\S]*ACCOUNT_REQUEST_REJECTION_REASON_TOO_LONG/i)
})

test('review writes preserve Auth/Staff identifiers and stop before provisioning', () => {
  const reviewSql = migration.slice(0, migration.indexOf('create or replace function private.capture_audit_row_change'))
  assert.doesNotMatch(reviewSql, /insert into auth\.users|update auth\.users|delete from auth\.users/i)
  assert.doesNotMatch(reviewSql, /insert into public\.business_users|update public\.business_users|delete from public\.business_users/i)
  assert.doesNotMatch(reviewSql, /inviteUserByEmail|link_staff_auth_user|create_staff_member|approve_staff_account|reject_staff_account|google/i)
  for (const functionName of ['approve_account_request', 'reject_account_request']) {
    const body = reviewSql.slice(reviewSql.indexOf(`create or replace function public.${functionName}`), reviewSql.indexOf('revoke all on function public.approve_account_request'))
    assert.doesNotMatch(body, /staff_id\s*=|auth_user_id\s*=/i)
    assert.match(body, /provisioning_status = 'not_started'/i)
  }
})

test('audit coverage reuses the canonical trigger and records account-request review state', () => {
  assert.match(migration, /create or replace function private\.capture_audit_row_change\(\)/i)
  assert.match(migration, /when 'account_requests' then 'staff'/i)
  assert.match(migration, /case when tg_table_name = 'account_requests' then 'account_requests'/i)
  assert.match(migration, /coalesce\(after_row->>'deletion_reason', after_row->>'rejection_reason', after_row->>'review_notes'\)/i)
  assert.match(migration, /create trigger audit_account_requests_change[\s\S]*after insert or update or delete on public\.account_requests/i)
  assert.match(migration, /private\.audit_action_for_change\(tg_table_name, tg_op, before_row, after_row\)/i)
})

test('audit replacement preserves the entire canonical function except intended Phase 2 additions', () => {
  const canonicalAudit = extractAuditFunction(canonicalAuditMigration)
  const phase2Audit = extractAuditFunction(migration)
  assert.equal(normalizeExpectedPhase2AuditAdditions(phase2Audit), normalizeExpectedPhase2AuditAdditions(canonicalAudit))
})

test('audit row snapshots preserve INSERT, UPDATE, and DELETE semantics', () => {
  const audit = extractAuditFunction(migration)
  assert.match(audit, /before_row := private\.audit_sanitize_row\(case when tg_op <> 'INSERT' then to_jsonb\(old\) else null end\)/i)
  assert.match(audit, /after_row := private\.audit_sanitize_row\(case when tg_op <> 'DELETE' then to_jsonb\(new\) else null end\)/i)
  assert.match(audit, /if tg_op = 'DELETE' then[\s\S]*return old/i)
  assert.match(audit, /return new/i)
})

test('existing audit mappings remain unchanged and account requests add only the intended mappings', () => {
  const canonicalAudit = extractAuditFunction(canonicalAuditMigration)
  const phase2Audit = extractAuditFunction(migration)
  for (const mapping of [
    "when 'shifts' then 'calendar'",
    "when 'reports' then 'reports'",
    "when 'swap_requests' then 'swaps'",
    "when 'schedule_import_batches' then 'imports'",
    "when 'business_users' then 'staff'",
    "when 'brands' then 'brands'",
    "when 'platforms' then 'platforms'",
    "when 'campaigns' then 'campaigns'",
  ]) {
    assert.equal(phase2Audit.includes(mapping), canonicalAudit.includes(mapping), mapping)
  }
  assert.match(phase2Audit, /when 'account_requests' then 'staff'/i)
  assert.match(phase2Audit, /case when tg_table_name = 'account_requests' then 'account_requests' else replace\(tg_table_name, '_', ' '\) end/i)
  assert.match(phase2Audit, /coalesce\(after_row->>'deletion_reason', after_row->>'rejection_reason', after_row->>'review_notes'\)/i)
})

test('approve and reject transitions expose pending before status and terminal after status to the audit trigger', () => {
  const audit = extractAuditFunction(migration)
  assert.match(audit, /before_row[\s\S]*after_row/i)
  assert.match(migration, /set status = 'approved'[\s\S]*provisioning_status = 'not_started'/i)
  assert.match(migration, /set status = 'rejected'[\s\S]*provisioning_status = 'not_started'/i)
  assert.match(migration, /create trigger audit_account_requests_change[\s\S]*after insert or update or delete on public\.account_requests/i)
  assert.match(migration, /if v_request\.status <> 'pending'/i)
})

test('submission notification is persistent, Admin-only, scoped, and deduplicated', () => {
  assert.match(migration, /create or replace function private\.emit_account_request_notification\(\)/i)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i)
  assert.match(migration, /system_permission = 'admin'[\s\S]*status = 'active'[\s\S]*account_status = 'active'/i)
  assert.doesNotMatch(migration.slice(migration.indexOf('create or replace function private.emit_account_request_notification')), /system_permission in \('leader', 'admin'\)/i)
  assert.match(migration, /'account_request_submitted'/i)
  assert.match(migration, /account_request_submitted:' \|\| new\.id::text \|\| ':' \|\| recipient_id/i)
  assert.match(migration, /private\.insert_notification\([\s\S]*account_request_submitted:/i)
  assert.match(migration, /create trigger account_requests_notification_events[\s\S]*after insert on public\.account_requests/i)
})

test('notification trigger cannot notify requester, Leader, or Member and is not caller-controlled', () => {
  const body = migration.slice(migration.indexOf('create or replace function private.emit_account_request_notification'))
  assert.doesNotMatch(body, /p_recipient|p_email|requester/i)
  assert.match(body, /business_user\.system_permission = 'admin'/i)
  assert.doesNotMatch(body, /'leader'|'member'/i)
  assert.match(migration, /revoke all on function private\.emit_account_request_notification\(\) from public, anon, authenticated/i)
})

test('Phase 1 submission boundary remains neutral and unchanged', async () => {
  const phase1 = await readFile(
    new URL('../supabase/migrations/20260901190744_account_requests_foundation.sql', import.meta.url),
    'utf8',
  )
  assert.match(phase1, /grant execute on function public\.submit_account_request\(text, text, text, text\) to anon, authenticated/i)
  assert.match(phase1, /on conflict do nothing/i)
  assert.doesNotMatch(phase1, /approve_account_request|reject_account_request|account_request_notification/i)
})
