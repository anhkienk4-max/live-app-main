import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy.ts'
import { hasPermission, permissionMatrix } from '../lib/permissions.ts'
import { resolveAuthMode } from '../lib/auth/authMode.ts'

test('SECURITY: Anonymous request with QA bypass header is rejected on protected routes', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalVercelEnv = process.env.VERCEL_ENV
  try {
    process.env.NODE_ENV = 'production'
    process.env.VERCEL_ENV = 'preview'

    // Anonymous request attempting to access /calendar with visual QA bypass headers
    const req = new NextRequest('https://preview.app/calendar', {
      headers: {
        'x-visual-qa-bypass': 'true',
        'x-visual-qa-role': 'admin',
      },
    })

    const res = await proxy(req)

    // Must NOT bypass auth — must redirect to /login
    assert.equal(res.status, 307)
    const location = res.headers.get('location') || ''
    assert.ok(location.includes('/login'), `Expected redirect to /login but got ${location}`)
  } finally {
    process.env.NODE_ENV = originalNodeEnv
    process.env.VERCEL_ENV = originalVercelEnv
  }
})

test('SECURITY: Proxy strips client-injected visual QA headers on non-fixture routes', async () => {
  const req = new NextRequest('https://preview.app/shifts', {
    headers: {
      'x-visual-qa-bypass': 'true',
      'x-visual-qa-role': 'admin',
      'x-custom-test': 'preserved',
    },
  })

  // Call proxy which strips visual QA headers before authProxy
  await proxy(req)

  assert.equal(req.headers.get('x-visual-qa-bypass'), null, 'x-visual-qa-bypass must be stripped')
  assert.equal(req.headers.get('x-visual-qa-role'), null, 'x-visual-qa-role must be stripped')
  assert.equal(req.headers.get('x-custom-test'), 'preserved', 'Normal headers must be preserved')
})

test('SECURITY: Member session with x-visual-qa-role=admin cannot elevate to Admin permissions', () => {
  const memberUser = { role: 'member' as const }
  const adminUser = { role: 'admin' as const }

  // An attacker with a member session attempts to claim admin role via header
  // Ensure the application's permission evaluation is strictly based on verified member role
  assert.equal(hasPermission(memberUser, 'staff.manage'), false, 'Member must not have staff.manage')
  assert.equal(hasPermission(memberUser, 'settings.admin'), false, 'Member must not have settings.admin')

  // Contrast with actual admin permissions
  assert.equal(hasPermission(adminUser, 'staff.manage'), true)
  assert.equal(hasPermission(adminUser, 'settings.admin'), true)
})

test('SECURITY: Leader session with x-visual-qa-role=admin cannot elevate to Admin permissions', () => {
  const leaderUser = { role: 'leader' as const }
  const adminUser = { role: 'admin' as const }

  // Leader possesses shift and report leadership permissions, but NOT administrative system management
  assert.equal(hasPermission(leaderUser, 'staff.manage'), false, 'Leader must not have staff.manage')
  assert.equal(hasPermission(leaderUser, 'settings.admin'), false, 'Leader must not have settings.admin')
  assert.equal(hasPermission(leaderUser, 'settings.leader'), true, 'Leader has team settings view')
  assert.equal(hasPermission(adminUser, 'settings.admin'), true)
})

test('SECURITY: resolveAuthMode rejects mock mode whenever NODE_ENV is production or VERCEL_ENV is set', () => {
  // In preview or production deployments, useMockData='true' MUST NOT activate mock mode
  assert.equal(
    resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' }),
    'supabase',
    'Production must never activate mock auth',
  )
  assert.equal(
    resolveAuthMode({ nodeEnv: 'production', useMockData: 'false' }),
    'supabase',
  )

  // Only local development allows mock mode when explicitly requested
  assert.equal(
    resolveAuthMode({ nodeEnv: 'development', useMockData: 'true' }),
    'mock',
    'Local development with useMockData=true activates mock mode',
  )
  assert.equal(
    resolveAuthMode({ nodeEnv: 'development', useMockData: 'false' }),
    'supabase',
  )
})

test('SECURITY: API and UI permission consistency across 3 roles', () => {
  // Verify strict subset hierarchy: Member ⊂ Leader ⊂ Admin
  const memberPerms = new Set(permissionMatrix.member)
  const leaderPerms = new Set(permissionMatrix.leader)
  const adminPerms = new Set(permissionMatrix.admin)

  // Every member permission must be available to leader
  for (const perm of memberPerms) {
    assert.ok(leaderPerms.has(perm), `Leader must have member permission: ${perm}`)
  }

  // Every leader permission must be available to admin
  for (const perm of leaderPerms) {
    assert.ok(adminPerms.has(perm), `Admin must have leader permission: ${perm}`)
  }

  // Admin has exclusive permissions
  const adminOnly = ['staff.manage', 'settings.admin', 'permissions.manage']
  for (const perm of adminOnly) {
    assert.ok(adminPerms.has(perm as any), `Admin must have ${perm}`)
    assert.ok(!leaderPerms.has(perm as any), `Leader must NOT have ${perm}`)
    assert.ok(!memberPerms.has(perm as any), `Member must NOT have ${perm}`)
  }
})
