import type { Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'

export const LIVE_LINK_EDITABLE_SHIFT_STATUSES = new Set<Shift['status']>([
  'scheduled',
  'preparing',
  'live',
  'paused',
])

const STAFF_ASSIGNED_ROLES = new Set(['support', 'host', 'technical'])

export type LiveLinkActor = User & { managed_brand_ids?: readonly string[] }

/**
 * Explicit C1 live-link / tab-sharing management authorization:
 * - Admin: all non-archived, non-completed/cancelled shifts.
 * - Leader: strictly brand-scoped (or directly assigned on the shift).
 * - Member (e.g. Support / "Tro"): scoped strictly to shifts where they hold
 *   an active assignment (`support_id`/`host_id`/`technical_id` or active
 *   `approved`/`manually_assigned` registration), never blanket `shifts.edit`.
 */
export function canManageShiftLiveLink(
  user: LiveLinkActor | null | undefined,
  shift: Pick<Shift, 'id' | 'brand_id' | 'status' | 'host_id' | 'support_id' | 'technical_id' | 'deleted_at' | 'archived_at'> | null | undefined,
  registrations: ReadonlyArray<Pick<ShiftRegistration, 'shift_id' | 'user_id' | 'status' | 'operational_role'>> = [],
): boolean {
  if (!user || !shift) return false
  if (shift.deleted_at || shift.archived_at) return false
  if (user.status !== 'active' || (user.account_status && user.account_status !== 'active')) return false
  if (!LIVE_LINK_EDITABLE_SHIFT_STATUSES.has(shift.status)) return false

  if (user.system_permission === 'admin' || user.role === 'admin') {
    return true
  }

  const isDirectlyAssigned =
    shift.support_id === user.id
    || shift.host_id === user.id
    || shift.technical_id === user.id

  if (hasPermission(user, 'shifts.edit')) {
    const brandIds = user.managed_brand_ids
    if (!brandIds || brandIds.length === 0 || !shift.brand_id) return true
    return brandIds.includes(shift.brand_id) || isDirectlyAssigned
  }

  if (isDirectlyAssigned) return true

  return registrations.some(
    registration =>
      registration.shift_id === shift.id
      && registration.user_id === user.id
      && (registration.status === 'approved' || registration.status === 'manually_assigned')
      && (!registration.operational_role || STAFF_ASSIGNED_ROLES.has(registration.operational_role)),
  )
}

export function canViewShiftLiveSession(
  user: LiveLinkActor | null | undefined,
  shift: Pick<Shift, 'id' | 'brand_id' | 'status' | 'host_id' | 'support_id' | 'technical_id' | 'deleted_at' | 'archived_at'> | null | undefined,
  registrations: ReadonlyArray<Pick<ShiftRegistration, 'shift_id' | 'user_id' | 'status' | 'operational_role'>> = [],
): boolean {
  if (!user || !shift) return false
  if (shift.deleted_at || shift.archived_at) return false
  if (user.status !== 'active' || (user.account_status && user.account_status !== 'active')) return false
  if (!LIVE_LINK_EDITABLE_SHIFT_STATUSES.has(shift.status)) return false
  if (canManageShiftLiveLink(user, shift, registrations)) return true

  if (hasPermission(user, 'shifts.edit') || user.system_permission === 'leader' || user.role === 'leader') {
    const brandIds = user.managed_brand_ids
    if (!brandIds || brandIds.length === 0 || !shift.brand_id) return true
    return brandIds.includes(shift.brand_id)
  }

  return false
}

/**
 * Live links are user-supplied. Only verified TikTok/Shopee HTTPS destinations
 * may be linked or embedded. A valid link does NOT prove the session is live.
 */
export type LivePlatform = 'TikTok' | 'Shopee'
export type VerifiedLiveLink = { href: string; platform: LivePlatform }
export type LiveLinkClassification =
  | { kind: 'viewer'; link: VerifiedLiveLink }
  | { kind: 'direct-media' }
  | { kind: 'unsupported' }

const TIKTOK_HOSTS = new Set([
  'tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com',
  'vt.tiktok.com', 'live.tiktok.com',
])
const SHOPEE_HOSTS = new Set([
  'shopee.vn', 'www.shopee.vn', 'live.shopee.vn', 's.shopee.vn',
  'shopee.com', 'www.shopee.com', 'live.shopee.com',
])

export function verifyLiveStreamLink(raw: string | null | undefined): VerifiedLiveLink | null {
  if (!raw || raw.length > 2048 || raw.trim() !== raw || /[\u0000-\u001f\u007f]/.test(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const hostname = url.hostname.toLowerCase()
    const platform = TIKTOK_HOSTS.has(hostname) ? 'TikTok' : SHOPEE_HOSTS.has(hostname) ? 'Shopee' : null
    if (!platform) return null
    return { href: url.href, platform }
  } catch {
    return null
  }
}

export function classifyLiveStreamLink(raw: string | null | undefined): LiveLinkClassification {
  const link = verifyLiveStreamLink(raw)
  if (link) return { kind: 'viewer', link }
  if (!raw || raw.length > 2048 || raw.trim() !== raw || /[\u0000-\u001f\u007f]/.test(raw)) {
    return { kind: 'unsupported' }
  }
  try {
    const url = new URL(raw)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /\.(?:m3u8|mp4|m4v|webm|mov|mpd)$/i.test(url.pathname)) {
      return { kind: 'direct-media' }
    }
  } catch {
    return { kind: 'unsupported' }
  }
  return { kind: 'unsupported' }
}
