import type { WorkforceCapabilities } from '@/lib/services/workforceService'
import type { NavAccessStatus } from '@/lib/ui/role-ux'

export function filterWorkforceNavigation<T extends { href: string; accessStatus?: NavAccessStatus }>(
  items: T[],
  capabilities?: WorkforceCapabilities,
): T[] {
  return items.map(item => {
    if (item.href === '/payroll') {
      if (capabilities?.payroll === true) {
        return { ...item, accessStatus: 'available' as NavAccessStatus }
      }
      return { ...item, accessStatus: 'restricted' as NavAccessStatus }
    }
    if (item.href === '/workforce') {
      if (capabilities?.team_performance === true) {
        return { ...item, accessStatus: 'available' as NavAccessStatus }
      }
      if (capabilities?.own_performance === true) {
        return { ...item, accessStatus: 'read_only' as NavAccessStatus }
      }
      return { ...item, accessStatus: 'restricted' as NavAccessStatus }
    }
    return item
  })
}
