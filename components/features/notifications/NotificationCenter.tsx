'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Bell, X, Clock, AlertCircle, CheckCircle, RefreshCw, Eye } from 'lucide-react'
import { format } from 'date-fns'
import { notificationService } from '@/lib/services/notificationService'
import type { AppNotification } from '@/lib/types/database.types'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'

export function NotificationCenter() {
  const [open, setOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<AppNotification[]>([])
  const router = useRouter()
  const { currentUser } = useCurrentUser()

  const load = React.useCallback(async () => {
    if (!currentUser) { setNotifications([]); return }
    const items = await notificationService.getForCurrentUser()
    setNotifications(items)
  }, [currentUser])

  React.useEffect(() => {
    let active = true
    let unsubscribeRealtime: () => void = () => undefined
    const refresh = async () => {
      try {
        await load()
      } catch {
        if (active) setNotifications([])
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
  React.useEffect(() => { if (open) void load() }, [open, load])

  const unreadCount = notifications.filter(n => !n.read_at).length

  const markAsRead = async (id: string) => { await notificationService.markRead(id); await load() }
  const markAllAsRead = async () => { await notificationService.markAllRead(); await load() }
  const handleClick = async (n: AppNotification) => {
    if (!n.read_at) await notificationService.markRead(n.id)
    if (n.action_url) router.push(n.action_url)
    setOpen(false)
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'shift_assigned': return <Clock className="h-4 w-4 text-blue-600" />
      case 'import_warning':
      case 'import_failure': return <AlertCircle className="h-4 w-4 text-red-600" />
      case 'swap_request':
      case 'swap_accepted':
      case 'swap_rejected': return <RefreshCw className="h-4 w-4 text-yellow-600" />
      case 'report_submitted':
      case 'report_reviewed': return <AlertCircle className="h-4 w-4 text-orange-600" />
      default: return <Bell className="h-4 w-4 text-gray-600" />
    }
  }
  const getPriorityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'border-l-red-500 bg-red-50'
      case 'warning': return 'border-l-yellow-500 bg-yellow-50'
      case 'success': return 'border-l-green-500 bg-green-50'
      case 'info':
      default: return 'border-l-blue-500 bg-blue-50'
    }
  }

  return (
    <div className="relative">
      <Button variant="outline" size="icon" className="relative" onClick={() => setOpen(!open)} aria-label="Notifications" aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <Card className="absolute right-0 top-12 w-96 max-h-[600px] overflow-hidden shadow-xl z-50">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div><h3 className="font-semibold">Notifications</h3><p className="text-xs text-gray-600">{unreadCount} unread</p></div>
              <div className="flex gap-2">
                {unreadCount > 0 && <Button size="sm" variant="ghost" onClick={markAllAsRead}><CheckCircle className="h-4 w-4 mr-1" />Mark all read</Button>}
                <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[500px]">
              {notifications.length === 0 ? (
                <div className="p-12 text-center"><Bell className="h-12 w-12 mx-auto mb-3 text-gray-400" /><p className="text-gray-600">No notifications</p></div>
              ) : (
                <div className="divide-y">
                  {notifications.slice(0,20).map(n => (
                    <div key={n.id} onClick={()=> void handleClick(n)} className={`p-4 hover:bg-gray-50 transition-colors border-l-4 cursor-pointer ${n.read_at ? 'opacity-60' : ''} ${getPriorityColor(n.severity)}`}>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{getIcon(n.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-sm truncate">{n.title}</div>
                            {!n.read_at && <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />}
                          </div>
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{n.message}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">{format(new Date(n.created_at), 'MMM d, h:mm a')}</span>
                            <div className="flex gap-1">
                              {!n.read_at && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={e=> { e.stopPropagation(); void markAsRead(n.id)}}><Eye className="h-3 w-3 mr-1" />Mark read</Button>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
