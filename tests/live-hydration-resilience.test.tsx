import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { LanguageProvider } from '../lib/i18n.tsx'
import { AuthIdentityProvider } from '../lib/auth/AuthIdentityProvider.tsx'
import { LiveMonitoringDashboard } from '../components/features/live/LiveMonitoringDashboard.tsx'
import type { User } from '../lib/types/database.types.ts'

const fixtureAdmin: User = {
  id: 'qa-admin',
  email: 'qa@example.invalid',
  full_name: 'QA Live Admin',
  role: 'admin',
  system_permission: 'admin',
  status: 'active',
  created_at: '2026-10-13',
  updated_at: '2026-10-13',
}

test('Live Hydration: SSR markup renders deterministically without offline badge even when offline', () => {
  // Emulate offline environment on client/node
  const originalNavigator = globalThis.navigator
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true,
      writable: true,
    })

    const markup = renderToStaticMarkup(
      React.createElement(
        LanguageProvider,
        { defaultLanguage: 'vi' },
        React.createElement(
          AuthIdentityProvider,
          { mode: 'mock', identity: null, businessUser: fixtureAdmin },
          React.createElement(LiveMonitoringDashboard)
        )
      )
    )

    // Heading must be rendered
    assert.ok(markup.includes('Giám sát live'), 'Must render liveMonitor heading in Vietnamese')
    // Crucial hydration check: SSR must NOT output the offline badge, avoiding client hydration mismatch
    assert.ok(!markup.includes('Ngoại tuyến'), 'SSR markup must NEVER include "Ngoại tuyến" badge')
    assert.ok(!markup.includes('lucide-wifi-off'), 'SSR markup must not include WifiOff icon')
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
  }
})

test('Live Hydration: useSyncExternalStore contract ensures zero SSR-client mismatch', () => {
  const source = readFileSync('components/features/live/LiveMonitoringDashboard.tsx', 'utf8')

  // Verify usage of useSyncExternalStore with server snapshot
  assert.match(
    source,
    /useSyncExternalStore\(\s*subscribeOnline,\s*getOnlineSnapshot,\s*getServerOnlineSnapshot\s*\)/,
    'Must use React.useSyncExternalStore with subscribe, client snapshot, and server snapshot'
  )

  // Verify getServerOnlineSnapshot always returns true for SSR consistency
  assert.match(
    source,
    /function getServerOnlineSnapshot\(\)\s*\{\s*return true\s*\}/,
    'getServerOnlineSnapshot must return true to guarantee SSR markup determinism'
  )

  // Verify getOnlineSnapshot safely reads navigator.onLine or defaults to true
  assert.match(
    source,
    /function getOnlineSnapshot\(\)\s*\{\s*return typeof navigator !== 'undefined' \? navigator\.onLine : true\s*\}/,
    'getOnlineSnapshot must safely inspect navigator.onLine with undefined fallback'
  )
})

test('Live Hydration: Online and offline event subscriptions and cleanup', () => {
  const source = readFileSync('components/features/live/LiveMonitoringDashboard.tsx', 'utf8')

  // Verify window event listeners in subscribeOnline
  assert.match(source, /window\.addEventListener\('online',\s*callback\)/, 'Must subscribe to online event')
  assert.match(source, /window\.addEventListener\('offline',\s*callback\)/, 'Must subscribe to offline event')
  assert.match(source, /window\.removeEventListener\('online',\s*callback\)/, 'Must clean up online listener')
  assert.match(source, /window\.removeEventListener\('offline',\s*callback\)/, 'Must clean up offline listener')

  // Verify reconnect trigger calls loadData
  const effectBlock = source.match(/React\.useEffect\(\(\) => \{[\s\S]*?handleOnline[\s\S]*?loadData\(\)[\s\S]*?\}, \[loadData\]\)/)
  assert.ok(effectBlock, 'Must trigger loadData when reconnecting via online event listener')
  const onlineHandler = effectBlock[0].match(/const handleOnline = \(\) => \{([\s\S]*?)\}/)?.[1]
  assert.ok(onlineHandler, 'Must keep a single online refresh handler')
  assert.equal([...onlineHandler.matchAll(/loadData\(\)/g)].length, 1, 'Reconnect must trigger exactly one logical refresh')
  assert.doesNotMatch(onlineHandler, /setIsOnline/, 'Connectivity rendering must not create a second refresh path')
})

test('Live Hydration: Offline indicator is properly guarded and styled', () => {
  const source = readFileSync('components/features/live/LiveMonitoringDashboard.tsx', 'utf8')

  // Offline badge condition and styling
  assert.match(
    source,
    /\{!isOnline && \(\s*<span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-\[11px\] font-medium text-amber-800">/,
    'Must render amber badge when !isOnline'
  )
  assert.match(source, /<WifiOff className="h-3 w-3" \/> Ngoại tuyến/, 'Must render WifiOff icon and Ngoại tuyến label')

  // Refresh button disabled state
  assert.match(source, /disabled=\{isRevalidating \|\| !isOnline\}/, 'Refresh button must be disabled when revalidating or offline')
})

test('Live Hydration: Stale data warning operates independently of network state', () => {
  const source = readFileSync('components/features/live/LiveMonitoringDashboard.tsx', 'utf8')

  // Stale badge check: isStale && !isRevalidating && isOnline
  assert.match(
    source,
    /\{isStale && !isRevalidating && isOnline && \(/,
    'Stale warning must only display when online and not currently revalidating'
  )
  assert.match(source, /<Clock className="h-3 w-3" \/> Dữ liệu quá hạn/, 'Must display Clock icon and Dữ liệu quá hạn')
})

test('Live Hydration: Responsive layout safeguards for mobile (390px) and desktop (1440px)', () => {
  const source = readFileSync('components/features/live/LiveMonitoringDashboard.tsx', 'utf8')

  // Root flex/spacing responsiveness
  assert.match(source, /className="space-y-4"/, 'Must use uniform vertical rhythm')
  assert.match(source, /flex flex-col gap-3[\s\S]*?sm:flex-row/, 'Header actions must stack on mobile and flex on tablet/desktop')
  assert.match(source, /grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5/, 'KPI metric cards must use responsive grid')
  assert.match(source, /grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/, 'Session cards must grid 1 col on mobile, 2 on tablet, up to 4 on wide screens')
  assert.match(source, /rounded-lg border p-3 text-left/, 'Session cards must constrain padding and border')
})

test('Live Hydration: Core live monitoring contracts and role boundaries preserved', () => {
  const source = readFileSync('components/features/live/LiveMonitoringDashboard.tsx', 'utf8')

  // Preserved RPC / data service contracts
  assert.match(source, /shiftService\.getLivePage\(/, 'Must preserve shiftService.getLivePage')
  assert.match(source, /useShiftChangeRefresh\(loadData\)/, 'Must preserve useShiftChangeRefresh hook')
  assert.match(source, /getOperationalReferences\(currentUser\)/, 'Must preserve getOperationalReferences')
  assert.match(source, /operationalReferenceIdentity\(currentUser\)/, 'Must preserve identity scoping')
})
