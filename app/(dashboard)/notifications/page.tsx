'use client'

import * as React from 'react'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { useRouter } from 'next/navigation'
import { Bell, ArrowLeftRight, CalendarDays, FileText, Users, RefreshCw } from 'lucide-react'
import { notificationService } from '@/lib/services/notificationService'
import type { AppNotification } from '@/lib/types/database.types'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import { resolveNotificationDestination } from '@/lib/services/notificationRoutes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLoadError } from '@/components/ui/page-load-error'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { format } from 'date-fns'

function NotificationIcon({item,className}:{item:AppNotification;className:string}) {
  if (item.type.startsWith('swap')) return <ArrowLeftRight className={className} />
  if (item.type.startsWith('report')) return <FileText className={className} />
  if (item.type === 'shift_assigned') return <CalendarDays className={className} />
  if (item.type.startsWith('staffing') || item.type === 'registration_submitted' || item.type === 'account_request_submitted') return <Users className={className} />
  return <Bell className={className} />
}

function notificationTypeLabel(type: AppNotification['type'], language: 'en' | 'vi') {
  const labels = language === 'vi' ? {
    account_request_submitted: 'Yêu cầu tài khoản', registration_submitted: 'Đăng ký ca', shift_assigned: 'Phân công ca',
    staffing_approval: 'Duyệt nhân sự', staffing_rejection: 'Từ chối nhân sự', swap_request: 'Yêu cầu PASS/đổi ca',
    swap_accepted: 'Đã nhận PASS/đổi ca', swap_rejected: 'Từ chối PASS/đổi ca', swap_approved: 'Duyệt PASS/đổi ca',
    report_submitted: 'Gửi báo cáo', report_reviewed: 'Duyệt báo cáo', import_completed: 'Import hoàn tất',
    import_warning: 'Cảnh báo import', import_failure: 'Import thất bại', system: 'Hệ thống',
  } : {
    account_request_submitted: 'Account request', registration_submitted: 'Shift registration', shift_assigned: 'Shift assigned',
    staffing_approval: 'Staffing approved', staffing_rejection: 'Staffing rejected', swap_request: 'PASS/swap request',
    swap_accepted: 'PASS/swap accepted', swap_rejected: 'PASS/swap rejected', swap_approved: 'PASS/swap approved',
    report_submitted: 'Report submitted', report_reviewed: 'Report reviewed', import_completed: 'Import completed',
    import_warning: 'Import warning', import_failure: 'Import failed', system: 'System',
  }
  return labels[type]
}

function notificationSeverityClass(severity: AppNotification['severity']) {
  if (severity === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (severity === 'error') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function notificationSeverityLabel(severity: AppNotification['severity'], language: 'en' | 'vi') {
  if (language === 'en') return severity
  return { success: 'Thành công', warning: 'Cảnh báo', error: 'Lỗi', info: 'Thông tin' }[severity]
}

function notificationCopy(item: AppNotification, language: 'en' | 'vi') {
  if (language === 'en') return { title: item.title, message: item.message }
  const titleByType: Partial<Record<AppNotification['type'], string>> = {
    account_request_submitted: 'Yêu cầu tài khoản mới', registration_submitted: 'Đăng ký ca đang chờ',
    shift_assigned: 'Đã phân công ca', staffing_approval: 'Đăng ký ca được duyệt',
    staffing_rejection: 'Đăng ký ca bị từ chối', swap_request: 'Yêu cầu PASS/đổi ca',
    swap_accepted: 'Đã nhận PASS/đổi ca', swap_rejected: 'PASS/đổi ca bị từ chối',
    swap_approved: 'PASS/đổi ca được duyệt', report_submitted: 'Báo cáo đã gửi',
    report_reviewed: 'Báo cáo đã được xem xét', import_completed: 'Import hoàn tất',
    import_warning: 'Cảnh báo import', import_failure: 'Import thất bại', system: 'Thông báo hệ thống',
  }
  const knownMessages: Record<string, string> = {
    'A staff member submitted a shift registration for review.': 'Nhân viên đã gửi đăng ký ca để xem xét.',
    'You were assigned to a shift.': 'Bạn đã được phân công một ca.',
    'Your shift registration was approved.': 'Đăng ký ca của bạn đã được duyệt.',
    'A swap request needs your response.': 'Yêu cầu PASS/đổi ca đang chờ bạn phản hồi.',
    'The swap request was accepted.': 'Yêu cầu PASS/đổi ca đã được chấp nhận.',
    'The swap request was rejected.': 'Yêu cầu PASS/đổi ca đã bị từ chối.',
    'Your swap request was completed.': 'Yêu cầu PASS/đổi ca của bạn đã hoàn tất.',
    'A report is ready for review.': 'Báo cáo đang chờ xem xét.',
    'Your report was approved.': 'Báo cáo của bạn đã được duyệt.',
    'Your report needs updates.': 'Báo cáo của bạn cần được bổ sung.',
    'Your schedule import completed.': 'Import lịch của bạn đã hoàn tất.',
    'Your shift registration was rejected.': 'Đăng ký ca của bạn đã bị từ chối.',
    'Your shift registration was submitted.': 'Đăng ký ca của bạn đã được gửi.',
    'A shift registration needs your review.': 'Có đăng ký ca đang chờ bạn xem xét.',
    'A staffing request was rejected.': 'Yêu cầu nhân sự đã bị từ chối.',
    'A staffing request was approved.': 'Yêu cầu nhân sự đã được duyệt.',
    'Your account request was received.': 'Yêu cầu tài khoản của bạn đã được tiếp nhận.',
    'Your account request was rejected.': 'Yêu cầu tài khoản của bạn đã bị từ chối.',
    'Your report was rejected.': 'Báo cáo của bạn đã bị từ chối.',
    'A report needs your review.': 'Có báo cáo đang chờ bạn xem xét.',
    'Your shift was cancelled.': 'Ca trực của bạn đã bị hủy.',
  }
  const knownTitles: Record<string, string> = {
    'registration approved': 'Đăng ký ca được duyệt',
    'registration rejected': 'Đăng ký ca bị từ chối',
    'registration submitted': 'Đăng ký ca mới',
    'shift assigned': 'Đã phân công ca',
    'report submitted': 'Báo cáo đã gửi',
    'report rejected': 'Báo cáo bị từ chối',
  }
  return { title: titleByType[item.type] ?? knownTitles[item.title.trim().toLocaleLowerCase('en-US')] ?? item.title, message: knownMessages[item.message] ?? item.message }
}

export default function NotificationsPage() {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const router = useRouter()
  const { t, language } = useTranslation()
  const { toast } = useToast()
  const [items,setItems] = React.useState<AppNotification[]>([])
  const [selectedId,setSelectedId] = React.useState<string | null>(null)
  const [tab,setTab] = React.useState<'all' | 'unread' | 'read'>('all')
  const [typeFilter,setTypeFilter] = React.useState<AppNotification['type'] | null>(null)
  const [query,setQuery] = React.useState('')
  const { page, pageSize, setPage, setPageSize, navigate } = useListPagination('notifications', 20)
  const [total, setTotal] = React.useState(0)
  const [counts, setCounts] = React.useState({ all: 0, unread: 0, read: 0 })
  const [loading,setLoading] = React.useState(true)
  const [error,setError] = React.useState<unknown>(null)
  const [busy,setBusy] = React.useState(false)
  const busyRef = React.useRef(false)
  const request = React.useRef(0)
  const load = React.useCallback(async () => {
    const sequence = ++request.current
    if (!currentUser) return
    try {
      const result = await notificationService.getPage({ page, pageSize, filters: { search: query, statuses: tab === 'all' ? [] : [tab], types: typeFilter ? [typeFilter] : [] } })
      const records = result.items
      if (sequence !== request.current) return
      // The header emits real realtime toasts; refresh data without replacing selected identity.
      setItems(records)
      setTotal(result.total)
      setCounts(result.counts)
      if (result.page !== page) navigate({ notifications_page: String(result.page) }, true)
      setSelectedId(id => id ?? records[0]?.id ?? null)
      setError(null)
    } catch (cause) {if (sequence === request.current) setError(cause)}
    finally {if (sequence === request.current) setLoading(false)}
  },[currentUser, navigate, page, pageSize, query, tab, typeFilter])

  const invalidatePending = React.useCallback(()=>{++request.current},[])
  React.useEffect(() => {
    const frame = requestAnimationFrame(()=>{setSelectedId(null);setItems([]);setLoading(true);void load()})
    const refresh = () => void load()
    const onChanged = (event:Event)=>{if(event instanceof CustomEvent && event.detail===currentUser?.id) refresh()}
    window.addEventListener('livestream-ops-notifications-changed',onChanged)
    const stopLocal = notificationService._subscribe(refresh)
    return () => {cancelAnimationFrame(frame);invalidatePending();window.removeEventListener('livestream-ops-notifications-changed',onChanged);stopLocal()}
  },[currentUser,load,invalidatePending])

  const markRead = async (id?: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      if (id) await notificationService.markRead(id)
      else await notificationService.markAllRead()
      window.dispatchEvent(new CustomEvent('livestream-ops-notification-read-changed',{detail:currentUser?.id}))
      await load()
    } catch {
      toast({title:t('error'),description:t('notificationUpdateFailed'),variant:'destructive'})
    } finally {busyRef.current=false;setBusy(false)}
  }
  const unread = counts.unread
  const filtered = items
  const typeOptions: AppNotification['type'][] = ['account_request_submitted', 'registration_submitted', 'shift_assigned', 'staffing_approval', 'staffing_rejection', 'swap_request', 'swap_accepted', 'swap_rejected', 'swap_approved', 'report_submitted', 'report_reviewed', 'import_completed', 'import_warning', 'import_failure', 'system']
  const safePage = page
  const pageItems = items
  const notificationGroups = pageItems.reduce((groups,item)=>{const day=format(new Date(item.created_at),'yyyy-MM-dd');groups.set(day,[...(groups.get(day)||[]),item]);return groups},new Map<string,AppNotification[]>())
  const selected = items.find(item => item.id === selectedId)
  const selectedCopy = selected ? notificationCopy(selected, language) : null
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  if (loading || userLoading) {
    return (
      <div className="ada-workspace-page min-w-0 space-y-3 p-4 md:p-6 animate-pulse" data-testid="notifications-loading-shell">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="h-6 w-36 rounded bg-slate-200" />
            <div className="h-3 w-48 rounded bg-slate-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-24 rounded bg-slate-200" />
            <div className="h-8 w-28 rounded bg-slate-200" />
          </div>
        </div>
        <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
          <div className="h-96 rounded-lg border border-slate-200 bg-white p-4" />
          <div className="h-96 rounded-lg border border-slate-200 bg-white p-4" />
        </div>
      </div>
    )
  }
  if (error && !items.length) return <div className="ada-workspace-page min-w-0 p-4"><PageLoadError error={error} onRetry={() => void load()} /></div>
  return <div className="ada-workspace-page min-w-0 space-y-3 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-lg font-semibold">{t('notificationsPageTitle')}</h1><p className="mt-1 text-xs text-muted-foreground">{counts.all} {t('all')} · {unread} {t('unread')}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="max-md:!h-11" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />{t('refresh')}</Button><Button variant="outline" size="sm" className="max-md:!h-11" disabled={!unread || busy} onClick={() => void markRead()}>{t('markAllRead')}</Button><Button variant="outline" size="sm" className="max-md:!h-11" onClick={() => router.push('/settings')}>{t('settings')}</Button></div></header>
    {error != null && <PageLoadError error={error} onRetry={() => void load()} />}
    <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-none"><div className="flex gap-3 border-b px-3">{(['all','unread','read'] as const).map(value => <button key={value} type="button" aria-pressed={tab===value} className={`py-2.5 text-xs ${tab===value?'border-b-2 border-primary font-semibold text-primary':'text-muted-foreground'}`} onClick={() => {setTab(value);setPage(1)}}>{value==='read' ? t('notificationReadStatus') : t(value)} ({counts[value]})</button>)}</div><div className="flex flex-wrap items-center gap-1.5 border-b px-2 py-2"><button type="button" onClick={() => {setTypeFilter(null);setPage(1)}} className={`rounded-full border px-2 py-1 text-[10px] ${!typeFilter?'border-primary bg-primary/5 text-primary':'border-slate-200 text-slate-500'}`}>{t('notificationAllTypes')}</button>{typeOptions.map(type => <button type="button" key={type} onClick={() => {setTypeFilter(type);setPage(1)}} className={`rounded-full border px-2 py-1 text-[10px] ${typeFilter===type?'border-primary bg-primary/5 text-primary':'border-slate-200 text-slate-500'}`}>{notificationTypeLabel(type, language)}</button>)}</div><div className="border-b p-2"><Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} /></div>
        <div className="max-h-[calc(100dvh-19rem)] min-h-48 divide-y overflow-y-auto overscroll-contain">{!filtered.length ? <p className="p-8 text-center text-sm text-muted-foreground">{items.length ? t('noMatchingNotifications') : t('noNotifications')}</p> : Array.from(notificationGroups,([day,group])=><div key={day}><h3 className="bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{new Date(day+'T00:00:00').toLocaleDateString(locale,{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</h3>{group.map(item=>{const copy=notificationCopy(item,language);return <button type="button" key={item.id} className={'flex w-full gap-2 border-l-4 p-2.5 text-left hover:bg-muted/30 '+(selectedId===item.id?'border-l-primary bg-primary/5':'border-l-transparent')} onClick={()=>setSelectedId(item.id)} aria-pressed={selectedId===item.id}><NotificationIcon item={item} className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className={'text-sm '+(!item.read_at?'font-semibold':'')}>{copy.title}</h2>{!item.read_at && <span aria-label={t('unread')} className="h-2 w-2 shrink-0 rounded-full bg-primary" />}</div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{copy.message}</p><div className="mt-1.5 flex flex-wrap items-center gap-1.5"><span className={`rounded border px-1.5 py-0.5 text-[10px] ${notificationSeverityClass(item.severity)}`}>{notificationSeverityLabel(item.severity,language)}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{notificationTypeLabel(item.type,language)}</span>{item.related_entity_id && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{item.related_entity_id}</span>}<span className="ml-auto text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString(locale)}</span></div></div></button>})}</div>)}</div>
        <HistoryPagination page={safePage} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </section>
      <section className="min-w-0 rounded-lg border bg-white p-4 xl:sticky xl:top-4">
        {selected && selectedCopy ? <>
          <div className="flex items-start gap-2">
            <NotificationIcon item={selected} className="h-4 w-4 shrink-0 text-primary" />
            <div><h2 className="text-sm font-semibold">{selectedCopy.title}</h2><p className="mt-1 text-[11px] text-muted-foreground">{new Date(selected.created_at).toLocaleString(locale)} · {selected.read_at ? t('notificationReadStatus') : t('unread')}</p></div>
          </div>
          <p className="my-4 whitespace-pre-wrap text-sm leading-relaxed">{selectedCopy.message}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t pt-3 text-xs">
            <dt className="text-muted-foreground">ID</dt><dd className="break-all">{selected.id}</dd>
            {selected.related_entity_id && <><dt className="text-muted-foreground">{t('notificationRelatedRecord')}</dt><dd>{selected.related_entity_id}</dd></>}
            {selected.read_at && <><dt className="text-muted-foreground">{t('notificationReadStatus')}</dt><dd>{new Date(selected.read_at).toLocaleString(locale)}</dd></>}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {!selected.read_at && <Button size="sm" disabled={busy} onClick={() => void markRead(selected.id)}>{t('markRead')}</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void (async () => { if (!selected.read_at) await markRead(selected.id); router.push(resolveNotificationDestination(selected)) })() }}>{t('viewDetails')}</Button>
          </div>
        </> : <p className="p-4 text-center text-sm text-muted-foreground">{t('notificationSelectPrompt')}</p>}
      </section>
    </div>
  </div>
}
