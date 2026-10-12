'use client'

import * as React from 'react'
import { useCurrentUser } from './useCurrentUser'
import { workforceService, workforceErrorMessage, type WorkforceCapabilities } from '@/lib/services/workforceService'

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

  React.useEffect(() => {
    if (userLoading || !identityKey) return
    const controller = new AbortController()
    void workforceService.getCapabilities(controller.signal).then(({ capabilities }) => {
      if (!controller.signal.aborted) setResult({ identityKey, capabilities })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ identityKey, error: workforceErrorMessage(error) })
    })
    return () => controller.abort()
  }, [identityKey, userLoading])

  const current = result?.identityKey === identityKey ? result : null
  return {
    currentUser,
    capabilities: current?.capabilities,
    loading: userLoading || Boolean(identityKey && !current),
    error: userLoading ? undefined : !currentUser
      ? 'Vui lòng đăng nhập để truy cập dữ liệu.' : current?.error,
    identityKey,
  }
}
