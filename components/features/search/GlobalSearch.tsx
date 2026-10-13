'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Search, Calendar, User, Briefcase, Tag, FileText, Users, Upload } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getCollectionPage } from '@/lib/services/operationsPageService'
import type { Brand, Campaign, Report, Shift, User as StaffUser } from '@/lib/types/database.types'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'

type SearchResult = {
  id: string
  type: 'shift' | 'staff' | 'brand' | 'campaign' | 'report' | 'action'
  title: string
  subtitle: string
  url: string
  icon: React.ReactNode
  badge?: string
}

const normalize = (value: string) => value.trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

// Every request is filtered and capped by the authenticated collection endpoint.
export async function searchCollections(query: string, role: 'admin' | 'leader' | 'member', signal?: AbortSignal) {
  const filters = { search: query.trim() }
  const page = { page: 1, pageSize: 10 as const, filters }
  const [shifts, staff, brands, campaigns, reports] = await Promise.all([
    getCollectionPage<Shift>('shifts', page, signal),
    role === 'admin' ? getCollectionPage<StaffUser>('staff', page, signal) : Promise.resolve(null),
    getCollectionPage<Brand>('brands', page, signal),
    getCollectionPage<Campaign>('campaigns', page, signal),
    getCollectionPage<Report>('reports', page, signal),
  ])
  return { shifts: shifts.items, staff: staff?.items ?? [], brands: brands.items, campaigns: campaigns.items, reports: reports.items }
}

export function GlobalSearch() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentUser, loading: userLoading } = useCurrentUser()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [resultsKey, setResultsKey] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)
  const role = resolveSystemPermission(currentUser)
  const resultKey = `${currentUser?.id ?? ''}:${role}:${query}`
  const visibleResults = currentUser && !userLoading && resultsKey === resultKey ? results : []

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  React.useEffect(() => {
    if (!open || userLoading || !currentUser) return
    const controller = new AbortController()
    let timer: number | undefined
    const frame = window.requestAnimationFrame(() => {
    const canViewShifts = hasPermission(currentUser, 'shifts.view_open') || hasPermission(currentUser, 'shifts.view_assigned')
    const canAssignStaff = hasPermission(currentUser, 'shifts.assign_staff')
    const canImportShifts = hasPermission(currentUser, 'shifts.import')
    const canViewStaff = hasPermission(currentUser, 'staff.manage')
    const canViewReports = hasPermission(currentUser, 'reports.submit') || hasPermission(currentUser, 'reports.review')
    const actions: SearchResult[] = []
    const addAction = (id: string, title: string, subtitle: string, url: string, icon: React.ReactNode) => {
      actions.push({ id, type: 'action', title, subtitle, url, icon })
    }
    if (canViewShifts) addAction('calendar', t('openCalendar'), t('viewShifts'), '/calendar', <Calendar className="h-4 w-4" />)
    if (canImportShifts) addAction('import', t('openImportSchedule'), t('importShifts'), '/calendar?action=import', <Upload className="h-4 w-4" />)
    if (canAssignStaff) addAction('create', t('createShift'), t('newShift'), '/calendar?action=create', <Calendar className="h-4 w-4" />)
    if (canViewReports) addAction('reports', t('openReports'), t('viewReports'), '/reports', <FileText className="h-4 w-4" />)
    if (canViewStaff) addAction('staff', t('openStaff'), t('manageStaff'), '/staff', <Users className="h-4 w-4" />)
    const q = normalize(query)
    if (!q) {
      setResults(actions)
      setResultsKey(resultKey)
      setError(false)
      setLoading(false)
      return
    }
    const matchingActions = actions.filter(action => normalize(action.title).includes(q) || normalize(action.subtitle).includes(q))
    if (query.trim().length > 256) {
      setResults([])
      setResultsKey(resultKey)
      setError(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    timer = window.setTimeout(() => {
      void searchCollections(query, role, controller.signal).then(data => {
        if (controller.signal.aborted) return
        const found: SearchResult[] = []
        if (canViewShifts) data.shifts.slice(0, 5).forEach(shift => found.push({
          id: shift.id, type: 'shift', title: shift.title || 'Shift',
          subtitle: `${shift.date} · ${formatShiftTimeRange(shift)}`, url: '/calendar',
          icon: <Calendar className="h-4 w-4" />, badge: shift.status,
        }))
        if (canViewStaff) data.staff.slice(0, 5).forEach(staff => found.push({
          id: staff.id, type: 'staff', title: staff.full_name, subtitle: staff.email,
          url: '/staff', icon: <User className="h-4 w-4" />, badge: staff.role,
        }))
        data.brands.slice(0, 3).forEach(brand => found.push({
          id: brand.id, type: 'brand', title: brand.name, subtitle: t('brand'),
          url: '/brands', icon: <Briefcase className="h-4 w-4" />,
        }))
        data.campaigns.slice(0, 3).forEach(campaign => found.push({
          id: campaign.id, type: 'campaign', title: campaign.name,
          subtitle: `${format(new Date(campaign.start_date), 'MMM d')} - ${format(new Date(campaign.end_date), 'MMM d')}`,
          url: '/campaigns', icon: <Tag className="h-4 w-4" />,
        }))
        if (canViewReports) data.reports.slice(0, 3).forEach(report => found.push({
          id: report.id, type: 'report', title: `${t('report')} ${report.id.slice(0, 8)}`,
          subtitle: t('report'), url: '/reports', icon: <FileText className="h-4 w-4" />,
          badge: report.status || (report.metrics_confirmed ? t('confirmed') : t('draft')),
        }))
        setResults([...found, ...matchingActions].slice(0, 18))
        setResultsKey(resultKey)
        setLoading(false)
      }).catch(() => {
        if (!controller.signal.aborted) {
          setResults([])
          setResultsKey(resultKey)
          setError(true)
          setLoading(false)
        }
      })
    }, 250)
    })
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); controller.abort() }
  }, [open, query, currentUser, userLoading, role, resultKey, t])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    router.push(result.url)
  }

  return <>
    <button onClick={() => setOpen(true)} type="button" aria-label={t('search')}
      className="flex h-9 w-9 items-center justify-center gap-2 rounded-md text-[12px] text-slate-400 hover:bg-slate-50 lg:w-full lg:max-w-[440px] lg:justify-start lg:border lg:border-slate-200 lg:bg-slate-50 lg:px-3">
      <Search className="h-4 w-4" /><span className="hidden lg:inline">{t('search')}...</span>
      <kbd className="ml-auto hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400 lg:block">⌘K</kbd>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md" className="gap-0 p-0">
        <div className="p-4 border-b"><div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search shifts, staff, brands, campaigns..." value={query}
            onChange={event => setQuery(event.target.value)} className="pl-10 border-0 focus-visible:ring-0" autoFocus />
        </div></div>
        <div className="max-h-96 overflow-y-auto p-2" aria-live="polite">
          {userLoading ? <div className="text-center py-8 text-gray-600">Searching...</div>
            : !currentUser ? <div className="text-center py-8 text-gray-600">Sign in to search.</div>
            : loading ? <div className="text-center py-8 text-gray-600">Searching...</div>
            : error && resultsKey === resultKey ? <div role="alert" className="text-center py-8 text-red-700">Search failed. Please try again.</div>
            : visibleResults.length === 0 && query ? <div className="text-center py-8 text-gray-600">No results found for &quot;{query}&quot;</div>
            : visibleResults.length === 0 ? <div className="text-center py-8 text-gray-500">Start typing to search</div>
            : <div className="space-y-1">{visibleResults.map(result => <button key={`${result.type}-${result.id}`}
              onClick={() => handleSelect(result)} type="button"
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors text-left">
              <span className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-lg">{result.icon}</span>
              <span className="flex-1 min-w-0"><span className="block font-medium text-sm truncate">{result.title}</span>
                <span className="block text-xs text-gray-600 truncate">{result.subtitle}</span></span>
              {result.badge && <Badge variant="secondary" className="text-xs">{result.badge}</Badge>}
            </button>)}</div>}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
