

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, User, Calendar, FileText, RefreshCw, CheckCircle, XCircle, Edit } from 'lucide-react'
import { format } from 'date-fns'

interface TimelineEvent {
  id: string
  type: 'shift_created' | 'shift_updated' | 'shift_completed' | 'report_submitted' | 'swap_requested' | 'swap_approved' | 'swap_rejected' | 'update_submitted'
  entity_id: string
  entity_type: 'shift' | 'report' | 'swap'
  user_name: string
  description: string
  timestamp: string
  metadata?: Record<string, any>
}

interface ActivityTimelineProps {
  entityType: 'shift' | 'report' | 'swap'
  entityId: string
}

export function ActivityTimeline({ entityType, entityId }: ActivityTimelineProps) {
  const [events, setEvents] = React.useState<TimelineEvent[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    // Mock timeline data - in production, fetch from API
    const mockEvents: TimelineEvent[] = [
      {
        id: '1',
        type: 'shift_created',
        entity_id: entityId,
        entity_type: 'shift',
        user_name: 'Admin User',
        description: 'Created shift',
        timestamp: new Date(Date.now() - 86400000 * 5).toISOString()
      },
      {
        id: '2',
        type: 'shift_updated',
        entity_id: entityId,
        entity_type: 'shift',
        user_name: 'Team Leader',
        description: 'Updated host assignment',
        timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
        metadata: { field: 'host_id', old: 'Sarah Johnson', new: 'Michael Chen' }
      },
      {
        id: '3',
        type: 'update_submitted',
        entity_id: entityId,
        entity_type: 'shift',
        user_name: 'Sarah Johnson',
        description: 'Submitted dashboard update',
        timestamp: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: '4',
        type: 'shift_completed',
        entity_id: entityId,
        entity_type: 'shift',
        user_name: 'System',
        description: 'Shift marked as completed',
        timestamp: new Date(Date.now() - 1800000).toISOString()
      },
      {
        id: '5',
        type: 'report_submitted',
        entity_id: entityId,
        entity_type: 'report',
        user_name: 'Sarah Johnson',
        description: 'Submitted final report',
        timestamp: new Date(Date.now() - 900000).toISOString()
      }
    ]
    setEvents(mockEvents)
    setLoading(false)
  }, [entityId])

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'shift_created':
        return <Calendar className="h-4 w-4 text-blue-600" />
      case 'shift_updated':
        return <Edit className="h-4 w-4 text-orange-600" />
      case 'shift_completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'report_submitted':
        return <FileText className="h-4 w-4 text-purple-600" />
      case 'swap_requested':
        return <RefreshCw className="h-4 w-4 text-yellow-600" />
      case 'swap_approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'swap_rejected':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'update_submitted':
        return <Clock className="h-4 w-4 text-blue-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case 'shift_created':
      case 'update_submitted':
        return 'bg-blue-100'
      case 'shift_updated':
        return 'bg-orange-100'
      case 'shift_completed':
      case 'swap_approved':
        return 'bg-green-100'
      case 'report_submitted':
        return 'bg-purple-100'
      case 'swap_requested':
        return 'bg-yellow-100'
      case 'swap_rejected':
        return 'bg-red-100'
      default:
        return 'bg-gray-100'
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading timeline...</div>
  }

  if (events.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center">
          <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <div className="text-gray-600">No activity recorded yet</div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
            
            <div className="space-y-6">
              {events.map((event, index) => (
                <div key={event.id} className="relative flex items-start gap-4">
                  {/* Icon */}
                  <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full ${getEventColor(event.type)}`}>
                    {getEventIcon(event.type)}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium">{event.description}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <User className="h-3 w-3 text-gray-500" />
                          <span className="text-sm text-gray-600">{event.user_name}</span>
                        </div>
                        {event.metadata && (
                          <div className="mt-2 text-xs bg-gray-50 p-2 rounded">
                            {event.metadata.field && (
                              <div>
                                <span className="font-medium">{event.metadata.field}:</span>
                                <span className="text-red-600 line-through ml-2">{event.metadata.old}</span>
                                <span className="mx-2">→</span>
                                <span className="text-green-600">{event.metadata.new}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {format(new Date(event.timestamp), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
