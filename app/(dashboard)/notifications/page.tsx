'use client'
import * as React from 'react'
import { notificationService } from '@/lib/services/notificationService'
import type { AppNotification } from '@/lib/types/database.types'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

export default function NotificationsPage() {
  const { currentUser } = useCurrentUser()
  const [items, setItems] = React.useState<AppNotification[]>([])
  const load = React.useCallback(async ()=> { if(!currentUser) return; setItems(await notificationService.getForCurrentUser()) }, [currentUser])
  React.useEffect(()=> { void load(); const u = notificationService._subscribe(load); return u }, [load])
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Notifications</h1><Button variant="outline" size="sm" onClick={()=> void notificationService.markAllRead().then(load)}>Mark all read</Button></div>
      <Card><CardContent className="divide-y p-0">
        {items.length===0 ? <div className="p-12 text-center text-muted-foreground">No notifications</div> : items.map(n=> (
          <div key={n.id} className={`p-4 flex justify-between ${n.read_at ? 'opacity-60' : ''}`}>
            <div><p className="font-medium text-sm">{n.title}</p><p className="text-xs text-muted-foreground">{n.message}</p><p className="text-xs text-muted-foreground">{format(new Date(n.created_at), 'PP p')}</p></div>
            {!n.read_at && <Button size="sm" variant="ghost" onClick={()=> void notificationService.markRead(n.id).then(load)}>Mark read</Button>}
          </div>
        ))}
      </CardContent></Card>
    </div>
  )
}
