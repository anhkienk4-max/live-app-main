'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Search, Users } from 'lucide-react'
import { brandService, campaignService, platformService, shiftRegistrationService, shiftService, userService, getShiftRoleCapacities, isStaffedRegistration } from '@/lib/services/dataService'
import type { Brand, Campaign, Platform, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
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
  const [gapsOnly,setGapsOnly]=useState(false)
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [detailOpen,setDetailOpen]=useState(false)
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(10)
  const load=useCallback(async()=>{
    setError(null)
    try {
      const [shifts,registrations,users,brands,platforms,campaigns]=await Promise.all([shiftService.getAll(),shiftRegistrationService.getAll(),userService.getAll(),brandService.getAll(),platformService.getAll(),campaignService.getAll()])
      setData({shifts,registrations,users,brands,platforms,campaigns})
    } catch(failure) {setError(failure)} finally {setLoading(false)}
  },[])
  useEffect(()=>{const frame=requestAnimationFrame(()=>void load());return()=>cancelAnimationFrame(frame)},[load])
  const baseFiltered=data.shifts.filter(shift=>matchesMultiSelect(shift.brand_id,filters.brandIds) && matchesMultiSelect(shift.platform_id,filters.platformIds) && matchesMultiSelect(shift.campaign_id,filters.campaignIds) && matchesMultiSelect(shift.status,filters.statuses) && (!filters.roles.length || getShiftRoleCapacities(shift,data.registrations).some(capacity=>filters.roles.includes(capacity.role) && capacity.required > 0)) && (!date||shift.date===date)&&[shift.title,shift.id,shift.studio,data.brands.find(brand=>brand.id===shift.brand_id)?.name].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>`${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
  const filtered=baseFiltered.filter(shift=>!gapsOnly||getShiftRoleCapacities(shift,data.registrations).some(capacity=>capacity.remaining>0))
  const baseShiftIds=new Set(baseFiltered.map(shift=>shift.id))
  const gapShiftCount=baseFiltered.filter(shift=>getShiftRoleCapacities(shift,data.registrations).some(capacity=>capacity.remaining>0)).length
  const pendingRegistrationCount=data.registrations.filter(registration=>baseShiftIds.has(registration.shift_id)&&registration.status==='pending').length
  const fullyStaffedCount=baseFiltered.filter(shift=>{const capacities=getShiftRoleCapacities(shift,data.registrations).filter(capacity=>capacity.required>0);return capacities.length>0&&capacities.every(capacity=>capacity.remaining===0)}).length
  const safePage=Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))
  const visible=filtered.slice((safePage-1)*pageSize,safePage*pageSize)
  const selected=filtered.find(shift=>shift.id===selectedId)??visible[0]
  if(loading) return <p className="p-8 text-center">{t('loading')}</p>
  if(error) return <PageLoadError error={error} onRetry={()=>{setLoading(true);void load()}} />
  return <div className="min-w-0 space-y-4" data-testid="staffing-production-workspace">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder={t('search')} value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} /></div><Input type="date" className="w-auto" aria-label={t('date')} value={date} onChange={event=>{setDate(event.target.value);setPage(1)}} /><Button variant={gapsOnly?'default':'outline'} onClick={()=>{setGapsOnly(!gapsOnly);setPage(1)}}>{t('staffingGapsOnly')}</Button><Button variant="outline" onClick={()=>void load()} aria-label={t('refresh')}><RefreshCw className="h-4 w-4" /></Button></div>
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4">{[[t('totalShifts'),baseFiltered.length],[t('staffingGapsOnly'),gapShiftCount],[t('pending'),pendingRegistrationCount],[t('fullyStaffed'),fullyStaffedCount]].map(([label,value])=><div key={String(label)} className="border-r border-slate-200 px-3 py-2 last:border-r-0"><p className="text-[11px] text-slate-500">{label}</p><p className="text-base font-semibold">{value}</p></div>)}</div>
    <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
      <MultiSelectFilter label={t('brand')} value={filters.brandIds} options={data.brands.map(item=>({value:item.id,label:item.name}))} onChange={brandIds=>{setFilters({...filters,brandIds});setPage(1)}} />
      <MultiSelectFilter label={t('platform')} value={filters.platformIds} options={data.platforms.map(item=>({value:item.id,label:item.name}))} onChange={platformIds=>{setFilters({...filters,platformIds});setPage(1)}} />
      <MultiSelectFilter label={t('campaign')} value={filters.campaignIds} options={data.campaigns.map(item=>({value:item.id,label:item.name}))} onChange={campaignIds=>{setFilters({...filters,campaignIds});setPage(1)}} />
      <MultiSelectFilter label={t('role')} value={filters.roles} options={(['host','support','technical'] as const).map(role=>({value:role,label:t(role)}))} onChange={roles=>{setFilters({...filters,roles});setPage(1)}} />
      <MultiSelectFilter label={t('status')} value={filters.statuses} options={(['scheduled','preparing','live','paused','completed','cancelled'] as const).map(status=>({value:status,label:t(status==='live'?'liveStatus':status)}))} onChange={statuses=>{setFilters({...filters,statuses});setPage(1)}} />
    </div>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(320px,1fr)]"><section className="min-w-0 overflow-hidden rounded-lg border bg-white"><div className="flex items-center justify-between border-b px-3 py-2"><h2 className="text-sm font-semibold">{t('staffing')}</h2><span className="text-xs text-slate-500">{filtered.length} {t('totalShifts')}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">{t('date')}</th><th className="px-3 py-2">{t('time')}</th><th className="px-3 py-2">{t('shiftDetail')}</th><th className="px-3 py-2">{t('studio')}</th><th className="px-3 py-2">{t('role')}</th><th className="px-3 py-2">{t('staffing')}</th><th className="px-3 py-2">{t('status')}</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(shift=>{
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
<td className="px-3 py-2 whitespace-nowrap">{t(shift.status==='live'?'liveStatus':shift.status)}</td>
</tr>
})}</tbody></table></div>{!filtered.length&&<p className="p-8 text-center text-sm text-slate-500">{t('noData')}</p>}<HistoryPagination page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1)}} /></section>
    {selected&&<aside className="min-w-0 space-y-4 rounded-lg border bg-white p-4"><div><h2 className="text-base font-semibold">{selected.title||selected.id}</h2><p className="mt-1 text-xs text-slate-500">{selected.date} · {formatShiftTimeRange(selected)} · {selected.studio||'—'}</p></div><StaffingShiftSummary shift={selected} registrations={data.registrations} />{getShiftRoleCapacities(selected,data.registrations).map(capacity=><section key={capacity.role} className="border-t pt-3"><h3 className="flex items-center justify-between text-xs font-semibold"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t(capacity.role)}</span><span>{capacity.approved}/{capacity.required}</span></h3>{resolveStaffingLabelsForRole(selected,data.registrations.filter(registration=>registration.shift_id===selected.id),data.users,capacity.role,key=>translate(key)).map(person=><div key={person.id} className="mt-2 flex justify-between gap-2 text-xs"><span>{person.name}</span><span className="text-slate-400">{person.isImportedOnly?'Tên nhập từ lịch':person.isUnassigned?translate('unassigned'):t('approved')}</span></div>)}<p className="mt-2 text-xs text-amber-700">{t('pending')}: {capacity.pending}</p></section>)}<div className="border-t pt-3 text-xs text-slate-500"><p>{selected.import_batch_id?'Lô nhập: '+selected.import_batch_id:'—'}</p><p className="mt-1">{t('version')}: {selected.version??'—'}</p><p className="mt-1">{data.registrations.filter(registration=>registration.shift_id===selected.id&&isStaffedRegistration(registration)).length} {t('approved')}</p></div><Button variant="outline" className="w-full" onClick={()=>setDetailOpen(true)}>{t('viewDetails')} · {t('staffing')}</Button></aside>}
    </div>
    {detailOpen&&selected&&<ShiftDetailModal open shift={selected} brands={data.brands} platforms={data.platforms} campaigns={data.campaigns} users={data.users} allShifts={data.shifts} allRegistrations={data.registrations} onOpenChange={setDetailOpen} onUpdate={()=>void load()} onDelete={()=>{setDetailOpen(false);void load()}} />}
  </div>
}
