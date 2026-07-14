

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Bell, X, Clock, AlertCircle, CheckCircle, RefreshCw, Eye } from 'lucide-react'
import { format } from 'date-fns'

interface Notification {
  id: string
  type: 'shift_reminder' | 'update_late' | 'swap_pending' | 'report_pending' | 'info'
  title: string
  message: string
  timestamp: string
  read: boolean
  actionUrl?: string
  priority: 'low' | 'medium' | 'high'
}

export function NotificationCenter() {
  const [open, setOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<Notification[]>([])

  React.useEffect(() => {
    // Mock notifications - in production, fetch from API
    const mockNotifications: Notification[] = [
      {
        id: '1',
        type: 'shift_reminder',
        title: 'Upcoming Shift',
        message: 'Your shift at TechGear Pro starts in 30 minutes',
        timestamp: new Date(Date.now() + 1800000).toISOString(),
        read: false,
        priority: 'high'
      },
      {
        id: '2',
        type: 'update_late',
        title: 'Dashboard Update Overdue',
        message: 'Dashboard update for Fashion Nova live session is 15 minutes late',
        timestamp: new Date(Date.now() - 900000).toISOString(),
        read: false,
        priority: 'high'
      },
      {
        id: '3',
        type: 'swap_pending',
        title: 'Swap Request Needs Approval',
        message: 'Sarah Johnson requested to swap shift on Dec 15',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: false,
        priority: 'medium'
      },
      {
        id: '4',
        type: 'report_pending',
        title: 'Report Submission Due',
        message: '3 completed shifts are awaiting final reports',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        read: true,
        priority: 'medium'
      },
      {
        id: '5',
        type: 'info',
        title: 'New Campaign Created',
        message: 'Summer Sale 2024 campaign has been added',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        read: true,
        priority: 'low'
      }
    ]
    setNotifications(mockNotifications)
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'shift_reminder':
        return <Clock className="h-4 w-4 text-blue-600" />
      case 'update_late':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case 'swap_pending':
        return <RefreshCw className="h-4 w-4 text-yellow-600" />
      case 'report_pending':
        return <AlertCircle className="h-4 w-4 text-orange-600" />
      default:
        return <Bell className="h-4 w-4 text-gray-600" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-500 bg-red-50'
      case 'medium':
        return 'border-l-yellow-500 bg-yellow-50'
      case 'low':
        return 'border-l-blue-500 bg-blue-50'
      default:
        return 'border-l-gray-500 bg-gray-50'
    }
  }

  return (
    <div className="relative">
      {/* Bell Button */}
      <Button
        variant="outline"
        size="icon"
        className="relative"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </Button>

      {/* Notification Panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>
          <Card className="absolute right-0 top-12 w-96 max-h-[600px] overflow-hidden shadow-xl z-50">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Notifications</h3>
                <p className="text-xs text-gray-600">{unreadCount} unread</p>
              </div>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={markAllAsRead}>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Mark all read
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[500px]">
              {notifications.length === 0 ? (
                <div className="p-12 text-center">
                  <Bell className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-600">No notifications</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 transition-colors border-l-4 ${
                        notification.read ? 'opacity-60' : ''
                      } ${getPriorityColor(notification.priority)}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{getNotificationIcon(notification.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-sm">{notification.title}</div>
                            {!notification.read && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1"></div>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {format(new Date(notification.timestamp), 'MMM d, h:mm a')}
                            </span>
                            <div className="flex gap-1">
                              {!notification.read && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => markAsRead(notification.id)}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  Mark read
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => deleteNotification(notification.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
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
