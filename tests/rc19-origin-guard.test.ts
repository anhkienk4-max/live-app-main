import assert from 'node:assert/strict'
import test from 'node:test'
import { hasExactOrigin } from '../lib/server/apiSecurity.ts'
import { createStaffingIncidentReplacementHandler } from '../lib/server/staffingIncidentReplacementHandler.ts'
import { createStaffingReplacementHandler } from '../lib/server/staffingReplacementHandler.ts'
import { handleShiftOperationalNoteWorkflow } from '../lib/server/shiftOperationalNoteWorkflowHandler.ts'

const environmentKeys = ['NODE_ENV', 'APP_ENV', 'NEXT_PUBLIC_APP_ENV', 'VERCEL_ENV', 'DISPOSABLE_RUNTIME'] as const

async function withEnvironment(
  values: Partial<Record<(typeof environmentKeys)[number], string | undefined>>,
  action: () => Promise<void> | void,
) {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]))
  for (const key of environmentKeys) delete process.env[key]
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value
  }
  try {
    await action()
  } finally {
    for (const key of environmentKeys) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('origin guard requires both an allowed runtime and explicit disposable authorization', async () => {
  await withEnvironment({ NODE_ENV: 'development', DISPOSABLE_RUNTIME: undefined }, () => {
    assert.equal(hasExactOrigin(new Request('http://localhost:3000/api/test', {
      headers: { origin: 'http://127.0.0.1:3000' },
    })), false)
  })
  await withEnvironment({ NODE_ENV: 'production', DISPOSABLE_RUNTIME: 'true' }, () => {
    assert.equal(hasExactOrigin(new Request('http://localhost:3000/api/test', {
      headers: { origin: 'http://127.0.0.1:3000' },
    })), false)
  })
  await withEnvironment({ NODE_ENV: 'development', DISPOSABLE_RUNTIME: 'true' }, () => {
    assert.equal(hasExactOrigin(new Request('http://localhost:3000/api/test', {
      headers: { origin: 'http://127.0.0.1:3000' },
    })), true)
  })
})

test('staging and preview markers deny loopback normalization even with both flags', async () => {
  const request = new Request('http://localhost:3000/api/test', {
    headers: { origin: 'http://127.0.0.1:3000' },
  })
  await withEnvironment({ NODE_ENV: 'development', APP_ENV: 'staging', DISPOSABLE_RUNTIME: 'true' }, () => {
    assert.equal(hasExactOrigin(request), false)
  })
  await withEnvironment({ NODE_ENV: 'development', VERCEL_ENV: 'preview', DISPOSABLE_RUNTIME: 'true' }, () => {
    assert.equal(hasExactOrigin(request), false)
  })
  await withEnvironment({ NODE_ENV: 'development', NEXT_PUBLIC_APP_ENV: 'production', DISPOSABLE_RUNTIME: 'true' }, () => {
    assert.equal(hasExactOrigin(request), false)
  })
})

test('exact origin is allowed while malformed, forwarded, and cross-origin values fail closed', async () => {
  await withEnvironment({ NODE_ENV: 'production', DISPOSABLE_RUNTIME: undefined }, () => {
    assert.equal(hasExactOrigin(new Request('https://ops.example/api/test', {
      headers: { origin: 'https://ops.example' },
    })), true)
    for (const origin of ['', 'null', 'https://ops.example, https://attacker.example', 'https://user@ops.example', 'https://attacker.example']) {
      assert.equal(hasExactOrigin(new Request('https://ops.example/api/test', {
        headers: { origin, 'x-forwarded-host': 'ops.example', 'x-forwarded-proto': 'https' },
      })), false, `expected rejection for ${origin}`)
    }
  })
})

test('staffing and note mutation handlers reject origin failures before resolving an actor', async () => {
  await withEnvironment({ NODE_ENV: 'production', APP_ENV: 'production', DISPOSABLE_RUNTIME: 'true' }, async () => {
    let resolverCalls = 0
    const resolveUser = async () => {
      resolverCalls += 1
      return { id: 'auth-1', businessUserId: 'business-1', systemPermission: 'admin' as const }
    }
    const request = () => new Request('http://localhost:3000/api/mutation', {
      method: 'POST', headers: { origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' }, body: '{}',
    })
    const incident = await createStaffingIncidentReplacementHandler({ resolveUser })(request())
    const staffing = await createStaffingReplacementHandler({ resolveUser })(request())
    const note = await handleShiftOperationalNoteWorkflow(request())
    assert.deepEqual([incident.status, staffing.status, note.status], [403, 403, 403])
    assert.equal(resolverCalls, 0)
  })
})
