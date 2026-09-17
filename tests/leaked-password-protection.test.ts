import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { classifyPasswordSecurityError } from '../lib/auth/passwordRecovery.ts'
import { resolveAuthMode } from '../lib/auth/authMode.ts'

test('classifies Supabase leaked-password rejection without trusting provider text', () => {
  assert.equal(classifyPasswordSecurityError({ code: 'weak_password', reasons: ['pwned'] }), 'leaked')
  assert.equal(classifyPasswordSecurityError({ errorCode: 'weak_password', reasons: ['min_length'] }), 'weak')
  assert.equal(classifyPasswordSecurityError({ code: 'weak_password', message: 'password appeared in a breach' }), 'leaked')
  assert.equal(classifyPasswordSecurityError({ code: 'server_error', message: 'provider unavailable' }), 'unknown')
})

test('reset maps password security failures and never renders the raw provider error', async () => {
  const reset = await readFile(new URL('../app/reset-password/page.tsx', import.meta.url), 'utf8')
  assert.match(reset, /classifyPasswordSecurityError/)
  assert.match(reset, /passwordLeaked/)
  assert.match(reset, /passwordSecurityFailed/)
  assert.doesNotMatch(reset, /setError\(error\.message\)/)
})

test('production registration cannot bypass Supabase through mock auth', async () => {
  const register = await readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8')
  assert.match(register, /fetch\('\/api\/account-requests'/)
  assert.match(register, /if \(!useMockData\)/)
  assert.match(register, /mockAuthService\.registerEmail/)
  assert.equal(resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' }), 'supabase')
})
