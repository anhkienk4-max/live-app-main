'use client'

import * as React from 'react'
import { Download, FileSpreadsheet, Plus, RotateCcw, Search } from 'lucide-react'
import { format } from 'date-fns'
import {
  brandService,
  campaignService,
  isStaffedRegistration,
  platformService,
  shiftRegistrationService,
  shiftService,
  swapRequestService,
  userService,
} from '@/lib/services/dataService'
import { Brand, Campaign, DeletionImpact, OperationalRole, Platform, Shift, SwapRequest, SwapStatus, User, UserDirectoryEntry } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { downloadSwapRequestTemplate, exportSwapsToExcel } from '@/lib/utils/excelUtils'
import { getSwapUiActions, getSwapStatusPresentation } from '@/lib/utils/swapUi'
import { deriveSwapAttention } from '@/lib/ui/operational-attention'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import { ActionBar } from '@/components/ui/action-bar'
import { buildSwapActions } from '@/lib/ui/action-priority'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { useToast } from '@/components/ui/toast'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
import { SwapDetailModal } from './SwapDetailModal'
import { SwapRequestFormModal } from './SwapRequestFormModal'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { PageLoadError } from '@/components/ui/page-load-error'
import { HistoryPagination } from '@/components/ui/history-pagination'

type Filters = { start: string; end: string; requesterIds: string[]; brandIds: string[]; campaignIds: string[]; roles: OperationalRole[]; statuses: string[] }
const initialFilters: Filters = { start: '', end: '', requesterIds: [], brandIds: [], campaignIds: [], roles: [], statuses: [] }
export const SWAP_REQUEST_STATUSES = ['pending', 'accepted', 'approved', 'rejected', 'cancelled', 'completed'] as const satisfies readonly SwapStatus[]
type SwapScope = 'all' | 'mine' | 'forMe'

export function SwapRequestList() {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [swaps, setSwaps] = React.useState<SwapRequest[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [directory, setDirectory] = React.useState<UserDirectoryEntry[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [filters, setFilters] = React.useState<Filters>(initialFilters)
  const [showForm, setShowForm] = React.useState(false)
  const [selectedSwap, setSelectedSwap] = React.useState<SwapRequest | null>(null)
  const [myShiftIds, setMyShiftIds] = React.useState<Set<string>>(new Set())
  const [loading, setLoading] = React.useState(true)
  const [loadError,setLoadError] = React.useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<SwapRequest | null>(null)
  const [scope, setScope] = React.useState<SwapScope>('all')
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
    const [loadedSwaps, loadedShifts, loadedUsers, loadedBrands, loadedPlatforms, loadedCampaigns, loadedDirectory] = await Promise.all([
      swapRequestService.getAll(), shiftService.getAll(), userService.getAll(), brandService.getAll(), platformService.getAll(), campaignService.getAll(), userService.getDirectory(),
    ])
    setSwaps(loadedSwaps); setShifts(loadedShifts); setUsers(loadedUsers); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns); setDirectory(loadedDirectory)
    } catch(error) {setLoadError(error instanceof Error ? error.message : 'Không thể tải yêu cầu đổi ca')} finally {setLoading(false)}
  }, [])
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => { void loadData() })
    return () => cancelAnimationFrame(frame)
  }, [loadData])
  React.useEffect(() => {
    if (!currentUser) return
    void shiftRegistrationService.getForUser(currentUser.id).then(registrations => {
      setMyShiftIds(new Set(registrations.filter(isStaffedRegistration).map(registration => registration.shift_id)))
    })
  }, [currentUser])

  const displayUsers = [...new Map([...directory, ...users].map(user => [user.id, user])).values()]
  const shiftById = new Map(shifts.map(shift => [shift.id, shift]))
  const nameFor = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name || '—' : '—'
  const userName = (id?: string) => id ? displayUsers.find(user => user.id === id)?.full_name || '—' : '—'
  const roleFor = (swap: SwapRequest): OperationalRole => swap.operational_role || (swap.new_support_id ? 'support' : swap.new_technical_id ? 'technical' : 'host')
  const replacementFor = (swap: SwapRequest) => swap.replacement_staff_id || swap.new_host_id || swap.new_support_id || swap.new_technical_id
  const scopedSwaps = swaps.filter(swap => {
    if (scope === 'mine') return swap.requester_id === currentUser?.id
    if (scope === 'forMe') return swap.counterpart_id === currentUser?.id
    return true
  })
  const filtered = scopedSwaps.filter(swap => {
    const shift = shiftById.get(swap.shift_id)
    if (!shift) return false
    const haystack = [swap.id, shift.title, swap.reason, userName(swap.requester_id), userName(replacementFor(swap) || swap.counterpart_id || '')].join(' ').toLowerCase()
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false
    return (!filters.start || shift.date >= filters.start) &&
      (!filters.end || shift.date <= filters.end) &&
      matchesMultiSelect(swap.requester_id, filters.requesterIds) &&
      matchesMultiSelect(shift.brand_id, filters.brandIds) &&
      matchesMultiSelect(shift.campaign_id, filters.campaignIds) &&
      matchesMultiSelect(roleFor(swap), filters.roles) &&
      matchesMultiSelect(swap.status, filters.statuses)
  })
  const updateFilters = (next: React.SetStateAction<Filters>) => {
    setFilters(next)
    setPage(1)
  }
  const selectScope = (next: SwapScope) => {
    setScope(next)
    setFilters(initialFilters)
    setPage(1)
  }
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const visibleSwaps = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const exportMaps = {
    users: new Map(displayUsers.map(user => [user.id, user.full_name])),
    brands: new Map(brands.map(brand => [brand.id, brand.name])),
    campaigns: new Map(campaigns.map(campaign => [campaign.id, campaign.name])),
  }
  const runReview = async (swap: SwapRequest, action: 'approve' | 'reject' | 'accept' | 'counterpart_reject') => {
    if (!currentUser) return
    try {
      if (action === 'accept') await swapRequestService.respond(swap.id, currentUser.id, 'accept', swap.version)
      else if (action === 'counterpart_reject') await swapRequestService.respond(swap.id, currentUser.id, 'reject', swap.version)
      else if (action === 'approve') await swapRequestService.approve(swap.id, currentUser.id, swap.version)
      else await swapRequestService.reject(swap.id, currentUser.id, swap.version)
      toast({ title: t('success'), description: t(action === 'approve' ? 'approved' : action === 'accept' ? 'accepted' : 'rejected'), variant: 'success' })
      await loadData()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    }
  }

  const cancelImpact: DeletionImpact | null = cancelTarget ? {
    entity_type: 'swap_request',
    entity_id: cancelTarget.id,
    entity_name: `Swap request · ${roleFor(cancelTarget)}`,
    action: 'soft_delete',
    consequence: 'The pending request will be cancelled and retained in audit history.',
    reversible: false,
    related_records: [{ entity_type: 'shift', entity_id: cancelTarget.shift_id, entity_name: shiftById.get(cancelTarget.shift_id)?.title || cancelTarget.shift_id }],
  } : null

  const cancelSwap = async (reason: string) => {
    if (!currentUser || !cancelTarget) return
    try {
      await swapRequestService.cancel(cancelTarget.id, currentUser.id, reason, cancelTarget.version)
      toast({ title: 'Swap request cancelled', variant: 'success' })
      setCancelTarget(null)
      await loadData()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  if (loading || userLoading) return <div className="py-12 text-center">{t('loading')}</div>

  if (loadError) return <PageLoadError error={new Error(loadError)} onRetry={() => void loadData()} />
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2 border-b border-slate-200">
      <nav aria-label={t('status')} className="flex min-w-0 flex-1 overflow-x-auto">
        {[
          { key: 'all', label: 'All', count: swaps.length },
          { key: 'pending', label: t('pending'), count: swaps.filter(swap => swap.status === 'pending').length },
          { key: 'accepted', label: t('accepted'), count: swaps.filter(swap => swap.status === 'accepted' || swap.status === 'approved').length },
          { key: 'completed', label: t('completed'), count: swaps.filter(swap => swap.status === 'completed').length },
          { key: 'rejected', label: t('rejected'), count: swaps.filter(swap => swap.status === 'rejected').length },
          { key: 'cancelled', label: t('cancelled'), count: swaps.filter(swap => swap.status === 'cancelled').length },
        ].map(item => {
          const active = scope === 'all' && (item.key === 'all' ? !filters.statuses.length : filters.statuses.includes(item.key))
          return <button type="button" key={item.key} aria-pressed={active} onClick={() => { setScope('all'); updateFilters(current => ({ ...current, statuses: item.key === 'all' ? [] : item.key === 'accepted' ? ['accepted', 'approved'] : [item.key] })) }} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs ${active ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item.label} <strong>{item.count}</strong></button>
        })}
        <button type="button" aria-pressed={scope === 'mine'} onClick={() => selectScope('mine')} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs ${scope === 'mine' ? 'border-violet-600 font-semibold text-violet-700' : 'border-transparent text-slate-500'}`}>My requests <strong>{swaps.filter(swap => swap.requester_id === currentUser?.id).length}</strong></button>
        <button type="button" aria-pressed={scope === 'forMe'} onClick={() => selectScope('forMe')} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs ${scope === 'forMe' ? 'border-emerald-600 font-semibold text-emerald-700' : 'border-transparent text-slate-500'}`}>For me <strong>{swaps.filter(swap => swap.counterpart_id === currentUser?.id).length}</strong></button>
      </nav>
      {currentUser && hasPermission(currentUser, 'swaps.request') && <Button size="sm" className="mr-1 shrink-0" onClick={() => setShowForm(true)}><Plus className="mr-1.5 h-4 w-4" />{t('swapsTitle')}</Button>}
    </div>

    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px] [&>div>span]:sr-only"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input aria-label="Search swaps" className="h-9 pl-8 text-xs" placeholder="Search request, shift, or staff" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /></div>
        <MultiSelectFilter label={t('role')} value={filters.roles} options={(['host','support','technical'] as OperationalRole[]).map(role => ({ value: role, label: t(role) }))} onChange={value => updateFilters(current => ({ ...current, roles: value as OperationalRole[] }))} />
        <MultiSelectFilter label={t('status')} value={filters.statuses} options={SWAP_REQUEST_STATUSES.map(status => ({ value: status, label: t(status) }))} onChange={value => updateFilters(current => ({ ...current, statuses: value }))} />
      </div>
      <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-slate-500">{t('filters')}</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <label className="text-xs font-medium">{t('startDate')}<Input className="mt-1" type="date" value={filters.start} onChange={event => updateFilters(current => ({ ...current, start: event.target.value }))} /></label>
        <label className="text-xs font-medium">{t('endDate')}<Input className="mt-1" type="date" value={filters.end} onChange={event => updateFilters(current => ({ ...current, end: event.target.value }))} /></label>
        <EntityFilter label={t('requester')} value={filters.requesterIds} options={displayUsers.map(user => ({ id: user.id, name: user.full_name }))} onChange={value => updateFilters(current => ({ ...current, requesterIds: value }))} />
        <EntityFilter label={t('brand')} value={filters.brandIds} options={brands} onChange={value => updateFilters(current => ({ ...current, brandIds: value }))} />
        <EntityFilter label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => updateFilters(current => ({ ...current, campaignIds: value }))} />
      </div>
      <div className="flex gap-2">
        <div className="hidden lg:flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => updateFilters(initialFilters)}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button>
          {currentUser && hasPermission(currentUser, 'swaps.export') && <>
            <Button variant="outline" disabled={!filtered.length} onClick={() => exportSwapsToExcel(filtered, shifts, exportMaps.users, exportMaps.brands, exportMaps.campaigns)}><FileSpreadsheet className="mr-2 h-4 w-4" />{t('exportFilteredSwaps')}</Button>
            <Button variant="outline" disabled={!swaps.some(swap => swap.status !== 'pending')} onClick={() => exportSwapsToExcel(swaps.filter(swap => swap.status !== 'pending'), shifts, exportMaps.users, exportMaps.brands, exportMaps.campaigns, 'swap_history.xlsx')}><Download className="mr-2 h-4 w-4" />{t('exportSwapHistory')}</Button>
            <Button variant="outline" onClick={downloadSwapRequestTemplate}><Download className="mr-2 h-4 w-4" />{t('downloadSwapTemplate')}</Button>
          </>}
        </div>
        <div className="lg:hidden flex w-full gap-2">
          <Button className="flex-1" variant="outline" onClick={() => updateFilters(initialFilters)}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button>
          {currentUser && hasPermission(currentUser, 'swaps.export') && (
            <MobileActionMenu
              breakpoint="lg"
              actions={[
                { key: 'export-filtered', label: t('exportFilteredSwaps'), icon: <FileSpreadsheet className="h-4 w-4" />, onClick: () => exportSwapsToExcel(filtered, shifts, exportMaps.users, exportMaps.brands, exportMaps.campaigns), disabled: !filtered.length },
                { key: 'export-history', label: t('exportSwapHistory'), icon: <Download className="h-4 w-4" />, onClick: () => exportSwapsToExcel(swaps.filter(swap => swap.status !== 'pending'), shifts, exportMaps.users, exportMaps.brands, exportMaps.campaigns, 'swap_history.xlsx'), disabled: !swaps.some(swap => swap.status !== 'pending') },
                { key: 'export-template', label: t('downloadSwapTemplate'), icon: <Download className="h-4 w-4" />, onClick: downloadSwapRequestTemplate }
              ]}
            />
          )}
        </div>
      </div>
      </details>
    </section>

    {filtered.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t('noSwaps')}</CardContent></Card> : <Card className="overflow-hidden border-slate-200 shadow-none"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-xs"><thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr>{['Shift & request','Requester','Replacement','Role / mode','Reason','Status','Created','Actions'].map(label=><th key={label} className="px-3 py-2.5 font-semibold">{label}</th>)}</tr></thead><tbody>{visibleSwaps.map(swap => {
      const shift = shiftById.get(swap.shift_id)
      if (!shift) return null
      const actions = getSwapUiActions(swap, currentUser)
      const statusPresentation = getSwapStatusPresentation(swap.status)
      const attentionItems = deriveSwapAttention({swapId:swap.id,status:swap.status,actorHasValidAction:actions.showAccept || actions.showCounterpartReject || actions.showApprove || actions.showReviewerReject})
      return <tr key={swap.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
        <td className="max-w-[280px] px-3 py-2.5"><button type="button" onClick={()=>setSelectedSwap(swap)} title={shift.title} className="block max-w-full truncate text-left font-semibold text-primary">{shift.title}</button><p title={swap.id} className="max-w-[220px] truncate text-[10px] text-muted-foreground">{swap.id}</p><p className="mt-1 text-[10px]">{shift.date} / {formatShiftTimeRange(shift)}</p><p className="max-w-[230px] truncate text-[10px] text-muted-foreground" title={`${shift.studio || ''} / ${nameFor(brands,shift.brand_id)} / ${nameFor(platforms,shift.platform_id)} / ${nameFor(campaigns,shift.campaign_id)}`}>{shift.studio || '—'} / {nameFor(platforms,shift.platform_id)}</p></td>
        <td className="px-3 py-2.5"><span className="font-medium">{userName(swap.requester_id)}</span>{swap.original_staff_id && swap.original_staff_id !== swap.requester_id && <p className="text-[10px] text-muted-foreground">{t('originalStaff')}: {userName(swap.original_staff_id)}</p>}</td>
        <td className="p-3">{userName(replacementFor(swap) || swap.counterpart_id || '')}{swap.mode==='exchange' && <p className="text-xs text-muted-foreground">{t('targetShift')}: {shiftById.get(swap.target_shift_id || '')?.title || swap.target_shift_id || '—'}</p>}</td>
        <td className="px-3 py-2.5">{t(roleFor(swap))}<p className="text-[10px] text-muted-foreground">{swap.mode || 'replacement'}</p></td>
        <td className="max-w-[160px] px-3 py-2.5"><p title={swap.reason} className="max-w-[160px] truncate text-[11px] text-muted-foreground">{swap.reason}</p></td>
        <td className="px-3 py-2.5"><Badge variant={statusPresentation.tone === 'success' ? 'success' : statusPresentation.tone === 'danger' ? 'danger' : statusPresentation.tone === 'warning' ? 'warning' : statusPresentation.tone === 'info' ? 'info' : 'outline'} className="text-[10px]">{t(statusPresentation.label)}</Badge>{attentionItems.map(item=><p key={item.key} className="mt-1 text-[10px] text-muted-foreground">{t(item.label as TranslationKey)}</p>)}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[10px] text-muted-foreground">{format(new Date(swap.created_at),'dd/MM/yyyy HH:mm')}</td>
        <td className="px-3 py-2.5">                  <ActionBar
                    direction="row"
                    compact
                    collapseAt="md"
                    actions={buildSwapActions(
                      actions,
                      {
                        onViewDetails: () => setSelectedSwap(swap),
                        onAccept: actions.showAccept ? () => void runReview(swap, 'accept') : undefined,
                        onCounterpartReject: actions.showCounterpartReject ? () => void runReview(swap, 'counterpart_reject') : undefined,
                        onApprove: actions.showApprove ? () => void runReview(swap, 'approve') : undefined,
                        onReviewerReject: actions.showReviewerReject ? () => void runReview(swap, 'reject') : undefined,
                        onCancel: actions.showCancel ? () => setCancelTarget(swap) : undefined,
                      },
                      {
                        viewDetails: t('viewDetails'),
                        accept: t('accept'),
                        reject: t('reject'),
                        approve: t('approve'),
                        reviewerReject: t('reject'),
                        cancel: t('cancelRegistration'),
                      }
                    )}
                  /></td>
      </tr>
    })}</tbody></table></div><HistoryPagination page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={size => {setPageSize(size);setPage(1)}} /></CardContent></Card>}


    {showForm && currentUser && <SwapRequestFormModal open={showForm} onOpenChange={setShowForm} shifts={shifts.filter(shift => shift.status === 'scheduled' && (myShiftIds.has(shift.id) || shift.host_id === currentUser.id || shift.support_id === currentUser.id || shift.technical_id === currentUser.id))} users={directory} brands={brands} platforms={platforms} onSuccess={() => { void loadData(); setShowForm(false) }} />}
    {selectedSwap && <SwapDetailModal open swap={selectedSwap} shift={shiftById.get(selectedSwap.shift_id)!} requester={displayUsers.find(user => user.id === selectedSwap.requester_id)!} newHost={displayUsers.find(user => user.id === replacementFor(selectedSwap))} brands={brands} platforms={platforms} showParticipantActions={getSwapUiActions(selectedSwap, currentUser).showAccept} showReviewerActions={getSwapUiActions(selectedSwap, currentUser).showReviewerReject} onAccept={() => runReview(selectedSwap, 'accept')} onParticipantReject={() => runReview(selectedSwap, 'counterpart_reject')} onOpenChange={open => !open && setSelectedSwap(null)} onApprove={() => runReview(selectedSwap, 'approve')} onReject={() => runReview(selectedSwap, 'reject')} />}
    <LifecycleActionDialog open={Boolean(cancelTarget)} onOpenChange={open => !open && setCancelTarget(null)} title="Cancel swap request" impact={cancelImpact} confirmText="Cancel request" onConfirm={cancelSwap} />
  </div>
}

function EntityFilter({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options.map(option => ({ value: option.id, label: option.name }))} onChange={onChange} />
}
