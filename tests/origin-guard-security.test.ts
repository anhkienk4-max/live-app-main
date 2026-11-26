import assert from 'node:assert/strict'
import test from 'node:test'
import { hasExactOrigin } from '../lib/server/apiSecurity.ts'

test('hasExactOrigin allows exact same-origin requests', () => {
  const req1 = new Request('https://ops.example.com/api/test', {
    headers: { origin: 'https://ops.example.com' },
  })
  assert.equal(hasExactOrigin(req1), true)

  const req2 = new Request('https://ops.example.com:8443/api/action', {
    headers: { origin: 'https://ops.example.com:8443' },
  })
  assert.equal(hasExactOrigin(req2), true)
})

test('hasExactOrigin rejects missing or empty origin header', () => {
  const noOrigin = new Request('https://ops.example.com/api/test')
  assert.equal(hasExactOrigin(noOrigin), false)

  const emptyOrigin = new Request('https://ops.example.com/api/test', {
    headers: { origin: '' },
  })
  assert.equal(hasExactOrigin(emptyOrigin), false)
})

test('hasExactOrigin rejects cross-origin requests', () => {
  const attacker = new Request('https://ops.example.com/api/test', {
    headers: { origin: 'https://attacker.com' },
  })
  assert.equal(hasExactOrigin(attacker), false)

  const subdomain = new Request('https://ops.example.com/api/test', {
    headers: { origin: 'https://evil.ops.example.com' },
  })
  assert.equal(hasExactOrigin(subdomain), false)

  const protocolMismatch = new Request('https://ops.example.com/api/test', {
    headers: { origin: 'http://ops.example.com' },
  })
  assert.equal(hasExactOrigin(protocolMismatch), false)
})

test('hasExactOrigin allows loopback normalization in non-production mode', () => {
  const originalEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'test'

    // 127.0.0.1 to localhost with same port
    const req1 = new Request('http://localhost:3000/api/workflow', {
      headers: { origin: 'http://127.0.0.1:3000' },
    })
    assert.equal(hasExactOrigin(req1), true)

    // localhost to 127.0.0.1 with same port
    const req2 = new Request('http://127.0.0.1:3000/api/workflow', {
      headers: { origin: 'http://localhost:3000' },
    })
    assert.equal(hasExactOrigin(req2), true)

    // IPv6 loopback
    const req3 = new Request('http://localhost:3000/api/workflow', {
      headers: { origin: 'http://[::1]:3000' },
    })
    assert.equal(hasExactOrigin(req3), true)

    // Port mismatch must be denied
    const portMismatch = new Request('http://localhost:3000/api/workflow', {
      headers: { origin: 'http://127.0.0.1:3001' },
    })
    assert.equal(hasExactOrigin(portMismatch), false)
  } finally {
    process.env.NODE_ENV = originalEnv
  }
})

test('hasExactOrigin enforces strict exact match in production mode', () => {
  const originalEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'

    // In production, loopback hostname normalization is strictly disabled
    const loopbackDiff = new Request('http://localhost:3000/api/workflow', {
      headers: { origin: 'http://127.0.0.1:3000' },
    })
    assert.equal(hasExactOrigin(loopbackDiff), false)

    // Exact string match is allowed in production
    const exactProd = new Request('https://ops.ada.vn/api/workflow', {
      headers: { origin: 'https://ops.ada.vn' },
    })
    assert.equal(hasExactOrigin(exactProd), true)
  } finally {
    process.env.NODE_ENV = originalEnv
  }
})

test('hasExactOrigin ignores untrusted forwarded headers', () => {
  const spoofAttempt = new Request('https://ops.example.com/api/test', {
    headers: {
      origin: 'https://attacker.com',
      'x-forwarded-host': 'attacker.com',
      'x-forwarded-proto': 'https',
      'x-real-ip': '1.2.3.4',
    },
  })
  assert.equal(hasExactOrigin(spoofAttempt), false)
})

test('hasExactOrigin rejects multiple comma-separated origins', () => {
  const multiple = new Request('https://ops.example.com/api/test', {
    headers: { origin: 'https://ops.example.com, https://evil.com' },
  })
  assert.equal(hasExactOrigin(multiple), false)
})

test('hasExactOrigin rejects userinfo in origin header', () => {
  const originUserinfo = new Request('http://localhost:3000/api/test', {
    headers: { origin: 'https://tester%40example.invalid@localhost:3000' },
  })
  assert.equal(hasExactOrigin(originUserinfo), false)
})

test('hasExactOrigin rejects loopback relaxation in staging and preview environments', () => {
  const originalEnv = { ...process.env }
  try {
    process.env.NODE_ENV = 'development'
    process.env.APP_ENV = 'staging'
    const stagingReq = new Request('http://localhost:3000/api/test', {
      headers: { origin: 'http://127.0.0.1:3000' },
    })
    assert.equal(hasExactOrigin(stagingReq), false)

    process.env.APP_ENV = undefined
    process.env.VERCEL_ENV = 'preview'
    const previewReq = new Request('http://localhost:3000/api/test', {
      headers: { origin: 'http://127.0.0.1:3000' },
    })
    assert.equal(hasExactOrigin(previewReq), false)
  } finally {
    process.env = originalEnv
  }
})

test('hasExactOrigin safely handles malformed origin without throwing', () => {
  const malformed = new Request('https://ops.example.com/api/test', {
    headers: { origin: 'not-a-valid-url' },
  })
  assert.equal(hasExactOrigin(malformed), false)
})
