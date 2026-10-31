export interface DashboardRecentItem {
  id: string
  kind: 'shift' | 'report' | 'registration' | 'swap'
  title: string
  description: string
  createdAt: string
  href: string
}

export function selectLatestDashboardItems(items: DashboardRecentItem[], limit = 5): DashboardRecentItem[] {
  if (!Number.isInteger(limit) || limit <= 0) return []

  return items
    .filter(item => Number.isFinite(Date.parse(item.createdAt)))
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, limit)
}
