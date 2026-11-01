'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AdaLoadingScreen } from '@/components/branding/AdaLoadingScreen'

const INITIAL_READY_DELAY_MS = 850
const ROUTE_QUIET_MS = 650
const EXIT_TRANSITION_MS = 220
const NAVIGATION_FAILSAFE_MS = 20_000

function routeContentIsLoading(): boolean {
  const content = document.querySelector('.ada-navigation-content')
  const main = content?.querySelector('main') ?? content
  if (!main) return false
  const loadingSelector = '[aria-busy="true"], [role="progressbar"], [data-testid*="loading" i], [data-testid*="skeleton" i], [data-testid*="progress" i], .animate-pulse'
  return main.matches(loadingSelector) || Boolean(main.querySelector(loadingSelector))
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
  const activeFetches = useRef(0)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failSafeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finishTransition = useCallback(() => {
    if (!visibleRef.current) return
    if (failSafeTimer.current) clearTimeout(failSafeTimer.current)
    failSafeTimer.current = null
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
    if (!visibleRef.current || pendingPath.current !== currentPath.current || activeFetches.current > 0 || routeContentIsLoading()) return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      if (!visibleRef.current || pendingPath.current !== currentPath.current || activeFetches.current > 0 || routeContentIsLoading()) return
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
    pendingPath.current = null
    failSafeTimer.current = setTimeout(finishTransition, NAVIGATION_FAILSAFE_MS)
  }, [finishTransition])

  // Keep the transition up until route navigation and client data fetches settle.
  useEffect(() => {
    const originalFetch = window.fetch
    const wrappedFetch: typeof window.fetch = (...args) => {
      activeFetches.current += 1
      if (settleTimer.current) clearTimeout(settleTimer.current)
      return originalFetch.apply(window, args).finally(() => {
        activeFetches.current = Math.max(0, activeFetches.current - 1)
        scheduleReadyCheck()
      })
    }
    window.fetch = wrappedFetch

    const contentObserver = new MutationObserver(() => scheduleReadyCheck())
    const appContent = document.querySelector('.ada-navigation-content')
    if (appContent) contentObserver.observe(appContent, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'class', 'data-testid'] })

    const initialTimer = setTimeout(scheduleReadyCheck, INITIAL_READY_DELAY_MS)
    return () => {
      clearTimeout(initialTimer)
      contentObserver.disconnect()
      if (window.fetch === wrappedFetch) window.fetch = originalFetch
    }
  }, [scheduleReadyCheck])

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
