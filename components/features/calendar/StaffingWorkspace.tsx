'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useRequestSequence } from '@/lib/hooks/useRequestSequence'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { Download, Eye, Filter, LayoutGrid, RefreshCw, Search, Table as TableIcon, Users, UserCheck, X } from 'lucide-react'
import { BulkStaffingApprovalDialog } from './BulkStaffingApprovalDialog'
import { brandService, campaignService, platformService, shiftService, userService, getShiftRoleCapacities } from '@/lib/services/dataService'
import type { Brand, Campaign, Platform, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'
import { StaffingActionPanel } from '@/components/features/calendar/StaffingActionPanel'
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
  const router = useRouter()
  const { t, translate } = useTranslation()
  const [data,setData]=useState<{shifts:Shift[]; registrations:ShiftRegistration[]; users:User[]; brands:Brand[]; platforms:Platform[]; campaigns:Campaign[]}>({shifts:[],registrations:[],users:[],brands:[],platforms:[],campaigns:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<unknown>(null)
  const [query,setQuery]=useState('')
  const [date,setDate]=useState('')
  const [filters,setFilters]=useState({brandIds:[] as string[],platformIds:[] as string[],campaignIds:[] as string[],roles:[] as string[],statuses:[] as string[]})
  const [gapsOnly,setGapsOnly]=useState(false)
  const [draftFilters,setDraftFilters]=useState(filters)
  const [draftDate,setDraftDate]=useState(date)
  const [draftGapsOnly,setDraftGapsOnly]=useState(false)
  const [showFilters,setShowFilters]=useState(false)
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [detailOpen,setDetailOpen]=useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set())
  const [showBulkApproval, setShowBulkApproval] = useState(false)
  const { currentUser } = useCurrentUser()

  const handleExportCsv = () => {
    const headers = ['Mã ca', 'Ngày', 'Khung giờ', 'Tên ca', 'Thương hiệu', 'Nền tảng', 'Studio', 'Host cần/duyệt', 'Support cần/duyệt', 'Tech cần/duyệt', 'Tổng thiếu', 'Trạng thái']
    const csvRows = [headers.join(',')]
    visible.forEach(shift => {
      const caps = getShiftRoleCapacities(shift, data.registrations)
      const hostCap = caps.find(c => c.role === 'host')
      const suppCap = caps.find(c => c.role === 'support')
      const techCap = caps.find(c => c.role === 'technical')
      const missing = caps.reduce((sum, c) => sum + c.remaining, 0)
      const bName = data.brands.find(b => b.id === shift.brand_id)?.name || ''
      const pName = data.platforms.find(p => p.id === shift.platform_id)?.name || ''
      const escape = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`
      csvRows.push([
        escape(shift.id),
        escape(shift.date),
        escape(formatShiftTimeRange(shift)),
        escape(shift.title || shift.id),
        escape(bName),
        escape(pName),
        escape(shift.studio || ''),
        escape(`${hostCap?.approved ?? 0}/${hostCap?.required ?? 0}`),
        escape(`${suppCap?.approved ?? 0}/${suppCap?.required ?? 0}`),
        escape(`${techCap?.approved ?? 0}/${techCap?.required ?? 0}`),
        escape(missing),
        escape(shift.status)
      ].join(','))
    })
    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `staffing_export_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const toggleSelectShift = (shiftId: string) => {
    setSelectedShiftIds(prev => {
      const next = new Set(prev)
      if (next.has(shiftId)) next.delete(shiftId)
      else next.add(shiftId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedShiftIds.size >= visible.length) {
      setSelectedShiftIds(new Set())
    } else {
      setSelectedShiftIds(new Set(visible.map(s => s.id)))
    }
  }
  const pagination = useListPagination('staffing', 20)
  const { page, pageSize, setPage, setPageSize, navigate } = pagination
  // Read the deep-link only after hydration: window-dependent state during SSR
  // would otherwise render different markup on the server vs the browser.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (new URLSearchParams(window.location.search).get('gap') !== 'missing') return
      setGapsOnly(true)
      setDraftGapsOnly(true)
      navigate({ staffing_page: null }, true)
    })
    return () => cancelAnimationFrame(frame)
  }, [navigate])
  const [total, setTotal] = useState(0)
  const {next,isCurrent,invalidate}=useRequestSequence()
  const identity=currentUser?currentUser.id+':'+(currentUser.system_permission??currentUser.role):''
  const [loadedIdentity,setLoadedIdentity]=useState('')
  const [referenceIdentity,setReferenceIdentity]=useState('')
  const [referenceReload,setReferenceReload]=useState(0)
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
    navigate({ staffing_page: null, gap: draftGapsOnly ? 'missing' : null }, true)
    setSelectedId(null)
    setShowFilters(false)
  }
  const clearFilters = () => {
    setFilters({brandIds:[],platformIds:[],campaignIds:[],roles:[],statuses:[]})
    setDraftFilters({brandIds:[],platformIds:[],campaignIds:[],roles:[],statuses:[]})
    setDate('');setDraftDate('');setGapsOnly(false);setDraftGapsOnly(false)
    setQuery('')
    navigate({ staffing_page: null, gap: null }, true)
    setSelectedId(null)
    setShowFilters(false)
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
    }).catch(error=>{if(active){setReferenceIdentity(identity);setError(error)}})})
    return()=>{active=false;cancelAnimationFrame(frame)}
  }, [currentUser,identity,loadReferences,referenceReload])
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
    } catch(failure) {if(isCurrent(request)){setLoadedIdentity(identity);setError(failure)}} finally {if(isCurrent(request))setLoading(false)}
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
  if(error&&identity===loadedIdentity&&identity===referenceIdentity) return <PageLoadError error={error} onRetry={()=>{setError(null);setLoading(true);setLoadedIdentity('');setReferenceIdentity('');setReferenceReload(value=>value+1);void load()}} />
  if(loading||identity!==loadedIdentity||identity!==referenceIdentity) return <p className="p-8 text-center">{t('loading')}</p>
  return <div className="min-w-0 space-y-4" data-testid="staffing-production-workspace">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 text-xs sm:text-sm" aria-label="Tìm ca điều phối" placeholder="Tìm theo tên ca, thương hiệu..." value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} />
        </div>
        <Button type="button" size="sm" variant={showFilters?'secondary':'outline'} aria-expanded={showFilters} aria-controls="staffing-filter-panel" data-testid="staffing-filter-toggle" onClick={openFilters}>
          <Filter className="mr-1.5 h-3.5 w-3.5" /> Bộ lọc{activeFilterCount>0?' ('+activeFilterCount+')':''}
        </Button>
        {activeFilterCount>0&&<Button type="button" size="sm" variant="ghost" data-testid="staffing-clear-filters" onClick={clearFilters}><X className="mr-1 h-3.5 w-3.5"/>Xóa lọc</Button>}
        <Button type="button" size="sm" variant="outline" onClick={()=>void load()} aria-label={t('refresh')}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Bulk approval button */}
        {currentUser && (currentUser.system_permission === 'admin' || currentUser.system_permission === 'leader') && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowBulkApproval(true)}
            className="border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100/60"
            data-testid="staffing-bulk-approve"
          >
            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
            <span>Duyệt nhanh ({selectedShiftIds.size > 0 ? selectedShiftIds.size : 'Tất cả'})</span>
          </Button>
        )}

        {/* View Mode Toggle */}
        <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            aria-pressed={viewMode === 'table'}
            className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-all ${viewMode === 'table' ? 'bg-white text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bảng</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('card')}
            aria-pressed={viewMode === 'card'}
            className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-all ${viewMode === 'card' ? 'bg-white text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Thẻ</span>
          </button>
        </div>

        {/* Export CSV */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
          className="flex items-center gap-1 text-xs"
          data-testid="staffing-export-csv"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Xuất CSV</span>
        </Button>
      </div>
    </div>
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card sm:grid-cols-4" aria-label="Tổng quan định biên của trang hiện tại">
      {[[t('totalShifts'),total],[t('staffingGapsOnly'),gapShiftCount],[t('pending'),pendingRegistrationCount],[t('fullyStaffed'),fullyStaffedCount]].map(([label,value],index)=>index===1
        ? <button type="button" key={String(label)} data-testid="staffing-open-gaps" aria-pressed={gapsOnly} className={`min-w-0 border-r px-3 py-2 text-left transition-colors hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-primary ${gapsOnly?'bg-amber-50':''}`} onClick={()=>{setGapsOnly(true);setDraftGapsOnly(true);setSelectedId(null);setPage(1);navigate({staffing_page:null,gap:'missing'},true);setShowFilters(false)}}>
            <p className="text-[11px] text-amber-800">{label} · Xem ca thiếu →</p><p className="text-base font-semibold">{value}</p>
          </button>
        : <div key={String(label)} className="min-w-0 border-r px-3 py-2 last:border-r-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-base font-semibold">{value}</p></div>)}
    </div>
    {showFilters&&<div className="rounded-xl border border-border/80 bg-card p-4 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between border-b pb-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" /> Bộ lọc nâng cao ca điều phối
        </h3>
        <Button type="button" size="sm" variant="ghost" onClick={()=>setShowFilters(false)} className="h-7 w-7 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <section id="staffing-filter-panel" data-testid="staffing-filter-panel" className="space-y-3" aria-label="Bộ lọc ca điều phối">
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div><label htmlFor="staffing-filter-date" className="mb-1 block text-xs font-medium text-muted-foreground">{t('date')}</label><Input id="staffing-filter-date" type="date" className="h-8 text-xs" value={draftDate} onChange={event=>setDraftDate(event.target.value)} /></div>
          <MultiSelectFilter label={t('brand')} value={draftFilters.brandIds} options={data.brands.map(item=>({value:item.id,label:item.name}))} onChange={brandIds=>setDraftFilters({...draftFilters,brandIds})} />
          <MultiSelectFilter label={t('platform')} value={draftFilters.platformIds} options={data.platforms.map(item=>({value:item.id,label:item.name}))} onChange={platformIds=>setDraftFilters({...draftFilters,platformIds})} />
          <MultiSelectFilter label={t('campaign')} value={draftFilters.campaignIds} options={data.campaigns.map(item=>({value:item.id,label:item.name}))} onChange={campaignIds=>setDraftFilters({...draftFilters,campaignIds})} />
          <MultiSelectFilter label={t('role')} value={draftFilters.roles} options={(['host','support','technical'] as const).map(role=>({value:role,label:t(role)}))} onChange={roles=>setDraftFilters({...draftFilters,roles})} />
          <MultiSelectFilter label={t('status')} value={draftFilters.statuses} options={(['scheduled','preparing','live','paused','completed','cancelled'] as const).map(status=>({value:status,label:t(status==='live'?'liveStatus':status)}))} onChange={statuses=>setDraftFilters({...draftFilters,statuses})} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
          <input type="checkbox" checked={draftGapsOnly} onChange={event=>setDraftGapsOnly(event.target.checked)} className="rounded border-slate-300" />
          {t('staffingGapsOnly')} (Chỉ hiện ca thiếu nhân sự)
        </label>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>Xóa tất cả</Button>
          <Button type="button" size="sm" variant="outline" onClick={()=>setShowFilters(false)}>Đóng</Button>
          <Button type="button" size="sm" data-testid="staffing-apply-filters" onClick={applyFilters}>Áp dụng bộ lọc</Button>
        </div>
      </section>
    </div>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(320px,1fr)]">
      <section className="min-w-0 overflow-hidden rounded-lg border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t('staffing')}</h2>
            <span className="text-xs text-slate-500">{filtered.length} {t('totalShifts')}</span>
          </div>
          {selectedShiftIds.size > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-blue-700">Đã chọn {selectedShiftIds.size} ca</span>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => setShowBulkApproval(true)}
                className="h-7 text-xs"
                data-testid="staffing-bulk-approve-btn"
              >
                <UserCheck className="mr-1 h-3.5 w-3.5" />
                Duyệt đăng ký ca đã chọn
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedShiftIds(new Set())}
                className="h-7 text-xs"
              >
                Bỏ chọn
              </Button>
            </div>
          )}
        </div>

        {viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả ca trên trang"
                      checked={visible.length > 0 && visible.every(s => selectedShiftIds.has(s.id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2">{t('date')}</th>
                  <th className="px-3 py-2">{t('time')}</th>
                  <th className="px-3 py-2">{t('shiftDetail')}</th>
                  <th className="px-3 py-2">{t('studio')}</th>
                  <th className="px-3 py-2">{t('role')}</th>
                  <th className="px-3 py-2">{t('staffing')}</th>
                  <th className="px-3 py-2">{t('status')}</th>
                  <th className="px-3 py-2">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(shift => {
                  const capacities = getShiftRoleCapacities(shift, data.registrations).filter(item => item.required > 0)
                  const required = capacities.reduce((tot, item) => tot + item.required, 0)
                  const approved = capacities.reduce((tot, item) => tot + item.approved, 0)
                  const missing = capacities.reduce((tot, item) => tot + item.remaining, 0)
                  return (
                    <tr
                      key={shift.id}
                      className={selected?.id === shift.id ? 'bg-blue-50/60' : 'hover:bg-slate-50'}
                    >
                      <td className="w-8 px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={'Chọn ca ' + (shift.title || shift.id)}
                          checked={selectedShiftIds.has(shift.id)}
                          onChange={() => toggleSelectShift(shift.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{shift.date}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatShiftTimeRange(shift)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(shift.id)}
                          aria-pressed={selected?.id === shift.id}
                          className="text-left font-medium text-blue-700 hover:underline"
                        >
                          {shift.title || shift.id}
                        </button>
                        <p className="text-[10px] text-slate-500">
                          {data.brands.find(item => item.id === shift.brand_id)?.name || '—'} · {data.campaigns.find(item => item.id === shift.campaign_id)?.name || '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2">{shift.studio || '—'}</td>
                      <td className="px-3 py-2">
                        {capacities.length ? capacities.map(item => (
                          <span key={item.role} className="mr-2 inline-block whitespace-nowrap">
                            {t(item.role)} {item.required}
                          </span>
                        )) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span>{approved}/{required}</span>
                        {missing > 0 && <p className="text-[10px] text-amber-700">{t('missingCount')}: {missing}</p>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{t(shift.status === 'live' ? 'liveStatus' : shift.status)}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          aria-label={'Xem chi tiết ca ' + (shift.title || shift.id)}
                          data-testid={'staffing-eye-' + shift.id}
                          onClick={() => {
                            setSelectedId(shift.id)
                            setDetailOpen(true)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(shift => {
              const capacities = getShiftRoleCapacities(shift, data.registrations).filter(item => item.required > 0)
              const required = capacities.reduce((tot, item) => tot + item.required, 0)
              const approved = capacities.reduce((tot, item) => tot + item.approved, 0)
              const missing = capacities.reduce((tot, item) => tot + item.remaining, 0)
              return (
                <div
                  key={shift.id}
                  className={'relative rounded-lg border p-3 transition-colors ' + (selected?.id === shift.id ? 'border-blue-400 bg-blue-50/40 ring-1 ring-blue-300' : 'bg-card hover:border-slate-300')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={'Chọn ca ' + (shift.title || shift.id)}
                        checked={selectedShiftIds.has(shift.id)}
                        onChange={() => toggleSelectShift(shift.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-semibold">{shift.date}</span>
                    </div>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      {t(shift.status === 'live' ? 'liveStatus' : shift.status)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedId(shift.id)}
                    className="mt-2 block text-left text-xs font-medium text-blue-700 hover:underline"
                  >
                    {shift.title || shift.id}
                  </button>

                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatShiftTimeRange(shift)} · {shift.studio || 'Chưa gán studio'}
                  </p>

                  <div className="mt-2.5 flex items-center justify-between border-t pt-2 text-[11px]">
                    <span className="font-medium">Định biên: {approved}/{required}</span>
                    {missing > 0 ? (
                      <span className="font-semibold text-amber-700">Thiếu: {missing}</span>
                    ) : (
                      <span className="text-emerald-700">Đủ nhân sự</span>
                    )}
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setSelectedId(shift.id)
                        setDetailOpen(true)
                      }}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Chi tiết
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!filtered.length && <p className="p-8 text-center text-sm text-slate-500">{t('noData')}</p>}
        <HistoryPagination page={safePage} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </section>
    {selected&&<aside className="min-w-0 space-y-4 rounded-lg border bg-white p-4"><div><h2 className="text-base font-semibold">{selected.title||selected.id}</h2><p className="mt-1 text-xs text-slate-500">{selected.date} · {formatShiftTimeRange(selected)} · {selected.studio||'—'}</p></div><StaffingShiftSummary shift={selected} registrations={data.registrations} />{getShiftRoleCapacities(selected,data.registrations).map(capacity=><section key={capacity.role} className="border-t pt-3"><h3 className="flex items-center justify-between text-xs font-semibold"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t(capacity.role)}</span><span>{capacity.approved}/{capacity.required}</span></h3>{resolveStaffingLabelsForRole(selected,data.registrations.filter(registration=>registration.shift_id===selected.id),data.users,capacity.role,key=>translate(key)).map(person=><div key={person.id} className="mt-2 flex justify-between gap-2 text-xs"><span>{person.name}</span><span className="text-slate-400">{person.isImportedOnly?'Tên nhập từ lịch':person.isUnassigned?translate('unassigned'):t('approved')}</span></div>)}<p className="mt-2 text-xs text-amber-700">{t('pending')}: {capacity.pending}</p></section>)}<div className="border-t pt-3 text-xs text-slate-500"><p>{selected.import_batch_id?'Lô nhập: '+selected.import_batch_id:'—'}</p><p className="mt-1">{t('version')}: {selected.version??'—'}</p><p className="mt-1">{getShiftRoleCapacities(selected,data.registrations).reduce((sum,capacity)=>sum+capacity.approved,0)} {t('approved')}</p></div><Button variant="outline" className="w-full" onClick={()=>setDetailOpen(true)}>{t('viewDetails')} · {t('staffing')}</Button><StaffingActionPanel key={selected.id} shift={selected} users={data.users} onUpdated={load} /></aside>}
    </div>
    {detailOpen&&selected&&<ShiftDetailModal open shift={selected} brands={data.brands} platforms={data.platforms} campaigns={data.campaigns} users={data.users} allShifts={data.shifts} allRegistrations={data.registrations} onOpenChange={setDetailOpen} onUpdate={()=>void load()} onEdit={()=>{setDetailOpen(false);router.push(`/shifts?edit_shift_id=${encodeURIComponent(selected.id)}`)}} onDelete={()=>{setDetailOpen(false);void load()}} />}
    {showBulkApproval && currentUser && (
      <BulkStaffingApprovalDialog
        open={showBulkApproval}
        onOpenChange={setShowBulkApproval}
        registrations={data.registrations}
        shifts={data.shifts}
        users={data.users}
        currentUser={currentUser}
        onChanged={load}
      />
    )}
  </div>
}
