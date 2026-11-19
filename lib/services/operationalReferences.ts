import { brandService, platformService, campaignService, userService, currentUserService } from './dataService'
import { getAuthMode } from '@/lib/auth/authMode'
import { resolveSystemPermission } from '@/lib/permissions'
import type { User } from '@/lib/types/database.types'
import { readTransientData } from './transientDataCache'

export type OperationalReferences = {
  brands: Awaited<ReturnType<typeof brandService.getAll>>
  platforms: Awaited<ReturnType<typeof platformService.getAll>>
  campaigns: Awaited<ReturnType<typeof campaignService.getAll>>
  users: Awaited<ReturnType<typeof userService.getAll>>
}

export function operationalReferenceIdentity(user: User): string {
  return [user.id, resolveSystemPermission(user), user.updated_at].join(':')
}

export function getOperationalReferences(user: User): Promise<OperationalReferences> {
  const identity = operationalReferenceIdentity(user)
  const verifyActor = async () => {
    // In mock mode, QA users may be supplied by an isolated browser fixture.
    if (getAuthMode() !== 'supabase') return true
    const actor = await currentUserService.getCurrent()
    return !!actor && operationalReferenceIdentity(actor) === identity
  }
  const read = () => readTransientData(identity, 'operational_references', async () => {
    const [brands, platforms, campaigns, users] = await Promise.all([
      brandService.getAll(), platformService.getAll(), campaignService.getAll(), userService.getAll(),
    ])
    return { brands, platforms, campaigns, users }
  }, verifyActor)
  return read().catch(async error => {
    if (!(error instanceof Error && error.message === 'CACHE_INVALIDATED')) throw error
    if (!(await verifyActor())) throw new Error('CACHE_IDENTITY_CHANGED')
    return read()
  })
}
