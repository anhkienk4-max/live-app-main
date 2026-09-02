import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import type { AppNotification, NotificationSeverity, NotificationType } from '@/lib/types/database.types'

interface NotificationRow {
  id: string
  user_id: string | null
  recipient_id: string | null
  type: string
  notification_type: string | null
  severity: string | null
  title: string
  message: string
  related_entity_type: string | null
  related_entity_id: string | null
  action_url: string | null
  event_key: string | null
  read: boolean | null
  read_at: string | null
  created_at: string
}

interface SupabaseErrorShape {
  code?: string
  message?: string
}

function requestError(operation: string, error: SupabaseErrorShape): Error {
  return new Error(error.message?.trim() || `Supabase ${operation} failed.`)
}

const notificationTypes = new Set<NotificationType>([
  'account_request_submitted',
  'registration_submitted',
  'shift_assigned',
  'staffing_approval',
  'staffing_rejection',
  'swap_request',
  'swap_accepted',
  'swap_rejected',
  'swap_approved',
  'report_submitted',
  'report_reviewed',
  'import_completed',
  'import_warning',
  'import_failure',
  'system',
])

const severities = new Set<NotificationSeverity>(['info', 'success', 'warning', 'error'])

function mapLegacyType(type: string): NotificationType {
  if (type === 'shift') return 'shift_assigned'
  if (type === 'swap') return 'swap_request'
  if (type === 'report') return 'report_submitted'
  return 'system'
}

function notificationFromRow(row: NotificationRow): AppNotification {
  const type = row.notification_type && notificationTypes.has(row.notification_type as NotificationType)
    ? row.notification_type as NotificationType
    : mapLegacyType(row.type)
  const severity = row.severity && severities.has(row.severity as NotificationSeverity)
    ? row.severity as NotificationSeverity
    : 'info'
  return {
    id: row.id,
    type,
    title: row.title,
    message: row.message,
    severity,
    user_id: row.recipient_id || row.user_id || '',
    related_entity_type: row.related_entity_type ?? undefined,
    related_entity_id: row.related_entity_id ?? undefined,
    action_url: row.action_url?.startsWith('/') && !row.action_url.startsWith('//') ? row.action_url : undefined,
    event_key: row.event_key ?? undefined,
    read_at: row.read_at ?? (row.read ? row.created_at : null),
    created_at: row.created_at,
  }
}

export interface SupabaseNotificationRepository {
  getForCurrentUser(): Promise<AppNotification[]>
  markRead(id: string): Promise<void>
  markAllRead(): Promise<void>
  subscribe(userId: string, onChange: () => void): () => void
}

export function createSupabaseNotificationRepository(
  client: SupabaseClient,
): SupabaseNotificationRepository {
  let channel: RealtimeChannel | null = null
  let subscribedUserId: string | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const select = () => client
    .from('notifications')
    .select('id,user_id,recipient_id,type,notification_type,severity,title,message,related_entity_type,related_entity_id,action_url,event_key,read,read_at,created_at')

  const stopChannel = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    if (channel) void client.removeChannel(channel)
    channel = null
    subscribedUserId = null
  }

  return {
    async getForCurrentUser() {
      const result = await select().order('created_at', { ascending: false })
      if (result.error) throw requestError('notification read', result.error)
      return (result.data ?? []).map(row => notificationFromRow(row as unknown as NotificationRow))
    },

    async markRead(id) {
      const result = await client.rpc('mark_notification_read', {
        p_notification_id: id,
      })
      if (result.error) throw requestError('notification read-state update', result.error)
    },

    async markAllRead() {
      const result = await client.rpc('mark_all_notifications_read')
      if (result.error) throw requestError('notification bulk read-state update', result.error)
    },

    subscribe(userId, onChange) {
      if (subscribedUserId === userId && channel) return stopChannel
      stopChannel()
      subscribedUserId = userId
      const connect = () => {
        if (subscribedUserId !== userId) return
        channel = client
          .channel(`notifications:${userId}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${userId}`,
          }, onChange)
          .subscribe(status => {
            onChange()
            if (status !== 'SUBSCRIBED' && subscribedUserId === userId && !reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null
                if (channel) void client.removeChannel(channel)
                channel = null
                connect()
              }, 1000)
            }
          })
      }
      connect()
      return stopChannel
    },
  }
}

let browserRepository: SupabaseNotificationRepository | null = null
let testRepository: SupabaseNotificationRepository | undefined

export function getSupabaseNotificationRepository(): SupabaseNotificationRepository {
  if (testRepository) return testRepository
  if (!browserRepository) browserRepository = createSupabaseNotificationRepository(createClient())
  return browserRepository
}

export function setSupabaseNotificationRepositoryForTests(
  repository: SupabaseNotificationRepository | undefined,
): void {
  testRepository = repository
}
