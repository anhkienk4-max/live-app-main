import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { GET } from '../app/auth/confirm/route.ts'
import { createAuthConfirmGetHandler } from '../lib/auth/authConfirm.ts'
import { GET as callbackGET } from '../app/api/auth/callback/route.ts'

function locationOf(response: Response) {
  return new URL(response.headers.get('location') || '')
}

test('valid invite token hash establishes the SSR flow and redirects to reset password', async () => {
  let verified: { token_hash: string; type: string } | null = null
  const handler = createAuthConfirmGetHandler(async () => ({
    auth: {
      async verifyOtp(params) {
        verified = params
        return { error: null }
      },
    },
  }))

  const response = await handler(new Request(
    'http://localhost:3000/auth/confirm?token_hash=invite-token&type=invite&next=/reset-password',
  ))

  assert.equal(response.status, 307)
  assert.equal(locationOf(response).pathname, '/reset-password')
  assert.deepEqual(verified, { token_hash: 'invite-token', type: 'invite' })
})

test('valid recovery token hash uses the same SSR confirmation route', async () => {
  let verifiedType = ''
  const handler = createAuthConfirmGetHandler(async () => ({
    auth: {
      async verifyOtp(params) {
        verifiedType = params.type
        return { error: null }
      },
    },
  }))

  const response = await handler(new Request(
    'http://localhost:3000/auth/confirm?token_hash=recovery-token&type=recovery&next=/reset-password',
  ))

  assert.equal(response.status, 307)
  assert.equal(locationOf(response).pathname, '/reset-password')
  assert.equal(verifiedType, 'recovery')
})

test('missing or invalid token hashes fail closed without calling Supabase', async () => {
  let calls = 0
  const handler = createAuthConfirmGetHandler(async () => ({
    auth: {
      async verifyOtp() {
        calls += 1
        return { error: null }
      },
    },
  }))

  for (const url of [
    'http://localhost:3000/auth/confirm?type=invite&next=/reset-password',
    'http://localhost:3000/auth/confirm?token_hash=x&type=signup&next=/reset-password',
  ]) {
    const response = await handler(new Request(url))
    assert.equal(response.status, 307)
    assert.equal(locationOf(response).pathname, '/auth/auth-code-error')
  }
  assert.equal(calls, 0)
})

test('unsafe external next paths are rejected', async () => {
  let calls = 0
  const handler = createAuthConfirmGetHandler(async () => ({
    auth: {
      async verifyOtp() {
        calls += 1
        return { error: null }
      },
    },
  }))

  for (const next of ['https://attacker.example', '//attacker.example']) {
    const response = await handler(new Request(
      `http://localhost:3000/auth/confirm?token_hash=x&type=invite&next=${encodeURIComponent(next)}`,
    ))
    assert.equal(response.status, 307)
    assert.equal(locationOf(response).pathname, '/auth/auth-code-error')
  }
  assert.equal(calls, 0)
})

test('Supabase verification failures redirect without leaking token details', async () => {
  const handler = createAuthConfirmGetHandler(async () => ({
    auth: {
      async verifyOtp() {
        return { error: new Error('token secret should not be returned') }
      },
    },
  }))

  const response = await handler(new Request(
    'http://localhost:3000/auth/confirm?token_hash=secret-token&type=recovery&next=/reset-password',
  ))
  assert.equal(response.status, 307)
  assert.equal(locationOf(response).pathname, '/auth/auth-code-error')
  assert.equal(response.headers.get('location')?.includes('secret-token'), false)
})

test('confirmation route uses the server Supabase client for cookie-backed sessions', async () => {
  const source = await readFile(new URL('../app/auth/confirm/route.ts', import.meta.url), 'utf8')
  const implementation = await readFile(new URL('../lib/auth/authConfirm.ts', import.meta.url), 'utf8')
  assert.match(implementation, /@\/lib\/supabase\/server/)
  assert.doesNotMatch(implementation, /@\/lib\/supabase\/client/)
  assert.match(implementation, /verifyOtp\(/)
  assert.match(source, /createAuthConfirmGetHandler/)
  assert.doesNotMatch(source, /export\s+(?:async\s+)?function\s+createAuthConfirmGetHandler/)
})

test('existing code callback remains an independent auth boundary', async () => {
  const response = await callbackGET(new Request('http://localhost:3000/api/auth/callback'))
  assert.equal(response.status, 307)
  assert.equal(locationOf(response).pathname, '/auth/auth-code-error')
})

test('exported GET handler is wired to the confirmation implementation', async () => {
  const response = await GET(new Request(
    'http://localhost:3000/auth/confirm?token_hash=&type=invite',
  ))
  assert.equal(response.status, 307)
  assert.equal(locationOf(response).pathname, '/auth/auth-code-error')
})
