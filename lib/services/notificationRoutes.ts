import type { AppNotification } from '@/lib/types/database.types'

const KNOWN_NOTIFICATION_ROUTES = new Set([
  '/calendar',
  '/swaps',
  '/reports',
  '/staff',
  '/notifications',
])

export function resolveNotificationDestination(n: AppNotification): string {
  if (n.action_url && KNOWN_NOTIFICATION_ROUTES.has(n.action_url)) return n.action_url
  // Only the generated, single-parameter report deep link is accepted.
  // Reject external URLs, protocol-relative links, fragments and extra query keys.
  if (n.type.startsWith('report') && n.action_url && /^\/reports\?shiftId=[A-Za-z0-9_-]{1,128}$/.test(n.action_url)) return n.action_url
  if (n.type.startsWith('swap')) return '/swaps'
  if (n.type.startsWith('report')) return '/reports'
  if (n.type === 'shift_assigned') return '/calendar?tab=mine'
  if (
    n.type === 'registration_submitted' ||
    n.type === 'staffing_approval' ||
    n.type === 'staffing_rejection' ||
    n.type.startsWith('import')
  )
    return '/calendar'
  if (n.type === 'account_request_submitted') return '/staff'
  return '/notifications'
}
