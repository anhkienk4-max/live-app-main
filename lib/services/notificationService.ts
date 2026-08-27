'use client'

import { getAuthMode } from '@/lib/auth/authMode'
import { currentUserService } from '@/lib/services/dataService'
import type { AppNotification } from '@/lib/types/database.types'
import {
  getSupabaseNotificationRepository,
  setSupabaseNotificationRepositoryForTests,
  type SupabaseNotificationRepository,
} from '@/lib/services/supabaseNotificationService'

let mockNotifications: AppNotification[] = []
let listeners: Array<() => void> = []
const notify = () => listeners.forEach(listener => listener())

function requireMockMode() {
  if (getAuthMode() !== 'mock') throw new Error('In-memory notifications are available only in explicit mock mode.')
}

function getMockNotifications() {
  requireMockMode()
  return mockNotifications
    .filter(notification => notification.user_id === currentUserService.getId())
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
}

export const notificationService = {
  async getAll(): Promise<AppNotification[]> {
    return this.getForCurrentUser()
  },

  async getForCurrentUser(): Promise<AppNotification[]> {
    if (getAuthMode() === 'supabase') return getSupabaseNotificationRepository().getForCurrentUser()
    return [...getMockNotifications()]
  },

  async getUnreadCount(): Promise<number> {
    const all = await this.getForCurrentUser()
    return all.filter(notification => !notification.read_at).length
  },

  async markRead(id: string): Promise<void> {
    if (getAuthMode() === 'supabase') {
      await getSupabaseNotificationRepository().markRead(id)
    } else {
      const userId = currentUserService.getId()
      mockNotifications = mockNotifications.map(notification =>
        notification.id === id && notification.user_id === userId
          ? { ...notification, read_at: notification.read_at || new Date().toISOString() }
          : notification,
      )
      notify()
    }
  },

  async markAllRead(): Promise<void> {
    if (getAuthMode() === 'supabase') {
      await getSupabaseNotificationRepository().markAllRead()
    } else {
      const userId = currentUserService.getId()
      const timestamp = new Date().toISOString()
      mockNotifications = mockNotifications.map(notification =>
        notification.user_id === userId && !notification.read_at
          ? { ...notification, read_at: timestamp }
          : notification,
      )
      notify()
    }
  },

  _create(notification: Omit<AppNotification, 'id' | 'created_at' | 'read_at'> & { id?: string }): AppNotification {
    requireMockMode()
    if (notification.event_key) {
      const existing = mockNotifications.find(item => item.event_key === notification.event_key)
      if (existing) return existing
    }
    const item: AppNotification = {
      id: notification.id || `${notification.event_key || 'notification'}-${mockNotifications.length + 1}`,
      read_at: null,
      created_at: new Date().toISOString(),
      ...notification,
    }
    mockNotifications = [item, ...mockNotifications]
    notify()
    return item
  },

  _subscribe(listener: () => void) {
    listeners.push(listener)
    return () => { listeners = listeners.filter(item => item !== listener) }
  },

  _subscribeRealtime(userId: string, onChange: () => void) {
    if (getAuthMode() !== 'supabase') return () => undefined
    return getSupabaseNotificationRepository().subscribe(userId, onChange)
  },

  _resetForTests() {
    mockNotifications = []
    listeners = []
    setSupabaseNotificationRepositoryForTests(undefined)
  },

  _setRepositoryForTests(repository: SupabaseNotificationRepository | undefined) {
    setSupabaseNotificationRepositoryForTests(repository)
  },
}

export type NotificationCreateInput = Omit<AppNotification, 'id' | 'created_at' | 'read_at'>
