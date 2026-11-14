import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { auditService } from '../lib/services/auditService'
import { createSupabaseAuditRepository } from '../lib/services/supabaseAuditService'

function clientFor(result: unknown, calls: Array<{ name: string; args: Record<string, unknown>; signal?: AbortSignal }>) {
  return {
    rpc(name: string, args: Record<string, unknown>) {
      const request = {
        abortSignal(signal: AbortSignal) { calls.at(-1)!.signal = signal; return request },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      calls.push({ name, args })
      return request
    },
    from() { throw new Error('Audit History must use the bounded page RPC, not a table count query') },
  } as unknown as SupabaseClient
}

test('G12 client sends C12 keyset cursor, scoped filters and abort signal without exact-count reads', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown>; signal?: AbortSignal }> = []
  const signal = new AbortController().signal
  const repository = createSupabaseAuditRepository(clientFor({ data: {
    items: [], has_more: true, page_size: 50,
    next_cursor: { created_at: '2026-10-28T10:00:00Z', id: 'audit-20', snapshot_at: '2026-10-29T00:00:00Z' },
    range: { from: '2026-10-01', to: '2026-10-31' },
  }, error: null }, calls))

  const page = await repository.getAuditHistoryPage({
    cursor: { created_at: '2026-10-28T09:00:00Z', id: 'audit-30', snapshot_at: '2026-10-29T00:00:00Z' },
    pageSize: 50,
    filters: { from: '2026-10-01', to: '2026-10-31', brand_id: 'brand-1', actor: ['actor-1', 'all'], status: ['retryable'] },
    signal,
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'get_audit_history_page')
  assert.deepEqual(calls[0].args, {
    p_filters: { from: '2026-10-01', to: '2026-10-31', brand_id: ['brand-1'], actor: ['actor-1'], status: ['failed'] },
    p_cursor_created_at: '2026-10-28T09:00:00Z', p_cursor_id: 'audit-30',
    p_snapshot_at: '2026-10-29T00:00:00Z', p_page_size: 50, p_sort: 'newest',
  })
  assert.equal(calls[0].signal, signal)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextCursor?.id, 'audit-20')
  assert.deepEqual(page.range, { from: '2026-10-01', to: '2026-10-31' })
})

test('G12 reports a missing C12 RPC as an explicit backend integration error', async () => {
  const repository = createSupabaseAuditRepository(clientFor({ data: null, error: { code: 'PGRST202', message: 'function unavailable' } }, []))
  await assert.rejects(repository.getAuditHistoryPage({}), (error: unknown) =>
    error instanceof Error && error.message === 'AUDIT_HISTORY_ENDPOINT_UNAVAILABLE'
      && 'code' in error && error.code === 'PGRST202')
})

test('G12 client strips blank filter strings, empty arrays, and UI-only keys from p_filters', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown>; signal?: AbortSignal }> = []
  const repository = createSupabaseAuditRepository(clientFor({
    data: { items: [], has_more: false, page_size: 20, next_cursor: null, range: { from: '2026-10-16', to: '2026-11-14' } },
    error: null,
  }, calls))

  await repository.getAuditHistoryPage({
    filters: {
      query: '   ',
      from: '',
      to: '',
      actor: ['all'],
      brand_id: [],
      source: ['excel_import', 'manual'],
      actorIds: ['leaked-ui-key'],
      brandIds: ['leaked-brand'],
    } as Record<string, string | readonly string[]>,
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args.p_filters, {
    source: ['excel_import', 'manual'],
  })
})

test('G12 mock getAuditHistoryPage falls back blank dates to 30-day window and enforces max range', async () => {
  const env = process.env as Record<string, string | undefined>
  const prevNodeEnv = env.NODE_ENV
  const prevUseMock = env.NEXT_PUBLIC_USE_MOCK_DATA
  env.NODE_ENV = 'development'
  env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  try {
    const page = await auditService.getAuditHistoryPage({
      user: { id: 'admin-1', role: 'admin', system_permission: 'admin' },
      filters: { from: '', to: '   ' },
    })
    assert.match(page.range.from, /^\d{4}-\d{2}-\d{2}$/)
    assert.match(page.range.to, /^\d{4}-\d{2}-\d{2}$/)
    const days = (Date.parse(`${page.range.to}T00:00:00Z`) - Date.parse(`${page.range.from}T00:00:00Z`)) / (24 * 60 * 60 * 1000)
    assert.equal(days, 29)

    await assert.rejects(
      auditService.getAuditHistoryPage({
        user: { id: 'admin-1', role: 'admin', system_permission: 'admin' },
        filters: { from: '2025-01-01', to: '2026-06-01' },
      }),
      (error: unknown) => error instanceof Error && error.message === 'AUDIT_DATE_RANGE_INVALID' && 'code' in error && error.code === '22023',
    )
  } finally {
    if (prevNodeEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = prevNodeEnv
    if (prevUseMock === undefined) delete env.NEXT_PUBLIC_USE_MOCK_DATA
    else env.NEXT_PUBLIC_USE_MOCK_DATA = prevUseMock
  }
})
