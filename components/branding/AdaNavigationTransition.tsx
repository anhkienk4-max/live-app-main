'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AdaLoadingScreen } from '@/components/branding/AdaLoadingScreen'

const INITIAL_READY_DELAY_MS = 600
const ROUTE_QUIET_MS = 300
const EXIT_TRANSITION_MS = 200
const NAVIGATION_FAILSAFE_MS = 3_000
const INITIAL_MOUNT_FAILSAFE_MS = 3_000
const FETCH_BLOCKING_WINDOW_MS = 1_000

function routeHasTerminalState(): boolean {
  if (typeof document === 'undefined') return false
  const content = document.querySelector('.ada-navigation-content')
  if (!content) return false
  const terminalSelector = [
    '[role="alert"]',
    '[data-testid*="error" i]',
    '[data-testid*="denied" i]',
    '[data-testid="page-load-error"]',
    '[data-testid*="alert" i]',
    '.ada-page-load-error',
    '[data-testid="admin-workspace-gate"]',
  ].join(', ')
  return Boolean(content.querySelector(terminalSelector))
}

function routeContentIsLoading(): boolean {
  if (typeof document === 'undefined') return false
  const content = document.querySelector('.ada-navigation-content')
  const main = content?.querySelector('main') ?? content
  if (!main) return false

  // If a terminal error or access-denied state has rendered, route is done loading
  if (routeHasTerminalState()) return false

  // Check ONLY full-route blocking shells.
  // NEVER check .animate-pulse or generic widget skeletons, as progressive dashboards intentionally
  // mount skeleton widgets while background analytics/KPIs resolve.
  const fullRouteLoadingSelector = [
    '[data-route-loading="true"]',
    '[data-testid="route-loading"]',
    '[data-testid="route-loading-shell"]',
    '[data-testid="notifications-loading-shell"]',
    '[data-testid="profile-loading-shell"]',
    '[data-testid="settings-loading-shell"]',
    '#route-loading-indicator',
  ].join(', ')

  return main.matches(fullRouteLoadingSelector) || Boolean(main.querySelector(fullRouteLoadingSelector))
}

function isNonBlockingUrl(url: string): boolean {
  return (
    url.includes('/api/notifications') ||
    url.includes('/api/telemetry') ||
    url.includes('/api/analytics/stream') ||
    url.includes('/api/heartbeat')
  )
}

export function AdaNavigationTransition({ children }: { children: ReactNode }): ReactNode {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const visibleRef = useRef(true)
  const previousPath = useRef(pathname)
  const currentPath = useRef(pathname)
  const pendingPath = useRef<string | null>(pathname)
  const navigationStartedAtPath = useRef<string | null>(null)
  const navigationStartTime = useRef<number>(0)
  const activeFetches = useRef(0)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failSafeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finishTransition = useCallback(() => {
    if (!visibleRef.current) return
    if (failSafeTimer.current) clearTimeout(failSafeTimer.current)
    failSafeTimer.current = null
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = null
    setExiting(true)
    if (exitTimer.current) clearTimeout(exitTimer.current)
    exitTimer.current = setTimeout(() => {
      visibleRef.current = false
      setVisible(false)
      setExiting(false)
      navigationStartedAtPath.current = null
      pendingPath.current = null
      exitTimer.current = null
      failSafeTimer.current = null
    }, EXIT_TRANSITION_MS)
  }, [])

  const scheduleReadyCheck = useCallback(() => {
    if (!visibleRef.current) return

    // If destination path has not aligned yet, continue waiting
    if (pendingPath.current !== currentPath.current) return

    // Immediate terminal state shortcut (errors, access denied)
    if (routeHasTerminalState()) {
      requestAnimationFrame(() => requestAnimationFrame(finishTransition))
      return
    }

    // Only let active fetches block transition within the initial fetch window (1000ms max)
    const withinFetchWindow = navigationStartTime.current > 0 && Date.now() - navigationStartTime.current < FETCH_BLOCKING_WINDOW_MS
    if (withinFetchWindow && activeFetches.current > 0) return

    // If a full-route blocking shell is active, continue waiting
    if (routeContentIsLoading()) return

    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      if (!visibleRef.current || pendingPath.current !== currentPath.current) return
      if (routeContentIsLoading()) return
      requestAnimationFrame(() => requestAnimationFrame(finishTransition))
    }, ROUTE_QUIET_MS)
  }, [finishTransition])

  const beginTransition = useCallback((fromPath: string) => {
    if (exitTimer.current) clearTimeout(exitTimer.current)
    if (settleTimer.current) clearTimeout(settleTimer.current)
    if (failSafeTimer.current) clearTimeout(failSafeTimer.current)
    visibleRef.current = true
    setVisible(true)
    setExiting(false)
    navigationStartedAtPath.current = fromPath
    navigationStartTime.current = Date.now()
    pendingPath.current = null
    failSafeTimer.current = setTimeout(finishTransition, NAVIGATION_FAILSAFE_MS)
  }, [finishTransition])

  // Intercept fetch requests: ignore non-blocking URLs, track active fetches with time bounding
  useEffect(() => {
    const originalFetch = window.fetch
    const wrappedFetch: typeof window.fetch = (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && 'url' in args[0]) ? (args[0] as Request).url : ''
      const isBlocking = !isNonBlockingUrl(url)

      if (isBlocking) {
        activeFetches.current += 1
      }

      return originalFetch.apply(window, args).finally(() => {
        if (isBlocking) {
          activeFetches.current = Math.max(0, activeFetches.current - 1)
        }
        scheduleReadyCheck()
      })
    }
    window.fetch = wrappedFetch

    const contentObserver = new MutationObserver(() => scheduleReadyCheck())
    const appContent = document.querySelector('.ada-navigation-content')
    if (appContent) {
      contentObserver.observe(appContent, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-busy', 'class', 'data-testid', 'role'],
      })
    }

    // Initial mount readiness & failsafe recovery
    navigationStartTime.current = Date.now()
    const initialTimer = setTimeout(scheduleReadyCheck, INITIAL_READY_DELAY_MS)
    failSafeTimer.current = setTimeout(() => {
      if (visibleRef.current) {
        finishTransition()
      }
    }, INITIAL_MOUNT_FAILSAFE_MS)

    return () => {
      clearTimeout(initialTimer)
      if (failSafeTimer.current) clearTimeout(failSafeTimer.current)
      contentObserver.disconnect()
      if (window.fetch === wrappedFetch) window.fetch = originalFetch
    }
  }, [scheduleReadyCheck, finishTransition])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin || destination.pathname === currentPath.current) return
      beginTransition(currentPath.current)
    }
    const onPopState = () => beginTransition(currentPath.current)
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [beginTransition])

  useEffect(() => {
    currentPath.current = pathname
    if (previousPath.current === pathname) {
      if (pendingPath.current === pathname) scheduleReadyCheck()
      return
    }
    const previous = previousPath.current
    previousPath.current = pathname
    if (navigationStartedAtPath.current === null) beginTransition(previous)
    pendingPath.current = pathname
    scheduleReadyCheck()
  }, [beginTransition, pathname, scheduleReadyCheck])

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current)
    if (settleTimer.current) clearTimeout(settleTimer.current)
    if (failSafeTimer.current) clearTimeout(failSafeTimer.current)
  }, [])

  return (
    <>
      <div className="ada-navigation-content" aria-hidden={visible} inert={visible}>
        {children}
      </div>
      {visible && (
        <div className={`ada-navigation-transition${exiting ? ' ada-navigation-transition--exiting' : ''}`}>
          <AdaLoadingScreen overlay />
        </div>
      )}
    </>
  )
}
