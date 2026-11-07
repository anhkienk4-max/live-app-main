'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AdaLoadingScreen } from '@/components/branding/AdaLoadingScreen'

const EXIT_TRANSITION_MS = 200
const ROUTE_READINESS_TIMEOUT_MS = 20_000
const EXPLICIT_READINESS_PATHS = new Set(['/','/calendar','/registration','/staffing','/reports','/workforce'])

function routeHasTerminalState(): boolean {
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
  const content = document.querySelector('.ada-navigation-content')
  const main = content?.querySelector('main') ?? content
  if (!main) return false
  if (routeHasTerminalState()) return false
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

function routeIsReady(pathname: string): boolean {
  if (routeHasTerminalState()) return true
  const content = document.querySelector('.ada-navigation-content')
  if (!content) return false
  const states = [...content.querySelectorAll<HTMLElement>('[data-route-readiness]')]
    .map(element => element.dataset.routeReadiness)
  if (states.includes('error')) return true
  if (states.includes('pending')) return false
  if (states.includes('ready')) return true
  if (routeContentIsLoading()) return false
  return !EXPLICIT_READINESS_PATHS.has(pathname)
}

function currentRouteKey(): string {
  return `${window.location.pathname}${window.location.search}`
}

export function AdaNavigationTransition({ children }: { children: ReactNode }): ReactNode {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const visibleRef = useRef(true)
  const exitStarted = useRef(false)
  const previousPath = useRef(pathname)
  const pendingRouteKey = useRef<string | null>(null)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const retryButton = useRef<HTMLButtonElement>(null)

  const finishTransition = useCallback(() => {
    if (!visibleRef.current || exitStarted.current) return
    exitStarted.current = true
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current)
    timeoutTimer.current = null
    setTimedOut(false)
    setExiting(true)
    if (exitTimer.current) clearTimeout(exitTimer.current)
    exitTimer.current = setTimeout(() => {
      visibleRef.current = false
      setVisible(false)
      setExiting(false)
      exitStarted.current = false
      pendingRouteKey.current = null
      exitTimer.current = null
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
      previousFocus.current = null
    }, EXIT_TRANSITION_MS)
  }, [])

  const scheduleReadyCheck = useCallback(() => {
    if (!visibleRef.current || pendingRouteKey.current !== currentRouteKey()) return
    if (!routeIsReady(window.location.pathname)) return
    requestAnimationFrame(() => requestAnimationFrame(finishTransition))
  }, [finishTransition])

  const beginTransition = useCallback((destinationKey: string) => {
    if (exitTimer.current) clearTimeout(exitTimer.current)
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current)
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    visibleRef.current = true
    exitStarted.current = false
    setVisible(true)
    setExiting(false)
    setTimedOut(false)
    pendingRouteKey.current = destinationKey
    timeoutTimer.current = setTimeout(() => setTimedOut(true), ROUTE_READINESS_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    pendingRouteKey.current = currentRouteKey()
    timeoutTimer.current = setTimeout(() => setTimedOut(true), ROUTE_READINESS_TIMEOUT_MS)
    const contentObserver = new MutationObserver(scheduleReadyCheck)
    const appContent = document.querySelector('.ada-navigation-content')
    if (appContent) contentObserver.observe(appContent, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-busy', 'class', 'data-route-readiness', 'data-testid', 'role'],
    })
    const readyFrame = requestAnimationFrame(scheduleReadyCheck)

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
      const destination = new URL(anchor.href, window.location.href)
      const destinationKey = `${destination.pathname}${destination.search}`
      if (destination.origin !== window.location.origin || destinationKey === currentRouteKey()) return
      beginTransition(destinationKey)
    }
    const onPopState = () => {
      const destinationKey = currentRouteKey()
      if (destinationKey !== pendingRouteKey.current) beginTransition(destinationKey)
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)

    return () => {
      cancelAnimationFrame(readyFrame)
      if (timeoutTimer.current) clearTimeout(timeoutTimer.current)
      contentObserver.disconnect()
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [beginTransition, scheduleReadyCheck])

  useEffect(() => {
    const routeKey = currentRouteKey()
    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      if (!visibleRef.current) beginTransition(routeKey)
      pendingRouteKey.current = routeKey
      scheduleReadyCheck()
    }
  }, [beginTransition, pathname, scheduleReadyCheck])

  useEffect(() => {
    if (timedOut) retryButton.current?.focus()
  }, [timedOut])

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current)
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current)
  }, [])

  return (
    <>
      <div className="ada-navigation-content" aria-hidden={visible} inert={visible}>
        {children}
      </div>
      {visible && (
        <div className={`ada-navigation-transition${exiting ? ' ada-navigation-transition--exiting' : ''}`}>
          <AdaLoadingScreen overlay />
          {timedOut && <div role="alertdialog" aria-modal="true" aria-labelledby="ada-route-timeout-title" className="absolute inset-x-4 bottom-6 z-[10001] mx-auto max-w-md rounded-xl border border-amber-200 bg-white p-5 text-center shadow-xl">
            <h2 id="ada-route-timeout-title" className="font-semibold text-slate-900">Trang đang tải lâu hơn dự kiến</h2>
            <p className="mt-2 text-sm text-slate-600">Chưa xác nhận được dữ liệu. Hãy thử tải lại trang.</p>
            <button ref={retryButton} type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Thử tải lại</button>
          </div>}
        </div>
      )}
    </>
  )
}
