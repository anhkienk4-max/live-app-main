'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AdaLoadingScreen } from '@/components/branding/AdaLoadingScreen'

const INITIAL_DISPLAY_MS = 720
const EXIT_TRANSITION_MS = 260
const NAVIGATION_FAILSAFE_MS = 8_000

export function AdaNavigationTransition({ children }: { children: ReactNode }): ReactNode {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const visibleRef = useRef(true)
  const previousPath = useRef(pathname)
  const navigationStartedAtPath = useRef<string | null>(null)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failSafeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finishTransition = useCallback(() => {
    if (!visibleRef.current) return

    setExiting(true)
    if (exitTimer.current) clearTimeout(exitTimer.current)
    exitTimer.current = setTimeout(() => {
      visibleRef.current = false
      setVisible(false)
      setExiting(false)
      navigationStartedAtPath.current = null
      exitTimer.current = null
    }, EXIT_TRANSITION_MS)
  }, [])

  const beginTransition = useCallback((fromPath: string) => {
    if (exitTimer.current) clearTimeout(exitTimer.current)
    if (failSafeTimer.current) clearTimeout(failSafeTimer.current)
    visibleRef.current = true
    setVisible(true)
    setExiting(false)
    navigationStartedAtPath.current = fromPath
    failSafeTimer.current = setTimeout(() => {
      setExiting(true)
      exitTimer.current = setTimeout(() => {
        visibleRef.current = false
        setVisible(false)
        setExiting(false)
        navigationStartedAtPath.current = null
        exitTimer.current = null
      }, EXIT_TRANSITION_MS)
    }, NAVIGATION_FAILSAFE_MS)
  }, [])

  useEffect(() => {
    const timer = setTimeout(finishTransition, INITIAL_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [finishTransition])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return
      beginTransition(pathname)
    }

    const onPopState = () => beginTransition(pathname)
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [beginTransition, pathname])

  useEffect(() => {
    if (previousPath.current === pathname) return

    const previous = previousPath.current
    previousPath.current = pathname
    if (navigationStartedAtPath.current === null) beginTransition(previous)
    if (failSafeTimer.current) clearTimeout(failSafeTimer.current)
    finishTransition()
  }, [beginTransition, finishTransition, pathname])

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current)
    if (failSafeTimer.current) clearTimeout(failSafeTimer.current)
  }, [])

  return (
    <>
      {children}
      {visible && (
        <div className={`ada-navigation-transition${exiting ? ' ada-navigation-transition--exiting' : ''}`}>
          <AdaLoadingScreen overlay />
        </div>
      )}
    </>
  )
}
