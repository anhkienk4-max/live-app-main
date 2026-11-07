import assert from 'node:assert/strict'
import test from 'node:test'
import { shiftNoteService } from '@/lib/services/shiftNoteService'

test('shift note Supabase writes call the actor-derived RPC without client author claims', async () => {
  const previousEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_USE_MOCK_DATA: process.env.NEXT_PUBLIC_USE_MOCK_DATA,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
  const previousFetch = globalThis.fetch
  let requestUrl = ''
  let requestMethod = ''
  let requestBody: Record<string, unknown> = {}

  process.env.NODE_ENV = 'test'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  globalThis.fetch = async (input, init) => {
    requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requestMethod = init?.method || 'GET'
    requestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    return new Response(JSON.stringify({
      id: 'persisted-note-1',
      shift_id: 'shift-a',
      business_date: '2026-11-20',
      date: '2026-11-20',
      category: 'incident',
      note: 'Synthetic RPC note',
      author_id: 'database-actor-1',
      author_name: 'Database Actor',
      author_role: 'leader',
      actual_event_time: '2026-11-20T08:15:00.000Z',
      event_time: '2026-11-20T08:15:00.000Z',
      version: 1,
      created_at: '2026-11-20T08:15:00.000Z',
      updated_at: '2026-11-20T08:15:00.000Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const note = await shiftNoteService.create({
      shiftId: 'shift-a',
      businessDate: '2026-11-20',
      category: 'incident',
      note: 'Synthetic RPC note',
      authorId: 'forged-client-actor',
      authorName: 'Forged Client Name',
      authorRole: 'admin',
    })

    assert.equal(requestUrl, 'http://127.0.0.1:54321/rest/v1/rpc/add_shift_operational_note')
    assert.equal(requestMethod, 'POST')
    assert.deepEqual(Object.keys(requestBody).sort(), [
      'p_actual_event_time',
      'p_affected_role',
      'p_affected_user_id',
      'p_business_date',
      'p_category',
      'p_note',
      'p_shift_id',
    ])
    assert.equal(requestBody.p_shift_id, 'shift-a')
    assert.equal(requestBody.p_business_date, '2026-11-20')
    assert.equal(requestBody.p_category, 'incident')
    assert.equal(requestBody.p_note, 'Synthetic RPC note')
    assert.match(String(requestBody.p_actual_event_time), /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(requestBody.author_id, undefined)
    assert.equal(requestBody.author_name, undefined)
    assert.equal(requestBody.author_role, undefined)
    assert.equal(note.author_id, 'database-actor-1')
  } finally {
    globalThis.fetch = previousFetch
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
