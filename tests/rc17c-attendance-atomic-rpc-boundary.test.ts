import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHistoricalAttendanceHandler } from '../lib/server/historicalAttendanceHandler'

const actor = async () => ({
  id: 'synthetic-admin',
  email: 'synthetic@example.invalid',
  systemPermission: 'admin' as const,
})

function guardedClient(rpc?: (name: string) => Promise<{ data: unknown; error: null }>) {
  let writes = 0
  let rpcCalls = 0
  const readChain: {
    select: () => unknown
    is: () => unknown
    eq: () => unknown
    neq: () => unknown
    maybeSingle: () => Promise<{ data: null; error: null }>
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise<unknown>
    insert: () => never
    update: () => never
    delete: () => never
  } = {} as never
  readChain.select = () => readChain
  readChain.is = () => readChain
  readChain.eq = () => readChain
  readChain.neq = () => readChain
  readChain.maybeSingle = async () => ({ data: null, error: null })
  readChain.then = async resolve => resolve({ data: [], error: null })
  for (const method of ['insert', 'update', 'delete'] as const) {
    readChain[method] = () => {
      writes++
      throw new Error('Unsafe non-atomic write attempted')
    }
  }

  const client = {
    from: () => readChain,
    ...(rpc ? { rpc: async (name: string) => {
      rpcCalls++
      return rpc(name)
    } } : {}),
  } as unknown as SupabaseClient

  return { client, getWrites: () => writes, getRpcCalls: () => rpcCalls }
}

function makeHandler(client: SupabaseClient) {
  return createHistoricalAttendanceHandler({
    client: () => client,
    resolveUser: actor,
  })
}

function postBody(action: string, extra: Record<string, unknown>) {
  return new Request('http://localhost/api/workforce/attendance-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  })
}

test('preview rejects missing source identity and invalid date order before database reads', async () => {
  const ctx = guardedClient()
  const handler = makeHandler(ctx.client)
  const missing = await handler.POST(postBody('preview', { rawRows: [] }))
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).error.code, 'SOURCE_NAME_REQUIRED')
  const invalid = await handler.POST(postBody('preview', { sourceName: 'real.csv', dateOrder: 'guess', rawRows: [] }))
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'INVALID_DATE_ORDER')
  assert.equal(ctx.getWrites(), 0)
})

test('confirmation fails closed without an atomic RPC and does not touch tables', async () => {
  const ctx = guardedClient()
  const response = await makeHandler(ctx.client).POST(postBody('confirm_drafts', {
    batchId: 'synthetic-batch',
    version: 1,
  }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'ATOMIC_IMPORT_RPC_UNAVAILABLE')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(ctx.getWrites(), 0)
})

test('confirmation never falls through to table writes when RPC returns no result', async () => {
  const ctx = guardedClient(async () => ({ data: null, error: null }))
  const response = await makeHandler(ctx.client).POST(postBody('confirm_drafts', {
    batchId: 'synthetic-batch',
    version: 1,
  }))
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.code, 'INVALID_ATOMIC_IMPORT_RESPONSE')
  assert.equal(ctx.getRpcCalls(), 1)
  assert.equal(ctx.getWrites(), 0)
})

test('staging fails closed without RPC rather than writing batch and rows separately', async () => {
  const ctx = guardedClient()
  const response = await makeHandler(ctx.client).POST(postBody('preview', {
    sourceProfileId: 'opella_t10',
    sourceName: 'synthetic-empty-source.csv',
    sourceType: 'csv_upload',
    rawRows: [],
  }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'ATOMIC_IMPORT_RPC_UNAVAILABLE')
  assert.equal(ctx.getWrites(), 0)
})

test('staging rejects malformed RPC acknowledgement, without successful preview response', async () => {
  const ctx = guardedClient(async () => ({ data: { ok: 'true' }, error: null }))
  const response = await makeHandler(ctx.client).POST(postBody('preview', {
    sourceProfileId: 'opella_t10',
    sourceName: 'synthetic-invalid-ack.csv',
    sourceType: 'csv_upload',
    rawRows: [],
  }))
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.code, 'INVALID_ATOMIC_IMPORT_RESPONSE')
  assert.equal(ctx.getRpcCalls(), 1)
  assert.equal(ctx.getWrites(), 0)
})
