'use client'

import * as React from 'react'
import { useCurrentUser } from './useCurrentUser'
import { workforceService, workforceErrorMessage, type WorkforceCapabilities } from '@/lib/services/workforceService'
import { readSharedWorkforceCapabilities, invalidateSharedWorkforceCapabilities } from '@/lib/services/sharedWorkforceCapabilities'
import { ROLE_DEFAULTS_CATALOG } from '@/lib/rbac/roleDefaults'
import { permissionMatrix, resolveSystemPermission, type Permission } from '@/lib/permissions'
import { HARD_RESTRICTED_PERMISSIONS } from '@/lib/rbac/effectivePermission'
import type { SystemPermission } from '@/lib/types/database.types'

async function readEffectivePermissionDecisions(role: SystemPermission): Promise<Partial<Record<Permission, boolean>> | null> {
  try {
    const response = await fetch('/api/rbac/capabilities', { credentials: 'same-origin', cache: 'no-store' })
    const body = await response.json() as { ok?: unknown; role?: unknown; permissions?: unknown }
    if (!response.ok || body.ok !== true || body.role !== role || !Array.isArray(body.permissions)
      || body.permissions.length !== ROLE_DEFAULTS_CATALOG.length) return null

    const allowed = new Set<Permission>(ROLE_DEFAULTS_CATALOG.map(item => item.permission))
    const decisions: Partial<Record<Permission, boolean>> = {}
    for (const value of body.permissions) {
      if (!value || typeof value !== 'object') return null
      const decision = value as { permission?: unknown; allowed?: unknown }
      if (typeof decision.permission !== 'string' || !allowed.has(decision.permission as Permission)
        || typeof decision.allowed !== 'boolean' || decision.permission in decisions) return null
      const permission = decision.permission as Permission
      if (HARD_RESTRICTED_PERMISSIONS.has(permission)
        && decision.allowed !== permissionMatrix[role].has(permission)) return null
      decisions[permission] = decision.allowed
    }
    return Object.keys(decisions).length === allowed.size ? decisions : null
  } catch {
    return null
  }
}

export function useWorkforceCapabilities() {
  const { currentUser, loading: userLoading, authIdentity } = useCurrentUser()
  const systemPermission = resolveSystemPermission(currentUser)
  const identityKey = currentUser
    ? `${authIdentity?.auth_user_id || ''}:${currentUser.id}:${systemPermission}:${currentUser.role}`
    : null
  const [result, setResult] = React.useState<{
    identityKey: string
    capabilities?: WorkforceCapabilities
    effectivePermissions?: Partial<Record<Permission, boolean>> | null
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
    void readSharedWorkforceCapabilities(identityKey, async () => {
      const [workforceResult, permissionResult] = await Promise.allSettled([
        workforceService.getCapabilities(),
        readEffectivePermissionDecisions(systemPermission),
      ])
      if (workforceResult.status === 'rejected') throw workforceResult.reason
      return {
        capabilities: workforceResult.value.capabilities,
        effectivePermissions: permissionResult.status === 'fulfilled' ? permissionResult.value : null,
      }
    }).then(({ capabilities, effectivePermissions }) => {
      if (!controller.signal.aborted) setResult({ identityKey, capabilities, effectivePermissions })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ identityKey, error: workforceErrorMessage(error) })
    })
    return () => controller.abort()
  }, [identityKey, systemPermission, userLoading, revision])

  const current = result?.identityKey === identityKey ? result : null
  return {
    currentUser,
    capabilities: current?.capabilities,
    effectivePermissions: current?.effectivePermissions,
    loading: userLoading || Boolean(identityKey && !current),
    error: userLoading ? undefined : !currentUser
      ? 'Vui lòng đăng nhập để truy cập dữ liệu.' : current?.error,
    identityKey,
    reload,
  }
}
