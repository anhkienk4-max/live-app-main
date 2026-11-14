import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
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
