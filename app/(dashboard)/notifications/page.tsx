'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { notificationService } from '@/lib/services/notificationService'
import type { AppNotification } from '@/lib/types/database.types'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import { resolveNotificationDestination } from '@/lib/services/notificationRoutes'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { PageShell, PageHeader, PageHeaderContent, PageActions } from '@/components/ui/archetypes'

export default function NotificationsPage() {
  const { currentUser } = useCurrentUser()
  const router = useRouter()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [items, setItems] = React.useState<AppNotification[]>([])
  const load = React.useCallback(async () => {
    if (!currentUser) { setItems([]); return }
    setItems(await notificationService.getForCurrentUser())
  }, [currentUser])
  const reportUpdateFailure = React.useCallback(() => {
    toast({ title: t('error'), description: t('notificationUpdateFailed'), variant: 'destructive' })
  }, [t, toast])
  const handleMarkRead = React.useCallback(async (id: string) => {
    try {
      await notificationService.markRead(id)
    } catch {
      reportUpdateFailure()
    }
    await load()
  }, [load, reportUpdateFailure])
  const handleMarkAllRead = React.useCallback(async () => {
    try {
      await notificationService.markAllRead()
    } catch {
      reportUpdateFailure()
    }
    await load()
  }, [load, reportUpdateFailure])
  React.useEffect(() => {
    let active = true
    let unsubscribeRealtime: () => void = () => undefined
    const refresh = async () => {
      try {
        await load()
      } catch {
        if (active) setItems([])
      }
    }
    void refresh()
    if (currentUser) unsubscribeRealtime = notificationService._subscribeRealtime(currentUser.id, () => void refresh())
    const unsubscribeMock = notificationService._subscribe(() => void refresh())
    return () => {
      active = false
      unsubscribeRealtime()
      unsubscribeMock()
    }
  }, [currentUser, load])
  return (
    <PageShell archetype="queue" className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <h1 className="text-2xl font-bold">Notifications</h1>
        </PageHeaderContent>
        <PageActions>
          <Button variant="outline" size="sm" onClick={()=> void handleMarkAllRead()}>Mark all read</Button>
        </PageActions>
      </PageHeader>
      <Card><CardContent className="divide-y p-0">
        {items.length===0 ? <div className="p-12 text-center text-muted-foreground">No notifications</div> : items.map(n=> (
          <div key={n.id} className={`flex justify-between p-4 ${n.read_at ? 'opacity-60' : ''}`}>
            <button type="button" className="text-left" onClick={() => { void (async () => { if (!n.read_at) await handleMarkRead(n.id); router.push(resolveNotificationDestination(n)) })() }}>
              <p className="text-sm font-medium">{n.title}</p><p className="text-xs text-muted-foreground">{n.message}</p><p className="text-xs text-muted-foreground">{format(new Date(n.created_at), 'PP p')}</p>
            </button>
            {!n.read_at && <Button size="sm" variant="ghost" onClick={()=> void handleMarkRead(n.id)}>Mark read</Button>}
          </div>
        ))}
      </CardContent></Card>
    </PageShell>
  )
}
