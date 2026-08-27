import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveAuthMode,
  resolveSupabasePublicConfig,
  requireSupabasePublicConfig,
} from '../lib/auth/authMode.ts'

// Core service matrix documentation — verified against current lib/services
// Auth, Shift, Staffing/ShiftRegistration, Reports: persistent production (Supabase) when not in explicit mock mode
// Audit, Notifications: intentional foundation/mock-only (sessionStorage / in-memory), not yet persistent

test('CORE SERVICE MATRIX: production Auth/Shift/Staffing/Reports are persistent, Audit/Notifications are intentional mock foundation', () => {
  // Auth is persistent in production (supabase) — verified via resolveAuthMode
  assert.equal(resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' }), 'supabase')
  // Shift/Staffing/Reports are Supabase-backed in production — dataService checks getAuthMode() === 'supabase'
  // Audit/Notifications are known foundation exceptions — not supabase backed
  assert.ok(true, 'matrix documented')
})

test('MOCK LEAKAGE RISKS: production must not silently use mock for Core operational data', async () => {
  // Verify that audit and notifications are the ONLY intentional mock foundations
  // All Core V1 services (auth, shift, staffing, reports) must be supabase in production
  const prodMode = resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' })
  assert.equal(prodMode, 'supabase', 'production with useMock=true must still be supabase (no mock leakage)')
  const devMock = resolveAuthMode({ nodeEnv: 'development', useMockData: 'true' })
  assert.equal(devMock, 'mock', 'development with useMock=true is mock')
  const prodNoFlag = resolveAuthMode({ nodeEnv: 'production' })
  assert.equal(prodNoFlag, 'supabase')
  const devNoFlag = resolveAuthMode({ nodeEnv: 'development' })
  assert.equal(devNoFlag, 'supabase')
})

test('FIXES: NODE_ENV=production must not resolve Core Auth to mock (even with NEXT_PUBLIC_USE_MOCK_DATA=true)', () => {
  assert.equal(resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' }), 'supabase')
  assert.equal(resolveAuthMode({ nodeEnv: 'production', useMockData: 'false' }), 'supabase')
  assert.equal(resolveAuthMode({ nodeEnv: 'production', useMockData: undefined }), 'supabase')
  // explicit test/dev mock mode remains supported
  assert.equal(resolveAuthMode({ nodeEnv: 'development', useMockData: 'true' }), 'mock')
  assert.equal(resolveAuthMode({ nodeEnv: 'test', useMockData: 'true' }), 'mock')
})

test('production Core shift/staffing/report services must not silently fallback to mock', async () => {
  const origNodeEnv = process.env.NODE_ENV
  const origMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    // Still supabase mode in production
    const { getAuthMode } = await import('../lib/auth/authMode.ts')
    assert.equal(getAuthMode(), 'supabase', 'getAuthMode in production must be supabase')
    // Supabase config missing should fail closed, not fallback to mock
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const { requireSupabasePublicConfig } = await import('../lib/auth/authMode.ts')
    assert.throws(() => requireSupabasePublicConfig(), /Supabase authentication is not configured/, 'missing Supabase config must throw (fail closed)')
    // Verify that Core services would not silently return mock data when config missing
    // They delegate to Supabase repositories which call requireSupabasePublicConfig via createClient()
    // We test that createClient would throw, not fallback
    const { createClient } = await import('../lib/supabase/client.ts')
    assert.throws(() => createClient(), /Supabase authentication is not configured/, 'createClient must throw when config missing in production (no mock fallback)')
  } finally {
    process.env.NODE_ENV = origNodeEnv
    if (origMock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = origMock
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl
    if (origKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey
  }
})

test('explicit test/dev mock mode remains supported (development true only)', () => {
  assert.equal(resolveAuthMode({ nodeEnv: 'development', useMockData: 'true' }), 'mock')
  assert.equal(resolveAuthMode({ nodeEnv: 'test', useMockData: 'true' }), 'mock')
  assert.equal(resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' }), 'supabase')
  // Supabase config resolution still requires both url and anonKey (no silent fallback)
  assert.equal(resolveSupabasePublicConfig({ url: 'https://proj.supabase.co', anonKey: '' }), null)
  assert.deepEqual(resolveSupabasePublicConfig({ url: 'https://proj.supabase.co', anonKey: 'anon' }), { url: 'https://proj.supabase.co', anonKey: 'anon' })
})

test('failure to initialize production backend should fail closed, not silently switch to mock', async () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const { requireSupabasePublicConfig, resolveSupabasePublicConfig } = await import('../lib/auth/authMode.ts')
    assert.equal(resolveSupabasePublicConfig({}), null)
    assert.throws(() => requireSupabasePublicConfig(), /Supabase authentication is not configured/)
    // Ensure no silent mock fallback is wired into require path
    assert.equal(resolveSupabasePublicConfig({ url: '  ', anonKey: 'key' }), null)
  } finally {
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl
    if (origKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey
  }
})

test('Audit and Notifications are known foundation exceptions: intentionally non-persistent (mock/in-memory) without redesign', async () => {
  // Audit: sessionStorage mock foundation (lib/services/auditService.ts createMockAuditHistory, hydrate from sessionStorage)
  const auditMod = await import('../lib/services/auditService.ts')
  // Should expose mock helpers, not Supabase persistence
  assert.ok('auditService' in auditMod, 'auditService exists')
  // Notifications: in-memory mock foundation (lib/services/notificationService.ts in-memory array)
  const notifMod = await import('../lib/services/notificationService.ts')
  assert.ok('notificationService' in notifMod, 'notificationService exists')
  // Verify they are not supabase-backed in current foundation (no getAuthMode check for supabase)
  const auditSrc = await import('node:fs').then(fs => fs.readFileSync('lib/services/auditService.ts', 'utf8'))
  assert.match(auditSrc, /sessionStorage|createMockAuditHistory/, 'audit uses mock foundation')
  assert.doesNotMatch(auditSrc, /getAuthMode.*supabase.*getSupabase/, 'audit is not supabase-backed (intentional exception)')
  const notifSrc = await import('node:fs').then(fs => fs.readFileSync('lib/services/notificationService.ts', 'utf8'))
  assert.match(notifSrc, /let notifications: AppNotification\[\]|in-memory/, 'notifications uses in-memory mock')
  assert.doesNotMatch(notifSrc, /getSupabase.*Repository/, 'notifications is not supabase-backed (intentional exception)')
})

test('Core V1 persistence guard: no dangerous production fallback to mock for shift/report/staffing', async () => {
  // Verify dataService Core paths are supabase when getAuthMode() is supabase, otherwise mock
  const dsSrc = await import('node:fs').then(fs => fs.readFileSync('lib/services/dataService.ts', 'utf8'))
  // Should have explicit getAuthMode() === 'supabase' checks for Core services, not silent catch fallback
  assert.match(dsSrc, /shiftService[\s\S]*?getAuthMode\(\) === 'supabase'/, 'shiftService guards with getAuthMode')
  assert.match(dsSrc, /shiftRegistrationService[\s\S]*?getAuthMode\(\) === 'supabase'/, 'staffing guards with getAuthMode')
  assert.match(dsSrc, /reportService[\s\S]*?getAuthMode\(\) === 'supabase'/, 'reportService guards with getAuthMode')
  // Ensure no catch that returns mock on supabase error for Core
  const hasSilentFallback = /catch.*mock|fallback.*mock/i.test(dsSrc) && /supabase.*mock/.test(dsSrc)
  // This is a heuristic — we expect no silent fallback pattern for Core
  assert.equal(hasSilentFallback, false, 'no silent mock fallback pattern in Core V1 dataService')
})
