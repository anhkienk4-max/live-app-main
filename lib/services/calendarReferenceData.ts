import { brandService, platformService, campaignService, userService } from './dataService'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import type { User } from '@/lib/types/database.types'

type References = { brands: Awaited<ReturnType<typeof brandService.getAll>>; platforms: Awaited<ReturnType<typeof platformService.getAll>>; campaigns: Awaited<ReturnType<typeof campaignService.getAll>>; users: User[] }
let cached: { key: string; expires: number; promise: Promise<References> } | undefined

export function getCalendarReferences(user: User): Promise<References> {
  const key = user.id + ':' + resolveSystemPermission(user) + ':' + user.updated_at
  if (cached?.key === key && cached.expires > Date.now()) return cached.promise
  const promise = Promise.all([
    brandService.getAll(), platformService.getAll(), campaignService.getAll(),
    hasPermission(user, 'shifts.approve_registration') ? userService.getAllFiltered() : Promise.resolve([] as User[]),
  ]).then(([brands, platforms, campaigns, users]) => ({ brands, platforms, campaigns, users }))
  cached = { key, expires: Date.now() + 60_000, promise }
  void promise.catch(() => { if (cached?.promise === promise) cached = undefined })
  return promise
}

export function clearCalendarReferences() { cached = undefined }
