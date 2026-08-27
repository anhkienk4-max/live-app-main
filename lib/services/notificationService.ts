'use client'
import type { AppNotification, NotificationSeverity, NotificationType } from '@/lib/types/database.types'
import { currentUserService } from '@/lib/services/dataService'

let notifications: AppNotification[] = []
let listeners: Array<() => void> = []
const notify = () => listeners.forEach(l => l())

function seedForUser(userId: string): AppNotification[] {
  const now = Date.now()
  return [
    {
      id: 'seed-shift-assigned',
      type: 'shift_assigned',
      title: 'Shift assigned',
      message: 'You have been assigned to a shift',
      severity: 'info',
      user_id: userId,
      related_entity_type: 'shift',
      related_entity_id: 's1',
      action_url: '/calendar',
      read_at: null,
      created_at: new Date(now - 1000 * 60 * 30).toISOString(),
    },
    {
      id: 'seed-swap-request',
      type: 'swap_request',
      title: 'Swap request',
      message: 'A swap request awaits review',
      severity: 'warning',
      user_id: userId,
      related_entity_type: 'swap_request',
      related_entity_id: 'sw1',
      action_url: '/swaps',
      read_at: null,
      created_at: new Date(now - 1000 * 60 * 60).toISOString(),
    },
  ]
}

function ensureSeed(userId: string) {
  if (notifications.some(n => n.user_id === userId)) return
  notifications = [...seedForUser(userId), ...notifications]
}

export const notificationService = {
  async getAll(): Promise<AppNotification[]> {
    const userId = currentUserService.getId()
    ensureSeed(userId)
    return [...notifications].filter(n => n.user_id === userId).sort((a,b)=> b.created_at.localeCompare(a.created_at))
  },
  async getForCurrentUser(): Promise<AppNotification[]> {
    return this.getAll()
  },
  async getUnreadCount(): Promise<number> {
    const all = await this.getAll()
    return all.filter(n => !n.read_at).length
  },
  async markRead(id: string): Promise<void> {
    const userId = currentUserService.getId()
    notifications = notifications.map(n => n.id === id && n.user_id === userId ? { ...n, read_at: new Date().toISOString() } : n)
    notify()
  },
  async markAllRead(): Promise<void> {
    const userId = currentUserService.getId()
    notifications = notifications.map(n => n.user_id === userId && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)
    notify()
  },
  // internal helpers for event adapter (not exposed as public API)
  _create(notification: Omit<AppNotification,'id'|'created_at'|'read_at'> & { id?: string }): AppNotification {
    const item: AppNotification = {
      id: notification.id || Math.random().toString(36).slice(2,9),
      read_at: null,
      created_at: new Date().toISOString(),
      ...notification,
    }
    notifications.unshift(item)
    notify()
    return item
  },
  _subscribe(fn: () => void) {
    listeners.push(fn)
    return () => { listeners = listeners.filter(l => l !== fn) }
  },
  _resetForTests() {
    notifications = []
    listeners = []
  }
}

export type NotificationCreateInput = Omit<AppNotification,'id'|'created_at'|'read_at'>
