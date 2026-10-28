'use client'

import * as React from 'react'
import { useRequestSequence } from '@/lib/hooks/useRequestSequence'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { Download, FileSpreadsheet, Plus, RotateCcw, Search } from 'lucide-react'
import { format } from 'date-fns'
import {
  brandService,
  campaignService,
  platformService,
  shiftService,
  swapRequestService,
  userService,
} from '@/lib/services/dataService'
import { Brand, Campaign, DeletionImpact, OperationalRole, Platform, Shift, SwapRequest, SwapStatus, User, UserDirectoryEntry } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
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
  const { t, language } = useTranslation()
  const copy = (vi: string, en: string) => language === 'vi' ? vi : en
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
  const [loading, setLoading] = React.useState(true)
  const [loadError,setLoadError] = React.useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<SwapRequest | null>(null)
  const [scope, setScope] = React.useState<SwapScope>('all')
  const [mineMode, setMineMode] = React.useState<'replacement' | 'exchange' | null>(null)
  const [reviewingId, setReviewingId] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const pagination = useListPagination('swaps',20)
  const {page,pageSize,setPage,setPageSize,navigate}=pagination
  const [total,setTotal]=React.useState(0)
  const [counts,setCounts]=React.useState<Record<string,number>>({})
  const encodedFilters=JSON.stringify({scope,search:query,from:filters.start||undefined,to:filters.end||undefined,
    requesterIds:filters.requesterIds,brandIds:filters.brandIds,campaignIds:filters.campaignIds,roles:filters.roles,statuses:filters.statuses})
  const { next, isCurrent, invalidate } = useRequestSequence()
  const identity = currentUser ? currentUser.id + ':' + (currentUser.system_permission ?? currentUser.role) : ''
  const [loadedIdentity, setLoadedIdentity] = React.useState('')
  const openForm = () => {
    if (!currentUser) return
    setShowForm(true)
  }
  const onFormOpenChange = (next: boolean) => {
    setShowForm(next)
  }

  const loadData = React.useCallback(async () => {
    const request=next()
    setLoadError(null)
    try {
    const [result,loadedUsers,loadedBrands,loadedPlatforms,loadedCampaigns,loadedDirectory]=await Promise.all([
      swapRequestService.getPage({page,pageSize,filters:JSON.parse(encodedFilters)}),
      userService.getAll(),brandService.getAll(),platformService.getAll(),campaignService.getAll(),userService.getDirectory(),
    ])
    const ids=[...new Set(result.items.flatMap(swap=>[swap.shift_id,swap.target_shift_id].filter((id):id is string=>!!id)))]
    const loadedShifts=await shiftService.getByIds(ids)
    if(!isCurrent(request))return
    setLoadedIdentity(identity)
    setSwaps(result.items);setTotal(result.total);setCounts(result.counts)
    if(result.page!==page)navigate({swaps_page:String(result.page)},true)
    setShifts(loadedShifts);setUsers(loadedUsers);setBrands(loadedBrands);setPlatforms(loadedPlatforms);setCampaigns(loadedCampaigns);setDirectory(loadedDirectory)
    } catch(error) {if(isCurrent(request))setLoadError(error instanceof Error ? error.message : 'Không thể tải yêu cầu đổi ca')} finally {if(isCurrent(request))setLoading(false)}
  }, [encodedFilters,navigate,page,pageSize,identity,next,isCurrent])
  useShiftChangeRefresh(loadData)
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => { void loadData() })
    return () => { cancelAnimationFrame(frame); invalidate() }
  }, [loadData,invalidate])


  const displayUsers = [...new Map([...directory, ...users].map(user => [user.id, user])).values()]
  const shiftById = new Map(shifts.map(shift => [shift.id, shift]))
  const nameFor = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name || '—' : '—'
  const userName = (id?: string) => id ? displayUsers.find(user => user.id === id)?.full_name || '—' : '—'
  const roleFor = (swap: SwapRequest): OperationalRole => swap.operational_role || (swap.new_support_id ? 'support' : swap.new_technical_id ? 'technical' : 'host')
  const replacementFor = (swap: SwapRequest) => swap.replacement_staff_id || swap.new_host_id || swap.new_support_id || swap.new_technical_id
  const filtered=mineMode ? swaps.filter(swap => swap.mode === mineMode) : swaps
  const updateFilters = (next: React.SetStateAction<Filters>) => {
    setFilters(next)
    setPage(1)
  }
  const selectScope = (next: SwapScope) => {
    setScope(next)
    setMineMode(null)
    setFilters(initialFilters)
    setPage(1)
  }
  const safePage=page
  const visibleSwaps=filtered
  const activeSelectedSwap = identity === loadedIdentity && selectedSwap ? swaps.find(swap => swap.id === selectedSwap.id) ?? null : null
  const activeCancelTarget = identity === loadedIdentity && cancelTarget ? swaps.find(swap => swap.id === cancelTarget.id && getSwapUiActions(swap, currentUser).showCancel) ?? null : null
  const exportMaps = {
    users: new Map(displayUsers.map(user => [user.id, user.full_name])),
    brands: new Map(brands.map(brand => [brand.id, brand.name])),
    campaigns: new Map(campaigns.map(campaign => [campaign.id, campaign.name])),
  }
  const exportComplete = async (historyOnly=false) => {
    try {
      const complete=await swapRequestService.getAllFiltered({...JSON.parse(encodedFilters),...(historyOnly?{statuses:['accepted','approved','completed','rejected','cancelled']}: {})})
      const allShifts=await shiftService.getByIds([...new Set(complete.flatMap(swap=>[swap.shift_id,swap.target_shift_id].filter((id):id is string=>!!id)))])
      exportSwapsToExcel(complete,allShifts,exportMaps.users,exportMaps.brands,exportMaps.campaigns,historyOnly?'swap_history.xlsx':undefined)
    } catch(error) {toast({title:t('error'),description:error instanceof Error?error.message:t('validationError'),variant:'destructive'})}
  }
  const runReview = async (swap: SwapRequest, action: 'approve' | 'reject' | 'accept' | 'counterpart_reject') => {
    if (!currentUser || reviewingId || identity !== loadedIdentity || !swaps.some(row => row.id === swap.id)) return
    const permissions = getSwapUiActions(swap, currentUser)
    if (!(action === 'approve' && permissions.showApprove || action === 'reject' && permissions.showReviewerReject || action === 'accept' && permissions.showAccept || action === 'counterpart_reject' && permissions.showCounterpartReject)) return
    setReviewingId(swap.id)
    try {
      if (action === 'accept') await swapRequestService.respond(swap.id, currentUser.id, 'accept', swap.version)
      else if (action === 'counterpart_reject') await swapRequestService.respond(swap.id, currentUser.id, 'reject', swap.version)
      else if (action === 'approve') await swapRequestService.approve(swap.id, currentUser.id, swap.version)
      else await swapRequestService.reject(swap.id, currentUser.id, swap.version)
      toast({ title: t('success'), description: t(action === 'approve' ? 'approved' : action === 'accept' ? 'accepted' : 'rejected'), variant: 'success' })
      await loadData()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    } finally { setReviewingId(null) }
  }

  const cancelImpact: DeletionImpact | null = activeCancelTarget ? {
    entity_type: 'swap_request',
    entity_id: activeCancelTarget.id,
    entity_name: `Swap request · ${roleFor(activeCancelTarget)}`,
    action: 'soft_delete',
    consequence: 'The pending request will be cancelled and retained in audit history.',
    reversible: false,
    related_records: [{ entity_type: 'shift', entity_id: activeCancelTarget.shift_id, entity_name: shiftById.get(activeCancelTarget.shift_id)?.title || activeCancelTarget.shift_id }],
  } : null

  const cancelSwap = async (reason: string) => {
    if (!currentUser || !activeCancelTarget || identity !== loadedIdentity) return
    try {
      await swapRequestService.cancel(activeCancelTarget.id, currentUser.id, reason, activeCancelTarget.version)
      toast({ title: 'Swap request cancelled', variant: 'success' })
      setCancelTarget(null)
      await loadData()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  if (loadError) return <PageLoadError error={new Error(loadError)} onRetry={() => void loadData()} />

  if (loading || userLoading || identity !== loadedIdentity) {
    return (
      <div className="space-y-3" data-testid="swaps-loading-shell">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t('swapsTitle') || 'Yêu cầu đổi ca'}</h2>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-12 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
          <p className="text-xs text-muted-foreground">{t('loading') || 'Đang tải yêu cầu đổi ca...'}</p>
        </div>
      </div>
    )
  }
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2 border-b border-slate-200">
      <nav aria-label={t('status')} className="flex min-w-0 flex-1 overflow-x-auto">
        {[
          { key: 'all', label: t('all'), count: counts.all??0 },
          { key: 'pending', label: copy('Chờ người nhận', 'Pending Recipient'), count: counts.pending??0 },
          { key: 'accepted', label: copy('Chờ duyệt', 'Pending Approval'), count: null },
          { key: 'approved', label: t('approved'), count: null },
          { key: 'rejected', label: t('rejected'), count: counts.rejected??0 },
          { key: 'cancelled', label: t('cancelled'), count: counts.cancelled??0 },
        ].map(item => {
          const selected = item.key === 'all' ? filters.statuses.length === 0 : item.key === 'approved' ? filters.statuses.includes('approved') : filters.statuses.length === 1 && filters.statuses[0] === item.key
          const active = scope === 'all' && !mineMode && selected
          return <button type="button" key={item.key} aria-pressed={active} onClick={() => { setScope('all'); setMineMode(null); updateFilters(current => ({ ...current, statuses: item.key === 'all' ? [] : item.key === 'approved' ? ['approved', 'completed'] : [item.key] })) }} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs ${active ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item.label} {item.count !== null && <strong>{item.count}</strong>}</button>
        })}
        {(['replacement', 'exchange'] as const).map(value => <button type="button" key={value} aria-pressed={scope === 'mine' && mineMode === value} onClick={() => { setScope('mine'); setMineMode(value); setFilters(initialFilters); setPage(1) }} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs ${scope === 'mine' && mineMode === value ? 'border-violet-600 font-semibold text-violet-700' : 'border-transparent text-slate-500'}`}>{value === 'replacement' ? copy('PASS của tôi', 'My Pass') : copy('Đổi ca của tôi', 'My Exchange')}</button>)}
        <button type="button" aria-pressed={scope === 'forMe'} onClick={() => selectScope('forMe')} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs ${scope === 'forMe' ? 'border-emerald-600 font-semibold text-emerald-700' : 'border-transparent text-slate-500'}`}>{copy('Gửi cho tôi', 'For me')} <strong>{counts.forMe??0}</strong></button>
      </nav>
      {currentUser && hasPermission(currentUser, 'swaps.request') && <Button size="sm" className="mr-1 shrink-0" onClick={openForm}><Plus className="mr-1.5 h-4 w-4" />{t('swapsTitle')}</Button>}
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
            <Button variant="outline" disabled={!filtered.length} onClick={() => void exportComplete()}><FileSpreadsheet className="mr-2 h-4 w-4" />{t('exportFilteredSwaps')}</Button>
            <Button variant="outline" disabled={!swaps.some(swap => swap.status !== 'pending')} onClick={() => void exportComplete(true)}><Download className="mr-2 h-4 w-4" />{t('exportSwapHistory')}</Button>
            <Button variant="outline" onClick={downloadSwapRequestTemplate}><Download className="mr-2 h-4 w-4" />{t('downloadSwapTemplate')}</Button>
          </>}
        </div>
        <div className="lg:hidden flex w-full gap-2">
          <Button className="flex-1" variant="outline" onClick={() => updateFilters(initialFilters)}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button>
          {currentUser && hasPermission(currentUser, 'swaps.export') && (
            <MobileActionMenu
              breakpoint="lg"
              actions={[
                { key: 'export-filtered', label: t('exportFilteredSwaps'), icon: <FileSpreadsheet className="h-4 w-4" />, onClick: () => void exportComplete(), disabled: !filtered.length },
                { key: 'export-history', label: t('exportSwapHistory'), icon: <Download className="h-4 w-4" />, onClick: () => void exportComplete(true), disabled: !swaps.some(swap => swap.status !== 'pending') },
                { key: 'export-template', label: t('downloadSwapTemplate'), icon: <Download className="h-4 w-4" />, onClick: downloadSwapRequestTemplate }
              ]}
            />
          )}
        </div>
      </div>
      </details>
    </section>

    {mineMode && <p className="text-xs text-muted-foreground">{copy('Yêu cầu của tôi', 'My requests')} · {page}/{Math.max(1, Math.ceil(total / pageSize))} · {copy('Lọc loại yêu cầu trên trang này', 'Request type filtered on this page')}</p>}
    {filtered.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t('noSwaps')}{mineMode && <HistoryPagination page={safePage} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />}</CardContent></Card> : <Card className="overflow-hidden border-slate-200 shadow-none"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-xs"><thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr>{['Shift & request','Requester','Replacement','Role / mode','Reason','Status','Created','Actions'].map(label=><th key={label} className="px-3 py-2.5 font-semibold">{label}</th>)}</tr></thead><tbody>{visibleSwaps.map(swap => {
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
    })}</tbody></table></div><HistoryPagination page={safePage} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} /></CardContent></Card>}


    {showForm && currentUser && <SwapRequestFormModal key={currentUser.id} open={showForm} onOpenChange={onFormOpenChange} brands={brands} platforms={platforms}
      onSuccess={() => { void loadData(); onFormOpenChange(false) }} />}
    {activeSelectedSwap && shiftById.get(activeSelectedSwap.shift_id) && <SwapDetailModal open swap={activeSelectedSwap} shift={shiftById.get(activeSelectedSwap.shift_id)!} requester={displayUsers.find(user => user.id === activeSelectedSwap.requester_id)!} newHost={displayUsers.find(user => user.id === replacementFor(activeSelectedSwap))} brands={brands} platforms={platforms} showParticipantActions={getSwapUiActions(activeSelectedSwap, currentUser).showAccept} showReviewerActions={getSwapUiActions(activeSelectedSwap, currentUser).showReviewerReject} onAccept={() => runReview(activeSelectedSwap, 'accept')} onParticipantReject={() => runReview(activeSelectedSwap, 'counterpart_reject')} onOpenChange={open => !open && setSelectedSwap(null)} onApprove={() => runReview(activeSelectedSwap, 'approve')} onReject={() => runReview(activeSelectedSwap, 'reject')} />}
    <LifecycleActionDialog open={Boolean(activeCancelTarget)} onOpenChange={open => !open && setCancelTarget(null)} title="Cancel swap request" impact={cancelImpact} confirmText="Cancel request" onConfirm={cancelSwap} />
  </div>
}

function EntityFilter({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options.map(option => ({ value: option.id, label: option.name }))} onChange={onChange} />
}
