'use client'

import * as React from 'react'
import { useCurrentUser } from './useCurrentUser'
import { workforceService, workforceErrorMessage, type WorkforceCapabilities } from '@/lib/services/workforceService'
import { readSharedWorkforceCapabilities, invalidateSharedWorkforceCapabilities } from '@/lib/services/sharedWorkforceCapabilities'

export function useWorkforceCapabilities() {
  const { currentUser, loading: userLoading, authIdentity } = useCurrentUser()
  const identityKey = currentUser
    ? `${authIdentity?.auth_user_id || ''}:${currentUser.id}:${currentUser.system_permission}:${currentUser.role}`
    : null
  const [result, setResult] = React.useState<{
    identityKey: string
    capabilities?: WorkforceCapabilities
    error?: string
  } | null>(null)
  const [revision, reload] = React.useReducer(n => n + 1, 0)
  const request = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const invalidate = (event: Event) => {
      request.current?.abort()
      invalidateSharedWorkforceCapabilities(identityKey)
      const detail = (event as CustomEvent<{ message?: string; revalidate?: boolean }>).detail
      if (detail?.revalidate) {
        // Read server-authoritative capabilities again; keep protected UI gated
        // while the check runs instead of preserving an unrelated 403 forever.
        setResult(null)
        reload()
        return
      }
      const message = detail?.message
      setResult(identityKey ? { identityKey, error: message || 'Quyền truy cập đã thay đổi. Vui lòng xác minh lại.' } : null)
    }
    const refresh = () => { invalidateSharedWorkforceCapabilities(identityKey); reload() }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('workforce-access-invalidated', invalidate)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('workforce-access-invalidated', invalidate)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [identityKey])

  React.useEffect(() => {
    if (userLoading || !identityKey) return
    const controller = new AbortController()
    request.current = controller
    // Sharing the underlying request prevents duplicate fetches from Sidebar,
    // Shift Details and Export Dialog. Unmounting one consumer only cancels
    // its own state update, not the shared network request.
    void readSharedWorkforceCapabilities(identityKey, () => workforceService.getCapabilities()).then(({ capabilities }) => {
      if (!controller.signal.aborted) setResult({ identityKey, capabilities })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ identityKey, error: workforceErrorMessage(error) })
    })
    return () => controller.abort()
  }, [identityKey, userLoading, revision])

  const current = result?.identityKey === identityKey ? result : null
  return {
    currentUser,
    capabilities: current?.capabilities,
    loading: userLoading || Boolean(identityKey && !current),
    error: userLoading ? undefined : !currentUser
      ? 'Vui lòng đăng nhập để truy cập dữ liệu.' : current?.error,
    identityKey,
    reload,
  }
}
