'use client'

import * as React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { shiftService, userService, brandService, campaignService, reportService } from '@/lib/services/dataService'
import { Search, Calendar, User, Briefcase, Tag, Clock, FileText, Users, LayoutGrid, Upload } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'

interface SearchResult {
  id: string
  type: 'shift' | 'staff' | 'brand' | 'campaign' | 'report' | 'action'
  title: string
  subtitle: string
  url: string
  icon: React.ReactNode
  badge?: string
}

const normalize = (value: string) => value
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')

export function GlobalSearch() {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const { currentUser } = useCurrentUser()
  const [cache, setCache] = React.useState<{ shifts: Awaited<ReturnType<typeof shiftService.getAll>>; brands: Awaited<ReturnType<typeof brandService.getAll>>; campaigns: Awaited<ReturnType<typeof campaignService.getAll>>; users: Awaited<ReturnType<typeof userService.getAll>>; reports: Awaited<ReturnType<typeof reportService.getAll>> } | null>(null)

  // Listen for Cmd/Ctrl + K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Preload lightweight data once when dialog opens
  React.useEffect(() => {
    if (!open || cache) return
    let cancelled = false
    void (async () => {
      try {
        const [shifts, users, brands, campaigns, reports] = await Promise.all([
          shiftService.getAll(),
          userService.getAll(),
          brandService.getAll(),
          campaignService.getAll(),
          reportService.getAll().catch(()=> [] as never),
        ])
        if (!cancelled) setCache({ shifts, users, brands, campaigns, reports })
      } catch { /* ignore preload errors */ }
    })()
    return () => { cancelled = true }
  }, [open, cache])

  // Perform search locally, deterministic, no per-keystroke fetch
  React.useEffect(() => {
    if (!open) return
    const canViewShifts = !currentUser || hasPermission(currentUser, 'shifts.view_open') || hasPermission(currentUser, 'shifts.view_assigned')
    const canAssignStaff = currentUser && hasPermission(currentUser, 'shifts.assign_staff')
    const canImportShifts = currentUser && hasPermission(currentUser, 'shifts.import')
    const canViewStaff = !currentUser || hasPermission(currentUser, 'staff.manage')
    const canViewReports = !currentUser || hasPermission(currentUser, 'reports.submit') || hasPermission(currentUser, 'reports.review')

    if (!query.trim()) {
      // Show quick actions when empty, respecting permissions
      const actions: SearchResult[] = []
      if (canViewShifts) {
        actions.push({ id: 'action-calendar', type: 'action', title: t('openCalendar'), subtitle: t('viewShifts'), url: '/calendar', icon: <Calendar className="h-4 w-4" /> })
      }
      if (canImportShifts) {
        actions.push({ id: 'action-import', type: 'action', title: t('openImportSchedule'), subtitle: t('importShifts'), url: '/calendar?action=import', icon: <Upload className="h-4 w-4" /> })
      }
      if (canAssignStaff) {
        actions.push({ id: 'action-create-shift', type: 'action', title: t('createShift'), subtitle: t('newShift'), url: '/calendar?action=create', icon: <Calendar className="h-4 w-4" /> })
      }
      if (canViewReports) {
        actions.push({ id: 'action-reports', type: 'action', title: t('openReports'), subtitle: t('viewReports'), url: '/reports', icon: <FileText className="h-4 w-4" /> })
      }
      if (canViewStaff) {
        actions.push({ id: 'action-staff', type: 'action', title: t('openStaff'), subtitle: t('manageStaff'), url: '/staff', icon: <Users className="h-4 w-4" /> })
      }
      setResults(actions.slice(0,5))
      return
    }
    if (!cache) {
      setLoading(true)
      return
    }
    const q = normalize(query)
    const searchResults: SearchResult[] = []
    const canViewBrands = true
    const canViewCampaigns = true

    // Search shifts (cap 5, secondary brand + date/time)
    if (canViewShifts) {
      cache.shifts.filter(s => {
        const brand = cache.brands.find(b => b.id === s.brand_id)
        return normalize(brand?.name || '').includes(q) || normalize(s.product_notes || '').includes(q) || normalize(s.title || '').includes(q) || normalize(s.date).includes(q)
      }).slice(0, 5).forEach(shift => {
        const brand = cache.brands.find(b => b.id === shift.brand_id)
        searchResults.push({
          id: shift.id,
          type: 'shift',
          title: `${brand?.name || 'Unknown'} · ${shift.title || 'Shift'}`,
          subtitle: `${shift.date} · ${formatShiftTimeRange(shift)}`,
          url: '/calendar',
          icon: <Calendar className="h-4 w-4" />,
          badge: shift.status
        })
      })
    }
    // Search staff (cap 5, use cached users filtered locally, not remote search)
    if (canViewStaff) {
      cache.users.filter(u => normalize(u.full_name).includes(q) || normalize(u.email).includes(q)).slice(0, 5).forEach(user => {
        searchResults.push({
          id: user.id,
          type: 'staff',
          title: user.full_name,
          subtitle: user.email,
          url: '/staff',
          icon: <User className="h-4 w-4" />,
          badge: user.role
        })
      })
    }
    // Search brands (cap 3)
    if (canViewBrands) {
      cache.brands.filter(b => normalize(b.name).includes(q)).slice(0, 3).forEach(brand => {
        searchResults.push({ id: brand.id, type: 'brand', title: brand.name, subtitle: t('brand'), url: '/brands', icon: <Briefcase className="h-4 w-4" /> })
      })
    }
    // Search campaigns (cap 3)
    if (canViewCampaigns) {
      cache.campaigns.filter(c => normalize(c.name).includes(q)).slice(0, 3).forEach(campaign => {
        searchResults.push({ id: campaign.id, type: 'campaign', title: campaign.name, subtitle: `${format(new Date(campaign.start_date), 'MMM d')} - ${format(new Date(campaign.end_date), 'MMM d')}`, url: '/campaigns', icon: <Tag className="h-4 w-4" /> })
      })
    }
    // Search reports (cap 3, lightweight: use already cached reports, no OCR payload)
    if (canViewReports) {
      cache.reports.filter(r => {
        const shift = cache.shifts.find(s => s.id === r.shift_id)
        const brand = shift ? cache.brands.find(b => b.id === shift.brand_id)?.name : ''
        return normalize(brand || '').includes(q) || normalize(shift?.date || '').includes(q) || normalize(r.id).includes(q)
      }).slice(0, 3).forEach(report => {
        const shift = cache.shifts.find(s => s.id === report.shift_id)
        searchResults.push({
          id: report.id,
          type: 'report',
          title: `${t('report')} ${report.id.slice(0,8)}`,
          subtitle: shift ? `${shift.date} · ${shift.start_time}` : t('report'),
          url: '/reports',
          icon: <FileText className="h-4 w-4" />,
          badge: report.status || (report.metrics_confirmed ? t('confirmed') : t('draft'))
        })
      })
    }
    const actionCandidates: SearchResult[] = []
    const normOpenCalendar = normalize(t('openCalendar'))
    const normCalendar = normalize(t('calendar'))
    if (normOpenCalendar.includes(q) || normCalendar.includes(q) || normalize('Open Calendar').includes(q) || normalize('calendar').includes(q)) actionCandidates.push({ id: 'action-calendar-q', type: 'action', title: t('openCalendar'), subtitle: t('viewShifts'), url: '/calendar', icon: <Calendar className="h-4 w-4" /> })
    if (canAssignStaff && (normalize(t('createShift')).includes(q) || normalize(t('newShift')).includes(q) || normalize('Create Shift').includes(q) || normalize('create shift').includes(q))) actionCandidates.push({ id: 'action-create-shift-q', type: 'action', title: t('createShift'), subtitle: t('newShift'), url: '/calendar?action=create', icon: <Calendar className="h-4 w-4" /> })
    if (canImportShifts && (normalize(t('openImportSchedule')).includes(q) || normalize(t('importShifts')).includes(q) || normalize('Open Import Schedule').includes(q) || normalize('import schedule').includes(q) || normalize('import').includes(q))) actionCandidates.push({ id: 'action-import-q', type: 'action', title: t('openImportSchedule'), subtitle: t('importShifts'), url: '/calendar?action=import', icon: <Upload className="h-4 w-4" /> })
    if (normalize(t('openReports')).includes(q) || normalize(t('reports')).includes(q) || normalize('Open Reports').includes(q)) actionCandidates.push({ id: 'action-reports-q', type: 'action', title: t('openReports'), subtitle: t('viewReports'), url: '/reports', icon: <FileText className="h-4 w-4" /> })
    if (actionCandidates.length) searchResults.push(...actionCandidates.slice(0,3))

    // Cap total and keep deterministic order: shifts(5) + staff(5) + brands(3) + campaigns(3) + reports(3) already capped per entity
    setResults(searchResults.slice(0, 18))
    setLoading(false)
  }, [query, cache, open, currentUser, t])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    router.push(result.url)
  }

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors w-64"
      >
        <Search className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="ml-auto px-2 py-0.5 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded">
          ⌘K
        </kbd>
      </button>

      {/* Search Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" className="gap-0 p-0">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search shifts, staff, brands, campaigns..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 border-0 focus-visible:ring-0"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-8 text-gray-600">Searching...</div>
            ) : results.length === 0 && query ? (
              <div className="text-center py-8">
                <Search className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600">No results found for &quot;{query}&quot;</p>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-2">Start typing to search</p>
                <div className="text-xs space-y-1">
                  <div>Search for shifts, staff, brands, or campaigns</div>
                  <div>Use ⌘K (Mac) or Ctrl+K (Windows) to open</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const quickActions = results.filter(r => r.title === 'Create Shift' || r.title === 'Open Import Schedule')
                  const goTo = results.filter(r => r.title === 'Open Calendar' || r.title === 'Open Reports' || r.title === 'Open Staff')
                  const others = results.filter(r => !quickActions.includes(r) && !goTo.includes(r))
                  const renderButton = (result: SearchResult) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleSelect(result)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
                    >
                      <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-lg">
                        {result.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{result.title}</div>
                        <div className="text-xs text-gray-600 truncate">{result.subtitle}</div>
                      </div>
                      {result.badge && (
                        <Badge variant="secondary" className="text-xs">
                          {result.badge}
                        </Badge>
                      )}
                    </button>
                  )
                  return (
                    <>
                      {others.length > 0 && <div className="space-y-1">{others.map(renderButton)}</div>}
                      {quickActions.length > 0 && (
                        <div>
                          <div className="px-2 py-1 text-xs font-semibold text-gray-500">QUICK ACTIONS</div>
                          <div className="space-y-1">{quickActions.map(renderButton)}</div>
                        </div>
                      )}
                      {goTo.length > 0 && (
                        <div>
                          <div className="px-2 py-1 text-xs font-semibold text-gray-500">GO TO</div>
                          <div className="space-y-1">{goTo.map(renderButton)}</div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div className="p-3 border-t bg-gray-50 text-xs text-gray-600 flex items-center justify-between">
              <div>Press Enter to select</div>
              <div>ESC to close</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
