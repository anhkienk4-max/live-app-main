'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRequestSequence } from '@/lib/hooks/useRequestSequence'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { Eye, Filter, RefreshCw, Search, Users, X } from 'lucide-react'
import { brandService, campaignService, platformService, shiftService, userService, getShiftRoleCapacities } from '@/lib/services/dataService'
import type { Brand, Campaign, Platform, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { PageLoadError } from '@/components/ui/page-load-error'

export function StaffingShiftSummary({ shift, registrations }: { shift: Shift; registrations: ShiftRegistration[] }) {
  const { t } = useTranslation()
  return <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-xs">{getShiftRoleCapacities(shift,registrations).map(capacity=><span key={capacity.role} className={`rounded border px-2 py-1 ${capacity.remaining ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{t(capacity.role)}: {capacity.approved}/{capacity.required}{capacity.remaining > 0 && ` · Thiếu: ${capacity.remaining}`}</span>)}</div>
}

export function StaffingWorkspace() {
  const { t, translate } = useTranslation()
  const [data,setData]=useState<{shifts:Shift[]; registrations:ShiftRegistration[]; users:User[]; brands:Brand[]; platforms:Platform[]; campaigns:Campaign[]}>({shifts:[],registrations:[],users:[],brands:[],platforms:[],campaigns:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<unknown>(null)
  const [query,setQuery]=useState('')
  const [date,setDate]=useState('')
  const [filters,setFilters]=useState({brandIds:[] as string[],platformIds:[] as string[],campaignIds:[] as string[],roles:[] as string[],statuses:[] as string[]})
  const [gapsOnly,setGapsOnly]=useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('gap') === 'missing')
  const [draftFilters,setDraftFilters]=useState(filters)
  const [draftDate,setDraftDate]=useState(date)
  const [draftGapsOnly,setDraftGapsOnly]=useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('gap') === 'missing')
  const [showFilters,setShowFilters]=useState(false)
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [detailOpen,setDetailOpen]=useState(false)
  const { currentUser } = useCurrentUser()
  const pagination = useListPagination('staffing', 20)
  const { page, pageSize, setPage, setPageSize, navigate } = pagination
  const [total, setTotal] = useState(0)
  const {next,isCurrent,invalidate}=useRequestSequence()
  const identity=currentUser?currentUser.id+':'+(currentUser.system_permission??currentUser.role):''
  const [loadedIdentity,setLoadedIdentity]=useState('')
  const [referenceIdentity,setReferenceIdentity]=useState('')
  const activeFilterCount = Object.values(filters).reduce((sum, value) => sum + value.length, 0) + Number(Boolean(date)) + Number(gapsOnly)
  const openFilters = () => {
    setDraftFilters({ ...filters, brandIds: [...filters.brandIds], platformIds: [...filters.platformIds], campaignIds: [...filters.campaignIds], roles: [...filters.roles], statuses: [...filters.statuses] })
    setDraftDate(date)
    setDraftGapsOnly(gapsOnly)
    setShowFilters(!showFilters)
  }
  const applyFilters = () => {
    setFilters(draftFilters)
    setDate(draftDate)
    setGapsOnly(draftGapsOnly)
    setPage(1)
    setSelectedId(null)
    setShowFilters(false)
  }
  const clearFilters = () => {
    setFilters({brandIds:[],platformIds:[],campaignIds:[],roles:[],statuses:[]})
    setDraftFilters({brandIds:[],platformIds:[],campaignIds:[],roles:[],statuses:[]})
    setDate('');setDraftDate('');setGapsOnly(false);setDraftGapsOnly(false)
    setQuery('');setPage(1);setSelectedId(null);setShowFilters(false)
    const url = new URL(window.location.href)
    if (url.searchParams.has('gap')) {
      url.searchParams.delete('gap')
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }
  const encodedFilters = JSON.stringify({ search: query, from: date || undefined, to: date || undefined,
    brandIds: filters.brandIds, platformIds: filters.platformIds, campaignIds: filters.campaignIds,
    operationalRoles: filters.roles, statuses: filters.statuses, staffingStates: gapsOnly ? ['missing_staff'] : [] })
  const loadReferences = useCallback(async () => {
    const [users,brands,platforms,campaigns] = await Promise.all([userService.getAll(),brandService.getAll(),platformService.getAll(),campaignService.getAll()])
    return {users,brands,platforms,campaigns}
  }, [])
  useEffect(() => {
    let active=true
    const frame=requestAnimationFrame(()=>{if(currentUser)void loadReferences().then(reference=>{
      if(active){setData(prev=>({...prev,...reference}));setReferenceIdentity(identity)}
    }).catch(error=>{if(active)setError(error)})})
    return()=>{active=false;cancelAnimationFrame(frame)}
  }, [currentUser,identity,loadReferences])
  const load=useCallback(async()=>{
    const request = next()
    setError(null)
    try {
      const result = await shiftService.getCalendarPage({ page, pageSize, filters: JSON.parse(encodedFilters) })
      if (!isCurrent(request)) return
      setLoadedIdentity(identity)
      setData(prev => ({ ...prev, shifts: result.items, registrations: result.registrations }))
      setTotal(result.total)
      if (result.page !== page) navigate({ staffing_page: String(result.page) }, true)
    } catch(failure) {if(isCurrent(request))setError(failure)} finally {if(isCurrent(request))setLoading(false)}
  },[encodedFilters,navigate,page,pageSize,identity,next,isCurrent])
  useShiftChangeRefresh(load)
  useEffect(()=>{const frame=requestAnimationFrame(()=>void load());return()=>{cancelAnimationFrame(frame);invalidate()}},[load,invalidate])
  const baseFiltered=data.shifts
  const filtered=baseFiltered
  const gapShiftCount=baseFiltered.filter(shift=>getShiftRoleCapacities(shift,data.registrations).some(capacity=>capacity.remaining>0)).length
  const pendingRegistrationCount=baseFiltered.reduce((sum,shift)=>sum+getShiftRoleCapacities(shift,data.registrations).reduce((n,c)=>n+c.pending,0),0)
  const fullyStaffedCount=baseFiltered.filter(shift=>{const capacities=getShiftRoleCapacities(shift,data.registrations).filter(capacity=>capacity.required>0);return capacities.length>0&&capacities.every(capacity=>capacity.remaining===0)}).length
  const safePage=page
  const visible=filtered
  const selected=filtered.find(shift=>shift.id===selectedId)??visible[0]
  if(loading||identity!==loadedIdentity||identity!==referenceIdentity) return <p className="p-8 text-center">{t('loading')}</p>
  if(error) return <PageLoadError error={error} onRetry={()=>{setLoading(true);void load()}} />
  return <div className="min-w-0 space-y-4" data-testid="staffing-production-workspace">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" aria-label="Tìm ca điều phối" placeholder="Tìm theo tên ca, thương hiệu..." value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} />
      </div>
      <Button type="button" variant={showFilters?'secondary':'outline'} aria-expanded={showFilters} aria-controls="staffing-filter-panel" data-testid="staffing-filter-toggle" onClick={openFilters}>
        <Filter className="mr-2 h-4 w-4" /> Bộ lọc{activeFilterCount>0?' ('+activeFilterCount+')':''}
      </Button>
      {activeFilterCount>0&&<Button type="button" variant="ghost" data-testid="staffing-clear-filters" onClick={clearFilters}><X className="mr-1 h-4 w-4"/>Xóa lọc</Button>}
      <Button type="button" variant="outline" onClick={()=>void load()} aria-label={t('refresh')}><RefreshCw className="h-4 w-4" /></Button>
    </div>
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card sm:grid-cols-4" aria-label="Tổng quan định biên của trang hiện tại">
      {[[t('totalShifts'),total],[t('staffingGapsOnly'),gapShiftCount],[t('pending'),pendingRegistrationCount],[t('fullyStaffed'),fullyStaffedCount]].map(([label,value],index)=>index===1
        ? <button type="button" key={String(label)} data-testid="staffing-open-gaps" aria-pressed={gapsOnly} className={`min-w-0 border-r px-3 py-2 text-left transition-colors hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-primary ${gapsOnly?'bg-amber-50':''}`} onClick={()=>{setGapsOnly(true);setDraftGapsOnly(true);setSelectedId(null);setPage(1);setShowFilters(false)}}>
            <p className="text-[11px] text-amber-800">{label} · Xem ca thiếu →</p><p className="text-base font-semibold">{value}</p>
          </button>
        : <div key={String(label)} className="min-w-0 border-r px-3 py-2 last:border-r-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-base font-semibold">{value}</p></div>)}
    </div>
    {showFilters&&<section id="staffing-filter-panel" data-testid="staffing-filter-panel" className="space-y-3 rounded-lg border bg-card p-3" aria-label="Bộ lọc ca điều phối">
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div><label htmlFor="staffing-filter-date" className="mb-1 block text-sm font-medium">{t('date')}</label><Input id="staffing-filter-date" type="date" value={draftDate} onChange={event=>setDraftDate(event.target.value)} /></div>
        <MultiSelectFilter label={t('brand')} value={draftFilters.brandIds} options={data.brands.map(item=>({value:item.id,label:item.name}))} onChange={brandIds=>setDraftFilters({...draftFilters,brandIds})} />
        <MultiSelectFilter label={t('platform')} value={draftFilters.platformIds} options={data.platforms.map(item=>({value:item.id,label:item.name}))} onChange={platformIds=>setDraftFilters({...draftFilters,platformIds})} />
        <MultiSelectFilter label={t('campaign')} value={draftFilters.campaignIds} options={data.campaigns.map(item=>({value:item.id,label:item.name}))} onChange={campaignIds=>setDraftFilters({...draftFilters,campaignIds})} />
        <MultiSelectFilter label={t('role')} value={draftFilters.roles} options={(['host','support','technical'] as const).map(role=>({value:role,label:t(role)}))} onChange={roles=>setDraftFilters({...draftFilters,roles})} />
        <MultiSelectFilter label={t('status')} value={draftFilters.statuses} options={(['scheduled','preparing','live','paused','completed','cancelled'] as const).map(status=>({value:status,label:t(status==='live'?'liveStatus':status)}))} onChange={statuses=>setDraftFilters({...draftFilters,statuses})} />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={draftGapsOnly} onChange={event=>setDraftGapsOnly(event.target.checked)} />
        {t('staffingGapsOnly')}
      </label>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" onClick={clearFilters}>Xóa tất cả</Button>
        <Button type="button" variant="outline" onClick={()=>setShowFilters(false)}>Đóng</Button>
        <Button type="button" data-testid="staffing-apply-filters" onClick={applyFilters}>Áp dụng bộ lọc</Button>
      </div>
    </section>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(320px,1fr)]"><section className="min-w-0 overflow-hidden rounded-lg border bg-white"><div className="flex items-center justify-between border-b px-3 py-2"><h2 className="text-sm font-semibold">{t('staffing')}</h2><span className="text-xs text-slate-500">{filtered.length} {t('totalShifts')}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">{t('date')}</th><th className="px-3 py-2">{t('time')}</th><th className="px-3 py-2">{t('shiftDetail')}</th><th className="px-3 py-2">{t('studio')}</th><th className="px-3 py-2">{t('role')}</th><th className="px-3 py-2">{t('staffing')}</th><th className="px-3 py-2">{t('status')}</th><th className="px-3 py-2">Chi tiết</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(shift=>{
const capacities=getShiftRoleCapacities(shift,data.registrations).filter(item=>item.required>0)
const required=capacities.reduce((total,item)=>total+item.required,0)
const approved=capacities.reduce((total,item)=>total+item.approved,0)
const missing=capacities.reduce((total,item)=>total+item.remaining,0)
return <tr key={shift.id} className={selected?.id===shift.id?'bg-blue-50/60':'hover:bg-slate-50'}>
<td className="px-3 py-2 whitespace-nowrap">{shift.date}</td>
<td className="px-3 py-2 whitespace-nowrap">{formatShiftTimeRange(shift)}</td>
<td className="px-3 py-2"><button type="button" onClick={()=>setSelectedId(shift.id)} aria-pressed={selected?.id===shift.id} className="text-left font-medium text-blue-700">{shift.title||shift.id}</button><p className="text-[10px] text-slate-500">{data.brands.find(item=>item.id===shift.brand_id)?.name||'\u2014'} ? {data.campaigns.find(item=>item.id===shift.campaign_id)?.name||'\u2014'}</p></td>
<td className="px-3 py-2">{shift.studio||'\u2014'}</td>
<td className="px-3 py-2">{capacities.length?capacities.map(item=><span key={item.role} className="mr-2 inline-block whitespace-nowrap">{t(item.role)} {item.required}</span>):'\u2014'}</td>
<td className="px-3 py-2"><span>{approved}/{required}</span>{missing>0&&<p className="text-[10px] text-amber-700">{t('missingCount')}: {missing}</p>}</td>
<td className="px-3 py-2 whitespace-nowrap">{t(shift.status==='live'?'liveStatus':shift.status)}</td><td className="px-3 py-2"><Button type="button" size="icon" variant="outline" aria-label={'Xem chi tiết ca '+(shift.title||shift.id)} data-testid={'staffing-eye-'+shift.id} onClick={()=>{setSelectedId(shift.id);setDetailOpen(true)}}><Eye className="h-4 w-4" /></Button></td>
</tr>
})}</tbody></table></div>{!filtered.length&&<p className="p-8 text-center text-sm text-slate-500">{t('noData')}</p>}<HistoryPagination page={safePage} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} /></section>
    {selected&&<aside className="min-w-0 space-y-4 rounded-lg border bg-white p-4"><div><h2 className="text-base font-semibold">{selected.title||selected.id}</h2><p className="mt-1 text-xs text-slate-500">{selected.date} · {formatShiftTimeRange(selected)} · {selected.studio||'—'}</p></div><StaffingShiftSummary shift={selected} registrations={data.registrations} />{getShiftRoleCapacities(selected,data.registrations).map(capacity=><section key={capacity.role} className="border-t pt-3"><h3 className="flex items-center justify-between text-xs font-semibold"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t(capacity.role)}</span><span>{capacity.approved}/{capacity.required}</span></h3>{resolveStaffingLabelsForRole(selected,data.registrations.filter(registration=>registration.shift_id===selected.id),data.users,capacity.role,key=>translate(key)).map(person=><div key={person.id} className="mt-2 flex justify-between gap-2 text-xs"><span>{person.name}</span><span className="text-slate-400">{person.isImportedOnly?'Tên nhập từ lịch':person.isUnassigned?translate('unassigned'):t('approved')}</span></div>)}<p className="mt-2 text-xs text-amber-700">{t('pending')}: {capacity.pending}</p></section>)}<div className="border-t pt-3 text-xs text-slate-500"><p>{selected.import_batch_id?'Lô nhập: '+selected.import_batch_id:'—'}</p><p className="mt-1">{t('version')}: {selected.version??'—'}</p><p className="mt-1">{getShiftRoleCapacities(selected,data.registrations).reduce((sum,capacity)=>sum+capacity.approved,0)} {t('approved')}</p></div><Button variant="outline" className="w-full" onClick={()=>setDetailOpen(true)}>{t('viewDetails')} · {t('staffing')}</Button></aside>}
    </div>
    {detailOpen&&selected&&<ShiftDetailModal open shift={selected} brands={data.brands} platforms={data.platforms} campaigns={data.campaigns} users={data.users} allShifts={data.shifts} allRegistrations={data.registrations} onOpenChange={setDetailOpen} onUpdate={()=>void load()} onDelete={()=>{setDetailOpen(false);void load()}} />}
  </div>
}
