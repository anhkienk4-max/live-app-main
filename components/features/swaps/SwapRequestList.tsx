'use client'

import * as React from 'react'
import { CheckCircle, Download, FileSpreadsheet, Plus, RotateCcw, XCircle } from 'lucide-react'
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
import { Brand, Campaign, DeletionImpact, OperationalRole, Platform, Shift, SwapRequest, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { downloadSwapRequestTemplate, exportSwapsToExcel } from '@/lib/utils/excelUtils'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { SwapDetailModal } from './SwapDetailModal'
import { SwapRequestFormModal } from './SwapRequestFormModal'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { HistoryPagination } from '@/components/ui/history-pagination'

type Filters = { start: string; end: string; requester: string; brand: string; campaign: string; role: string; status: string }
const initialFilters: Filters = { start: '', end: '', requester: 'all', brand: 'all', campaign: 'all', role: 'all', status: 'all' }

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
  const [cancelTarget, setCancelTarget] = React.useState<SwapRequest | null>(null)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  const loadData = React.useCallback(async () => {
    const [loadedSwaps, loadedShifts, loadedUsers, loadedBrands, loadedPlatforms, loadedCampaigns] = await Promise.all([
      swapRequestService.getAll(), shiftService.getAll(), userService.getAll(), brandService.getAll(), platformService.getAll(), campaignService.getAll(),
    ])
    setSwaps(loadedSwaps); setShifts(loadedShifts); setUsers(loadedUsers); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns); setLoading(false)
  }, [])
  React.useEffect(() => { void loadData() }, [loadData])
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
      (filters.requester === 'all' || swap.requester_id === filters.requester) &&
      (filters.brand === 'all' || shift.brand_id === filters.brand) &&
      (filters.campaign === 'all' || shift.campaign_id === filters.campaign) &&
      (filters.role === 'all' || roleFor(swap) === filters.role) &&
      (filters.status === 'all' || swap.status === filters.status)
  })
  React.useEffect(() => setPage(1), [filters])
  const visibleSwaps = filtered.slice((page - 1) * pageSize, page * pageSize)
  const exportMaps = {
    users: new Map(users.map(user => [user.id, user.full_name])),
    brands: new Map(brands.map(brand => [brand.id, brand.name])),
    campaigns: new Map(campaigns.map(campaign => [campaign.id, campaign.name])),
  }
  const runReview = async (swap: SwapRequest, action: 'approve' | 'reject' | 'accept' | 'counterpart_reject') => {
    if (!currentUser) return
    try {
      if (action === 'accept') await swapRequestService.respond(swap.id, currentUser.id, 'accept')
      else if (action === 'counterpart_reject') await swapRequestService.respond(swap.id, currentUser.id, 'reject')
      else if (action === 'approve') await swapRequestService.approve(swap.id, currentUser.id)
      else await swapRequestService.reject(swap.id, currentUser.id)
      toast({ title: t('success'), description: (t as unknown as (k:string)=>string)(action === 'approve' ? 'approved' : action === 'accept' ? 'accepted' : 'rejected'), variant: 'success' })
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
      await swapRequestService.cancel(cancelTarget.id, currentUser.id, reason)
      toast({ title: 'Swap request cancelled', variant: 'success' })
      setCancelTarget(null)
      await loadData()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  if (loading || userLoading) return <div className="py-12 text-center">{t('loading')}</div>

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-4">
      {(['pending','accepted','approved','rejected','cancelled','completed'] as const).map(status => <Card key={status}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{(t as unknown as (k:string)=>string)(status)}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{filtered.filter(swap => swap.status === status).length}</p></CardContent></Card>)}
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('all')}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{filtered.length}</p></CardContent></Card>
    </div>

    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{t('filters')}</CardTitle>{currentUser && hasPermission(currentUser, 'swaps.request') && <Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />{t('swapsTitle')}</Button>}</div></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-xs font-medium">{t('startDate')}<Input className="mt-1" type="date" value={filters.start} onChange={event => setFilters(current => ({ ...current, start: event.target.value }))} /></label>
        <label className="text-xs font-medium">{t('endDate')}<Input className="mt-1" type="date" value={filters.end} onChange={event => setFilters(current => ({ ...current, end: event.target.value }))} /></label>
        <EntityFilter label={t('requester')} value={filters.requester} options={users.map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, requester: value }))} />
        <EntityFilter label={t('brand')} value={filters.brand} options={brands} onChange={value => setFilters(current => ({ ...current, brand: value }))} />
        <EntityFilter label={t('campaign')} value={filters.campaign} options={campaigns} onChange={value => setFilters(current => ({ ...current, campaign: value }))} />
        <label className="text-xs font-medium">{t('role')}<Select value={filters.role} onValueChange={value => setFilters(current => ({ ...current, role: value }))}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{(['host','support','technical'] as OperationalRole[]).map(role => <SelectItem key={role} value={role}>{t(role)}</SelectItem>)}</SelectContent></Select></label>
        <label className="text-xs font-medium">{t('status')}<Select value={filters.status} onValueChange={value => setFilters(current => ({ ...current, status: value }))}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{(['pending','accepted','approved','rejected','cancelled','completed'] as const).map(status => <SelectItem key={status} value={status}>{(t as unknown as (k:string)=>string)(status)}</SelectItem>)}</SelectContent></Select></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setFilters(initialFilters)}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button>
        {currentUser && hasPermission(currentUser, 'swaps.export') && <>
          <Button variant="outline" disabled={!filtered.length} onClick={() => exportSwapsToExcel(filtered, shifts, exportMaps.users, exportMaps.brands, exportMaps.campaigns)}><FileSpreadsheet className="mr-2 h-4 w-4" />{t('exportFilteredSwaps')}</Button>
          <Button variant="outline" disabled={!swaps.some(swap => swap.status !== 'pending')} onClick={() => exportSwapsToExcel(swaps.filter(swap => swap.status !== 'pending'), shifts, exportMaps.users, exportMaps.brands, exportMaps.campaigns, 'swap_history.xlsx')}><Download className="mr-2 h-4 w-4" />{t('exportSwapHistory')}</Button>
          <Button variant="outline" onClick={downloadSwapRequestTemplate}><Download className="mr-2 h-4 w-4" />{t('downloadSwapTemplate')}</Button>
        </>}
      </div>
    </CardContent></Card>

    {filtered.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t('noSwaps')}</CardContent></Card> : <Card className="overflow-hidden"><CardContent className="p-0"><div className="max-h-[60vh] space-y-3 overflow-auto p-4">{visibleSwaps.map(swap => {
      const shift = shiftById.get(swap.shift_id)
      if (!shift) return null
      const isCounterpart = currentUser?.id === (swap.mode === 'replacement' ? replacementFor(swap) : swap.counterpart_id)
      const canApprove = currentUser && hasPermission(currentUser, 'swaps.approve')
      const isProductionMode = swap.mode === 'replacement' || swap.mode === 'exchange'
      const showAccept = swap.status === 'pending' && isProductionMode && isCounterpart
      const showApprove = swap.status === 'accepted' && isProductionMode && canApprove
      const showLeaderReject = (swap.status === 'pending' || swap.status === 'accepted') && isProductionMode && canApprove
      const showCancel = (swap.status === 'pending' || swap.status === 'accepted') && currentUser?.id === swap.requester_id
      return <Card key={swap.id}><CardContent className="flex flex-wrap items-start justify-between gap-4 pt-5"><div className="space-y-2"><div className="flex items-center gap-2"><Badge className={swap.status === 'approved' || swap.status === 'completed' ? 'bg-green-100 text-green-800' : swap.status === 'rejected' || swap.status === 'cancelled' ? 'bg-red-100 text-red-800' : swap.status === 'accepted' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}>{(t as unknown as (k:string)=>string)(swap.status)}</Badge><span className="text-xs text-muted-foreground">{format(new Date(swap.created_at), 'dd/MM/yyyy HH:mm')}</span><span className="text-xs text-muted-foreground">{swap.mode || 'replacement'}</span></div><p className="font-semibold">{nameFor(brands, shift.brand_id)} · {nameFor(platforms, shift.platform_id)}</p><p className="text-sm text-muted-foreground">{shift.date} · {formatShiftTimeRange(shift)} · {nameFor(campaigns, shift.campaign_id)}</p><p className="text-xs text-muted-foreground">Source → Target: {(swap.source_shift_id || swap.shift_id) ?? '—'} → {swap.target_shift_id ?? '—'} {swap.counterpart_id ? `· counterpart ${userName(swap.counterpart_id)}` : ''}</p><div className="grid gap-2 text-sm sm:grid-cols-3"><Value label={t('role')} value={t(roleFor(swap))} /><Value label={t('originalStaff')} value={userName(swap.original_staff_id || swap.requester_id)} /><Value label={t('replacementStaff')} value={userName(replacementFor(swap) || swap.counterpart_id || '')} /></div><p className="rounded bg-muted/50 p-2 text-sm">{swap.reason}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setSelectedSwap(swap)}>{t('viewDetails')}</Button>{showCancel && <Button size="sm" variant="outline" onClick={() => setCancelTarget(swap)}><XCircle className="mr-1 h-4 w-4" />Cancel request</Button>}{showAccept && <><Button size="sm" onClick={() => void runReview(swap, 'accept')}><CheckCircle className="mr-1 h-4 w-4" />Accept</Button><Button size="sm" variant="outline" onClick={() => void runReview(swap, 'counterpart_reject')}><XCircle className="mr-1 h-4 w-4" />Reject</Button></>}{showApprove && <Button size="sm" onClick={() => void runReview(swap, 'approve')}><CheckCircle className="mr-1 h-4 w-4" />{t('approve')}</Button>}{showLeaderReject && <Button size="sm" variant="outline" onClick={() => void runReview(swap, 'reject')}><XCircle className="mr-1 h-4 w-4" />{t('reject')}</Button>}</div></CardContent></Card>
    })}</div><HistoryPagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} /></CardContent></Card>}

    {showForm && currentUser && <SwapRequestFormModal open={showForm} onOpenChange={setShowForm} shifts={shifts.filter(shift => shift.status === 'scheduled' && (myShiftIds.has(shift.id) || shift.host_id === currentUser.id || shift.support_id === currentUser.id || shift.technical_id === currentUser.id))} users={users} brands={brands} platforms={platforms} onSuccess={() => { void loadData(); setShowForm(false) }} />}
    {selectedSwap && <SwapDetailModal open swap={selectedSwap} shift={shiftById.get(selectedSwap.shift_id)!} requester={users.find(user => user.id === selectedSwap.requester_id)!} newHost={users.find(user => user.id === replacementFor(selectedSwap))} brands={brands} platforms={platforms} canReview={Boolean(currentUser && hasPermission(currentUser, 'swaps.approve'))} onOpenChange={open => !open && setSelectedSwap(null)} onApprove={() => runReview(selectedSwap, 'approve')} onReject={() => runReview(selectedSwap, 'reject')} />}
    <LifecycleActionDialog open={Boolean(cancelTarget)} onOpenChange={open => !open && setCancelTarget(null)} title="Cancel swap request" impact={cancelImpact} confirmText="Cancel request" onConfirm={cancelSwap} />
  </div>
}

function EntityFilter({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <label className="text-xs font-medium">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></label>
}
function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div> }
