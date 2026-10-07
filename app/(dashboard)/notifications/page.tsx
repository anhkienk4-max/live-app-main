'use client'

import * as React from 'react'
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

export default function NotificationsPage() {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const router = useRouter()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [items,setItems] = React.useState<AppNotification[]>([])
  const [selectedId,setSelectedId] = React.useState<string | null>(null)
  const [tab,setTab] = React.useState<'all' | 'unread' | 'read'>('all')
  const [query,setQuery] = React.useState('')
  const [page,setPage] = React.useState(1)
  const [pageSize,setPageSize] = React.useState(10)
  const [loading,setLoading] = React.useState(true)
  const [error,setError] = React.useState<unknown>(null)
  const [busy,setBusy] = React.useState(false)
  const busyRef = React.useRef(false)
  const request = React.useRef(0)
  const load = React.useCallback(async () => {
    const sequence = ++request.current
    if (!currentUser) return
    try {
      const records = await notificationService.getForCurrentUser()
      if (sequence !== request.current) return
      // The header emits real realtime toasts; refresh data without replacing selected identity.
      setItems(records)
      setSelectedId(id => id ?? records[0]?.id ?? null)
      setError(null)
    } catch (cause) {if (sequence === request.current) setError(cause)}
    finally {if (sequence === request.current) setLoading(false)}
  },[currentUser])

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
  const unread = items.filter(item => !item.read_at).length
  const counts = {all:items.length,unread,read:items.length-unread}
  const filtered = items.filter(item => (tab === 'all' || (tab === 'read' ? Boolean(item.read_at) : !item.read_at)) && `${item.title} ${item.message} ${item.related_entity_id || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const safePage = Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))
  const pageItems = filtered.slice((safePage-1)*pageSize,safePage*pageSize)
  const notificationGroups = pageItems.reduce((groups,item)=>{const day=format(new Date(item.created_at),'yyyy-MM-dd');groups.set(day,[...(groups.get(day)||[]),item]);return groups},new Map<string,AppNotification[]>())
  const selected = items.find(item => item.id === selectedId)
  if (loading || userLoading) return <div role="status" className="p-12 text-center">{t('loading')}</div>
  if (error && !items.length) return <PageLoadError error={error} onRetry={() => void load()} />
  return <div className="space-y-3 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-lg font-semibold">Thông báo</h1><p className="mt-1 text-xs text-muted-foreground">{items.length} {t('all')} · {unread} {t('unread')}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />{t('refresh')}</Button><Button variant="outline" size="sm" disabled={!unread || busy} onClick={() => void markRead()}>{t('markAllRead')}</Button><Button variant="outline" size="sm" onClick={() => router.push('/settings')}>{t('settings')}</Button></div></header>
    {error != null && <PageLoadError error={error} onRetry={() => void load()} />}
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
      <section className="min-w-0 overflow-hidden rounded-lg border bg-white"><div className="flex gap-3 border-b px-3">{(['all','unread','read'] as const).map(value => <button key={value} type="button" aria-pressed={tab===value} className={`py-2.5 text-xs ${tab===value?'border-b-2 border-primary font-semibold text-primary':'text-muted-foreground'}`} onClick={() => {setTab(value);setPage(1)}}>{value==='read' ? 'Đã đọc' : t(value)} ({counts[value]})</button>)}</div><div className="border-b p-2"><Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} /></div>
        <div className="divide-y">{!filtered.length ? <p className="p-8 text-center text-sm text-muted-foreground">{items.length ? t('noMatchingNotifications') : t('noNotifications')}</p> : Array.from(notificationGroups,([day,group])=><div key={day}><h3 className="sticky top-0 z-[1] bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{format(new Date(day+'T00:00:00'),'PPP')}</h3>{group.map(item=><button type="button" key={item.id} className={'flex w-full gap-2 border-l-4 p-2.5 text-left hover:bg-muted/30 '+(selectedId===item.id?'border-l-primary bg-primary/5':'border-l-transparent')} onClick={()=>setSelectedId(item.id)} aria-pressed={selectedId===item.id}><NotificationIcon item={item} className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className={'text-sm '+(!item.read_at?'font-semibold':'')}>{item.title}</h2>{!item.read_at && <span aria-label={t('unread')} className="h-2 w-2 shrink-0 rounded-full bg-primary" />}</div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.message}</p><p className="mt-1.5 text-[11px] text-muted-foreground">{format(new Date(item.created_at),'dd/MM/yyyy HH:mm')}</p></div></button>)}</div>)}</div>
        <HistoryPagination page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1)}} />
      </section>
      <section className="min-w-0 rounded-lg border bg-white p-3">{selected ? <><div className="flex items-start gap-2"><NotificationIcon item={selected} className="h-4 w-4 shrink-0 text-primary" /><div><h2 className="text-sm font-semibold">{selected.title}</h2><p className="mt-1 text-[11px] text-muted-foreground">{format(new Date(selected.created_at),'dd/MM/yyyy HH:mm')} · {selected.read_at ? 'Đã đọc' : t('unread')}</p></div></div><p className="my-4 whitespace-pre-wrap text-sm leading-relaxed">{selected.message}</p><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t pt-3 text-xs"><dt className="text-muted-foreground">ID</dt><dd className="break-all">{selected.id}</dd>{selected.related_entity_id && <><dt className="text-muted-foreground">Bản ghi liên quan</dt><dd>{selected.related_entity_id}</dd></>}{selected.read_at && <><dt className="text-muted-foreground">Đã đọc</dt><dd>{format(new Date(selected.read_at),'dd/MM/yyyy HH:mm')}</dd></>}</dl><div className="mt-4 flex flex-wrap gap-2">{!selected.read_at && <Button size="sm" disabled={busy} onClick={() => void markRead(selected.id)}>{t('markRead')}</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={() => {void (async()=>{if (!selected.read_at) await markRead(selected.id);router.push(resolveNotificationDestination(selected))})()}}>{t('viewDetails')}</Button></div></> : <p className="p-4 text-center text-sm text-muted-foreground">Chọn thông báo để xem chi tiết.</p>}</section>
    </div>
  </div>
}
