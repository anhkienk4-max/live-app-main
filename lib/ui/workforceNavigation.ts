import type { WorkforceCapabilities } from '@/lib/services/workforceService'

export function filterWorkforceNavigation<T extends { href: string }>(items: T[], capabilities?: WorkforceCapabilities): T[] {
  return items.filter(item => item.href === '/payroll' ? capabilities?.payroll === true
    : item.href === '/workforce' ? capabilities?.team_performance === true || capabilities?.own_performance === true : true)
}
