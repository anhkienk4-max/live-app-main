'use client'

import type { AccountStatus, User } from '@/lib/types/database.types'
import { recordAuditEvent } from '@/lib/services/auditService'
import { mockUsers } from '@/lib/services/mockData'

type StoredMockAccount = {
  user: User
  password_digest?: string
}

type AuthResult =
  | { ok: true; user: User; status: AccountStatus }
  | { ok: false; code: 'duplicate_email' | 'invalid_credentials'; status?: AccountStatus }

const storageKey = 'livestream-ops-mock-auth-accounts'

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const readAccounts = (): StoredMockAccount[] => {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || '[]') as StoredMockAccount[]
  } catch {
    return []
  }
}

const writeAccounts = (accounts: StoredMockAccount[]) => {
  window.localStorage.setItem(storageKey, JSON.stringify(accounts))
}

const digest = async (value: string) => {
  const bytes = new TextEncoder().encode(value)
  const hash = await window.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

const auditActor = (user?: User, email?: string): Pick<User, 'id' | 'full_name' | 'role' | 'system_permission'> =>
  user || {
    id: `anonymous-${normalizeEmail(email || 'unknown')}`,
    full_name: normalizeEmail(email || 'Unknown user'),
    role: 'staff',
    system_permission: 'member',
  }

const recordAuthAudit = (
  action: 'account_registered' | 'email_verified' | 'login_success' | 'login_failed',
  actor: ReturnType<typeof auditActor>,
  after?: Record<string, unknown>,
) => {
  recordAuditEvent({
    actor,
    module: 'staff',
    action,
    entity_type: 'account',
    entity_id: actor.id,
    entity_name: actor.full_name,
    source: 'system',
    status: action === 'login_failed' ? 'failed' : 'success',
    after,
  })
}

export const mockAuthService = {
  async registerEmail({
    fullName,
    email,
    password,
  }: {
    fullName: string
    email: string
    password: string
  }): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email)
    const accounts = readAccounts()
    if (accounts.some(account => account.user.email.toLowerCase() === normalizedEmail) ||
      mockUsers.some(user => user.email.toLowerCase() === normalizedEmail)) {
      return { ok: false, code: 'duplicate_email' }
    }
    const now = new Date().toISOString()
    const user: User = {
      id: `self-${crypto.randomUUID()}`,
      email: normalizedEmail,
      full_name: fullName.trim(),
      role: 'staff',
      system_permission: 'member',
      operational_roles: [],
      status: 'inactive',
      account_status: 'pending_email_verification',
      email_verified: false,
      auth_provider: 'email',
      join_date: now.slice(0, 10),
      created_at: now,
      updated_at: now,
    }
    accounts.push({ user, password_digest: await digest(password) })
    writeAccounts(accounts)
    recordAuthAudit('account_registered', auditActor(user), {
      email: user.email,
      role: user.system_permission,
      account_status: user.account_status,
      email_verified: false,
      auth_provider: 'email',
    })
    return { ok: true, user, status: 'pending_email_verification' }
  },

  async signInEmail(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email)
    const stored = readAccounts().find(account => account.user.email.toLowerCase() === normalizedEmail)
    if (stored) {
      const matches = stored.password_digest === await digest(password)
      if (!matches) {
        recordAuthAudit('login_failed', auditActor(stored.user), { reason: 'invalid_credentials' })
        return { ok: false, code: 'invalid_credentials' }
      }
      const status = stored.user.account_status || 'pending_approval'
      if (status !== 'active') return { ok: false, code: 'invalid_credentials', status }
      recordAuthAudit('login_success', auditActor(stored.user), { provider: 'email' })
      return { ok: true, user: stored.user, status }
    }

    const seeded = mockUsers.find(user => user.email.toLowerCase() === normalizedEmail)
    if (!seeded || !password) {
      recordAuthAudit('login_failed', auditActor(undefined, email), { reason: 'invalid_credentials' })
      return { ok: false, code: 'invalid_credentials' }
    }
    recordAuthAudit('login_success', auditActor(seeded), { provider: 'email', mock_seed: true })
    return { ok: true, user: seeded, status: 'active' }
  },

  async signInWithGoogle(email?: string): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email && email.includes('@') ? email : 'google.user@example.com')
    const accounts = readAccounts()
    const existing = accounts.find(account => account.user.email.toLowerCase() === normalizedEmail)
    if (existing) {
      const status = existing.user.account_status || 'pending_approval'
      if (status === 'active') recordAuthAudit('login_success', auditActor(existing.user), { provider: 'google' })
      return status === 'active'
        ? { ok: true, user: existing.user, status }
        : { ok: false, code: 'invalid_credentials', status }
    }

    const seeded = mockUsers.find(user => user.email.toLowerCase() === normalizedEmail)
    if (seeded) {
      recordAuthAudit('login_success', auditActor(seeded), { provider: 'google', mock_seed: true })
      return { ok: true, user: seeded, status: 'active' }
    }

    const now = new Date().toISOString()
    const user: User = {
      id: `google-${crypto.randomUUID()}`,
      email: normalizedEmail,
      full_name: normalizedEmail.split('@')[0].replace(/[._-]+/g, ' '),
      role: 'staff',
      system_permission: 'member',
      operational_roles: [],
      status: 'inactive',
      account_status: 'pending_approval',
      email_verified: true,
      auth_provider: 'google',
      join_date: now.slice(0, 10),
      created_at: now,
      updated_at: now,
    }
    accounts.push({ user })
    writeAccounts(accounts)
    recordAuthAudit('account_registered', auditActor(user), {
      email: user.email,
      role: user.system_permission,
      account_status: user.account_status,
      email_verified: true,
      auth_provider: 'google',
    })
    recordAuthAudit('email_verified', auditActor(user), { provider: 'google' })
    return { ok: false, code: 'invalid_credentials', status: 'pending_approval' }
  },
}
