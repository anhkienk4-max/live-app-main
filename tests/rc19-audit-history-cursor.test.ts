import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createSupabaseAuditRepository } from '../lib/services/supabaseAuditService'

const migration = readFileSync('supabase/migrations/20261112120000_rc19_audit_history_keyset.sql', 'utf8')

test('C12 migration uses an invoker RPC, RLS, bounded keyset pages and authenticated-only execute', () => {
  assert.match(migration, /create index if not exists audit_logs_cursor_created_at_id_idx[\s\S]*\(created_at desc, id desc\)/i)
  assert.match(migration, /C12_AUDIT_POLICY_DEFINITION_DRIFT/u)
  assert.match(migration, /C12_AUDIT_PERMISSION_VOLATILITY_DRIFT/u)
  assert.match(migration, /'brand_id'[\s\S]*a\.after_data->>'brand_id'[\s\S]*a\.before_data->>'brand_id'/u)
  assert.match(migration, /alter policy audit_logs_read on public\.audit_logs using\s*\([\s\S]*\(select private\.rbac_has_permission\('audit\.view'\)\)[\s\S]*module in \('calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports'\)/iu)
  assert.match(migration, /security invoker/i)
  assert.match(migration, /set search_path = ''/i)
  assert.match(migration, /grant execute on function public\.get_audit_history_page[\s\S]*to authenticated/i)
  assert.match(migration, /revoke all on function public\.get_audit_history_page[\s\S]*from public, anon, service_role/i)
  assert.match(migration, /limit p_page_size \+ 1/i)
  assert.match(migration, /p_page_size is null[\s\S]*p_sort is null/i)
  assert.match(migration, /datetime_field_overflow or invalid_datetime_format/i)
  assert.doesNotMatch(migration, /\boffset\b|count\(\*\)\s+from\s+public\.audit_logs/i)
  assert.match(migration, /v_to - v_from > 365/i)
  assert.match(migration, /p_cursor_created_at, p_cursor_id/i)
})

test('C12 authenticated RPC response becomes a bounded page without actor-directory scans', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: {
        items: [], has_more: true, page_size: 20,
        next_cursor: { created_at: '2026-11-12T00:00:00Z', id: 'audit-20', snapshot_at: '2026-11-12T00:01:00Z' },
        range: { from: '2026-10-14', to: '2026-11-12' },
      }, error: null }
    },
  }
  const repository = createSupabaseAuditRepository(client as never)
  const page = await repository.getAuditHistoryPage({
    pageSize: 20,
    filters: { module: ['calendar', 'all'], brand_id: 'brand-a', query: 'shift' },
    sort: 'newest',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.name, 'get_audit_history_page')
  assert.deepEqual(calls[0]?.args, {
    p_filters: { module: ['calendar'], brand_id: ['brand-a'], query: 'shift' },
    p_cursor_created_at: null,
    p_cursor_id: null,
    p_snapshot_at: null,
    p_page_size: 20,
    p_sort: 'newest',
  })
  assert.equal(page.hasMore, true)
  assert.equal(page.nextCursor?.id, 'audit-20')
  assert.deepEqual(page.range, { from: '2026-10-14', to: '2026-11-12' })
})

test('C12 cancellation is passed to PostgREST and malformed cursor responses fail closed', async () => {
  const controller = new AbortController()
  let receivedSignal: AbortSignal | undefined
  const request = Object.assign(Promise.resolve({ data: {
    items: [], has_more: false, page_size: 20, next_cursor: null,
    range: { from: '2026-10-14', to: '2026-11-12' },
  }, error: null }), {
    abortSignal(signal: AbortSignal) { receivedSignal = signal; return this },
  })
  const repository = createSupabaseAuditRepository({ rpc: () => request } as never)
  await repository.getAuditHistoryPage({ signal: controller.signal })
  assert.equal(receivedSignal, controller.signal)

  const invalid = createSupabaseAuditRepository({ rpc: async () => ({
    data: { items: [], has_more: true, page_size: 20, next_cursor: null, range: { from: 'x', to: 'y' } }, error: null,
  }) } as never)
  await assert.rejects(() => invalid.getAuditHistoryPage({}), /AUDIT_HISTORY_CURSOR_INVALID/)
})

test('C12 retains the database error code for permission and retry handling', async () => {
  const repository = createSupabaseAuditRepository({ rpc: async () => ({
    data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' },
  }) } as never)
  await assert.rejects(() => repository.getAuditHistoryPage({}), (error: Error & { code?: string }) => error.code === '57014')
})
