'use client'

import * as React from 'react'
import { Download, FileSpreadsheet, Plus, RotateCcw } from 'lucide-react'
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
import { Brand, Campaign, DeletionImpact, OperationalRole, Platform, Shift, SwapRequest, SwapStatus, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { downloadSwapRequestTemplate, exportSwapsToExcel } from '@/lib/utils/excelUtils'
import { getSwapUiActions, getSwapStatusPresentation } from '@/lib/utils/swapUi'
import { deriveSwapAttention } from '@/lib/ui/operational-attention'
import { AttentionItem } from '@/components/ui/operational-status'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import { ActionBar } from '@/components/ui/action-bar'
import { buildSwapActions } from '@/lib/ui/action-priority'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export function SwapRequestList() {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [swaps, setSwaps] = React.useState<SwapRequest[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [users, setUsers] = React.useState<User[]>([])
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
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
    const [loadedSwaps, loadedShifts, loadedUsers, loadedBrands, loadedPlatforms, loadedCampaigns] = await Promise.all([
      swapRequestService.getAll(), shiftService.getAll(), userService.getAll(), brandService.getAll(), platformService.getAll(), campaignService.getAll(),
    ])
    setSwaps(loadedSwaps); setShifts(loadedShifts); setUsers(loadedUsers); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns)
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

  const shiftById = new Map(shifts.map(shift => [shift.id, shift]))
  const nameFor = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name || '—' : '—'
  const userName = (id?: string) => id ? users.find(user => user.id === id)?.full_name || '—' : '—'
  const roleFor = (swap: SwapRequest): OperationalRole => swap.operational_role || (swap.new_support_id ? 'support' : swap.new_technical_id ? 'technical' : 'host')
  const replacementFor = (swap: SwapRequest) => swap.replacement_staff_id || swap.new_host_id || swap.new_support_id || swap.new_technical_id
  const filtered = swaps.filter(swap => {
    const shift = shiftById.get(swap.shift_id)
    if (!shift) return false
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
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const visibleSwaps = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const exportMaps = {
    users: new Map(users.map(user => [user.id, user.full_name])),
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
    <nav aria-label={t('status')} className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-2">{([{key:'all',count:swaps.length},...SWAP_REQUEST_STATUSES.map(status=>({key:status,count:swaps.filter(swap=>swap.status===status).length}))] as const).map(item=>{const active=item.key==='all'?!filters.statuses.length:filters.statuses.includes(item.key);return <button type="button" key={item.key} aria-pressed={active} onClick={()=>updateFilters(current=>({...current,statuses:item.key==='all'?[]:[item.key]}))} className={`border-b-2 px-3 py-2 text-xs ${active?'border-blue-600 font-semibold text-blue-700':'border-transparent text-slate-500'}`}>{t(item.key)} <strong>{item.count}</strong></button>})}</nav>

    <Card><CardHeader className="px-3 py-2"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-sm">{t('filters')}</CardTitle>{currentUser && hasPermission(currentUser, 'swaps.request') && <Button size="sm" onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />{t('swapsTitle')}</Button>}</div></CardHeader><CardContent className="space-y-3 px-3 pb-3">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-xs font-medium">{t('startDate')}<Input className="mt-1" type="date" value={filters.start} onChange={event => updateFilters(current => ({ ...current, start: event.target.value }))} /></label>
        <label className="text-xs font-medium">{t('endDate')}<Input className="mt-1" type="date" value={filters.end} onChange={event => updateFilters(current => ({ ...current, end: event.target.value }))} /></label>
        <EntityFilter label={t('requester')} value={filters.requesterIds} options={users.map(user => ({ id: user.id, name: user.full_name }))} onChange={value => updateFilters(current => ({ ...current, requesterIds: value }))} />
        <EntityFilter label={t('brand')} value={filters.brandIds} options={brands} onChange={value => updateFilters(current => ({ ...current, brandIds: value }))} />
        <EntityFilter label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => updateFilters(current => ({ ...current, campaignIds: value }))} />
        <MultiSelectFilter label={t('role')} value={filters.roles} options={(['host','support','technical'] as OperationalRole[]).map(role => ({ value: role, label: t(role) }))} onChange={value => updateFilters(current => ({ ...current, roles: value as OperationalRole[] }))} />
        <MultiSelectFilter label={t('status')} value={filters.statuses} options={SWAP_REQUEST_STATUSES.map(status => ({ value: status, label: t(status) }))} onChange={value => updateFilters(current => ({ ...current, statuses: value }))} />
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
    </CardContent></Card>

    {filtered.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t('noSwaps')}</CardContent></Card> : <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>{[t('shiftDetail'),t('requester'),t('replacementStaff'),t('role'),t('status'),t('createdAt'),t('actions')].map(label=><th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{visibleSwaps.map(swap => {
      const shift = shiftById.get(swap.shift_id)
      if (!shift) return null
      const actions = getSwapUiActions(swap, currentUser)
      const statusPresentation = getSwapStatusPresentation(swap.status)
      const attentionItems = deriveSwapAttention({swapId:swap.id,status:swap.status,actorHasValidAction:actions.showAccept || actions.showCounterpartReject || actions.showApprove || actions.showReviewerReject || actions.showCancel})
      return <tr key={swap.id} className="border-t align-top hover:bg-muted/20">
        <td className="p-3"><button type="button" onClick={()=>setSelectedSwap(swap)} className="text-left font-medium text-primary">{shift.title}</button><p className="text-xs text-muted-foreground">{swap.id}</p><p className="mt-1 text-xs">{shift.date} · {formatShiftTimeRange(shift)}</p><p className="text-xs text-muted-foreground">{shift.studio || '—'} · {nameFor(brands,shift.brand_id)} · {nameFor(platforms,shift.platform_id)}</p><p className="text-xs text-muted-foreground">{nameFor(campaigns,shift.campaign_id)}</p>{swap.reason && <p className="mt-2 max-w-xs text-xs">{swap.reason}</p>}</td>
        <td className="p-3">{userName(swap.requester_id)}{swap.original_staff_id && swap.original_staff_id !== swap.requester_id && <p className="text-xs text-muted-foreground">{t('originalStaff')}: {userName(swap.original_staff_id)}</p>}</td>
        <td className="p-3">{userName(replacementFor(swap) || swap.counterpart_id || '')}{swap.mode==='exchange' && <p className="text-xs text-muted-foreground">{t('targetShift')}: {shiftById.get(swap.target_shift_id || '')?.title || swap.target_shift_id || '—'}</p>}</td>
        <td className="p-3">{t(roleFor(swap))}<p className="text-xs text-muted-foreground">{swap.mode || 'replacement'}</p></td>
        <td className="p-3"><Badge variant="outline">{t(statusPresentation.label)}</Badge><div className="mt-2 space-y-1">{attentionItems.map(item=><AttentionItem key={item.key} item={item} />)}</div></td>
        <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{format(new Date(swap.created_at),'dd/MM/yyyy HH:mm')}</td>
        <td className="p-3">                  <ActionBar
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


    {showForm && currentUser && <SwapRequestFormModal open={showForm} onOpenChange={setShowForm} shifts={shifts.filter(shift => shift.status === 'scheduled' && (myShiftIds.has(shift.id) || shift.host_id === currentUser.id || shift.support_id === currentUser.id || shift.technical_id === currentUser.id))} users={users} brands={brands} platforms={platforms} onSuccess={() => { void loadData(); setShowForm(false) }} />}
    {selectedSwap && <SwapDetailModal open swap={selectedSwap} shift={shiftById.get(selectedSwap.shift_id)!} requester={users.find(user => user.id === selectedSwap.requester_id)!} newHost={users.find(user => user.id === replacementFor(selectedSwap))} brands={brands} platforms={platforms} showParticipantActions={getSwapUiActions(selectedSwap, currentUser).showAccept} showReviewerActions={getSwapUiActions(selectedSwap, currentUser).showReviewerReject} onAccept={() => runReview(selectedSwap, 'accept')} onParticipantReject={() => runReview(selectedSwap, 'counterpart_reject')} onOpenChange={open => !open && setSelectedSwap(null)} onApprove={() => runReview(selectedSwap, 'approve')} onReject={() => runReview(selectedSwap, 'reject')} />}
    <LifecycleActionDialog open={Boolean(cancelTarget)} onOpenChange={open => !open && setCancelTarget(null)} title="Cancel swap request" impact={cancelImpact} confirmText="Cancel request" onConfirm={cancelSwap} />
  </div>
}

function EntityFilter({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options.map(option => ({ value: option.id, label: option.name }))} onChange={onChange} />
}
