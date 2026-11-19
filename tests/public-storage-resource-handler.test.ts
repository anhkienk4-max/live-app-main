import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicStorageResourceHandler } from '@/lib/server/publicStorageResourceHandler'
import type { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

function createHandler(data: { canonical_url: string } | null) {
  const resultData = data
  const filtered: Array<[string, string]> = []
  const query = {
    select: () => query,
    eq: (key: string, value: string | boolean) => { filtered.push([key, String(value)]); return query },
    neq: (key: string, value: string) => { filtered.push([key, value]); return query },
    maybeSingle: async () => ({ data: resultData, error: null }),
  }
  const client = (() => ({ from: () => query })) as unknown as typeof createSupabaseAdminClient
  return { handler: createPublicStorageResourceHandler(client), filtered }
}

test('public resource route redirects only an active public non-attendance resource', async () => {
  const { handler, filtered } = createHandler({ canonical_url: 'https://drive.google.com/drive/folders/public-id' })
  const response = await handler(new Request('https://app.test/api/public/storage-resources/public-id'), { params: Promise.resolve({ id: 'public-id' }) })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://drive.google.com/drive/folders/public-id')
  assert.deepEqual(filtered, [['id', 'public-id'], ['visibility', 'public'], ['is_active', 'true'], ['resource_type', 'attendance_evidence']])
})

test('missing and malformed resource IDs do not redirect', async () => {
  const hidden = createHandler(null)
  const response = await hidden.handler(new Request('https://app.test'), { params: Promise.resolve({ id: 'hidden-id' }) })
  assert.equal(response.status, 404)
  assert.equal(response.headers.has('location'), false)

  const malformed = createHandler({ canonical_url: 'https://drive.google.com/drive/folders/should-not-be-read' })
  const invalidResponse = await malformed.handler(new Request('https://app.test'), { params: Promise.resolve({ id: '../escape' }) })
  assert.equal(invalidResponse.status, 404)
  assert.equal(malformed.filtered.length, 0)
})
