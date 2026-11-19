import type { Brand, OperationalRole, Platform, Shift } from '../types/database.types'

/** Advisory picker only. Server-side swap authorization remains authoritative. */
export function searchEligibleSwapShifts(
  shifts: readonly Shift[],
  assignedRoles: Readonly<Record<string, readonly OperationalRole[]>>,
  search: string,
  brands: readonly Pick<Brand, 'id' | 'name'>[],
  platforms: readonly Pick<Platform, 'id' | 'name'>[],
  maxResults = 50,
): Shift[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
  const term = normalize(search)
  const brandNames = new Map(brands.map(brand => [brand.id, brand.name]))
  const platformNames = new Map(platforms.map(platform => [platform.id, platform.name]))
  const limit = Number.isInteger(maxResults) ? Math.max(1, Math.min(100, maxResults)) : 50
  return shifts.filter(shift => Boolean(assignedRoles[shift.id]?.length) && shift.status !== 'cancelled' && !shift.deleted_at && !shift.archived_at)
    .filter(shift => {
      if (!term) return true
      const formattedDate = shift.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const dateSearch = formattedDate ? `${formattedDate[3]}/${formattedDate[2]}/${formattedDate[1]}` : ''
      const fields = [shift.id, shift.date, dateSearch, shift.start_time, shift.end_time, shift.title ?? '', shift.studio ?? '', brandNames.get(shift.brand_id) ?? '', platformNames.get(shift.platform_id) ?? '']
      return fields.some(field => normalize(field).includes(term))
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id))
    .slice(0, limit)
}
