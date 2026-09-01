import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SystemPermission, User } from '@/lib/types/database.types'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { createSupabaseMasterDataRepository } from '@/lib/services/supabaseMasterDataService'

const systemPermissions = new Set<SystemPermission>(['admin', 'leader', 'member'])

export type AccountProvisioningMode = 'provision' | 'link'

export type AccountProvisioningErrorCode =
  | 'ACCOUNT_PROVISIONING_INVALID_REQUEST'
  | 'ACCOUNT_ROLE_MISSING'
  | 'ACCOUNT_ROLE_INVALID'
  | 'ACCOUNT_STAFF_NOT_FOUND'
  | 'ACCOUNT_STAFF_ARCHIVED'
  | 'ACCOUNT_STAFF_INACTIVE'
  | 'ACCOUNT_STAFF_ALREADY_LINKED'
  | 'ACCOUNT_AUTH_USER_NOT_FOUND'
  | 'ACCOUNT_AUTH_USER_ALREADY_LINKED'
  | 'ACCOUNT_AUTH_EMAIL_MISMATCH'
  | 'ACCOUNT_EMAIL_ALREADY_EXISTS'
  | 'ACCOUNT_EMAIL_AMBIGUOUS'
  | 'ACCOUNT_AUTH_PROVIDER_UNAVAILABLE'
  | 'ACCOUNT_INVITE_FAILED'
  | 'ACCOUNT_LINK_FAILED'

export class AccountProvisioningError extends Error {
  constructor(
    public readonly code: AccountProvisioningErrorCode,
    message = code,
  ) {
    super(message)
    this.name = 'AccountProvisioningError'
  }
}

export interface ProvisioningAuthUser {
  id: string
  email?: string
  appMetadata?: {
    business_user_id?: unknown
    system_permission?: unknown
  }
}

export interface ProvisioningAuthGateway {
  findUsersByEmail(email: string): Promise<ProvisioningAuthUser[]>
  getUserById(authUserId: string): Promise<ProvisioningAuthUser | null>
  inviteUserByEmail(email: string, redirectTo: string): Promise<ProvisioningAuthUser>
  deleteUser(authUserId: string): Promise<void>
}

export interface ProvisioningStaffGateway {
  getById(staffId: string): Promise<User | null>
  linkAuthUser(input: {
    staffId: string
    authUserId: string
    systemPermission: SystemPermission
    mode: AccountProvisioningMode
  }): Promise<User>
}

export interface AccountProvisioningDependencies {
  auth?: ProvisioningAuthGateway
  staff?: ProvisioningStaffGateway
}

export interface AccountProvisioningService {
  provisionExistingStaff(input: {
    staffId: string
    email: string
    initialRole: SystemPermission
    redirectTo: string
  }): Promise<User>
  linkExistingAuthUser(input: {
    staffId: string
    authUserId: string
    initialRole?: SystemPermission
  }): Promise<User>
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function appMetadataOf(value: unknown): ProvisioningAuthUser['appMetadata'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const metadata = value as Record<string, unknown>
  return {
    business_user_id: metadata.business_user_id,
    system_permission: metadata.system_permission,
  }
}

function providerError(code: AccountProvisioningErrorCode): AccountProvisioningError {
  return new AccountProvisioningError(code)
}

function isSystemPermission(value: unknown): value is SystemPermission {
  return typeof value === 'string' && systemPermissions.has(value as SystemPermission)
}

function roleFor(staff: User, requested?: SystemPermission): SystemPermission {
  const value = requested ?? staff.system_permission
  if (value === undefined) throw providerError('ACCOUNT_ROLE_MISSING')
  if (!isSystemPermission(value)) throw providerError('ACCOUNT_ROLE_INVALID')
  return value
}

function assertStaffCanBeProvisioned(staff: User | null, staffId: string): User {
  if (!staff) throw providerError('ACCOUNT_STAFF_NOT_FOUND')
  if (staff.id !== staffId) throw providerError('ACCOUNT_STAFF_NOT_FOUND')
  if (staff.archived_at || staff.deleted_at) throw providerError('ACCOUNT_STAFF_ARCHIVED')
  if (staff.auth_user_id) throw providerError('ACCOUNT_STAFF_ALREADY_LINKED')
  if (staff.status !== 'active' || staff.account_status === 'rejected') throw providerError('ACCOUNT_STAFF_INACTIVE')
  if (!normalizeEmail(staff.email)) throw providerError('ACCOUNT_PROVISIONING_INVALID_REQUEST')
  return staff
}

function normalizedAuthUser(user: ProvisioningAuthUser | null | undefined) {
  return user?.email ? normalizeEmail(user.email) : ''
}

function isAccountProvisioningError(error: unknown): error is AccountProvisioningError {
  return error instanceof AccountProvisioningError
}

function normalizeGatewayError(error: unknown, fallback: AccountProvisioningErrorCode) {
  return isAccountProvisioningError(error) ? error : new AccountProvisioningError(fallback)
}

function createDefaultAuthGateway(): ProvisioningAuthGateway {
  const admin = createSupabaseAdminClient()
  return {
    async findUsersByEmail(email) {
      const matches: ProvisioningAuthUser[] = []
      const perPage = 1000
      for (let page = 1; page <= 10; page += 1) {
        const result = await admin.auth.admin.listUsers({ page, perPage })
        if (result.error) throw new AccountProvisioningError('ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
        for (const user of result.data.users) {
          if (user.email && normalizeEmail(user.email) === email) {
            matches.push({ id: user.id, email: user.email, appMetadata: appMetadataOf(user.app_metadata) })
          }
        }
        if (result.data.users.length < perPage) break
        if (page === 10) throw new AccountProvisioningError('ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
      }
      return matches
    },
    async getUserById(authUserId) {
      const result = await admin.auth.admin.getUserById(authUserId)
      if (result.error) {
        if (result.error.status === 404 || result.error.code === 'user_not_found') return null
        throw new AccountProvisioningError('ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
      }
      const user = result.data.user
      return user ? { id: user.id, email: user.email, appMetadata: appMetadataOf(user.app_metadata) } : null
    },
    async inviteUserByEmail(email, redirectTo) {
      const result = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
      if (result.error || !result.data.user) throw new AccountProvisioningError('ACCOUNT_INVITE_FAILED')
      return {
        id: result.data.user.id,
        email: result.data.user.email,
        appMetadata: appMetadataOf(result.data.user.app_metadata),
      }
    },
    async deleteUser(authUserId) {
      await admin.auth.admin.deleteUser(authUserId, true)
    },
  }
}

function createDefaultStaffGateway(): ProvisioningStaffGateway {
  let client: SupabaseClient | undefined
  async function dataClient() {
    if (!client) {
      const { createClient } = await import('@/lib/supabase/server')
      client = await createClient()
    }
    return client
  }

  return {
    async getById(staffId) {
      const repository = createSupabaseMasterDataRepository(await dataClient())
      return repository.businessUsers.getById(staffId)
    },
    async linkAuthUser(input) {
      const currentClient = await dataClient()
      const result = await currentClient.rpc('link_staff_auth_user', {
        p_staff_id: input.staffId,
        p_auth_user_id: input.authUserId,
        p_system_permission: input.systemPermission,
        p_mode: input.mode,
      }).maybeSingle()
      if (result.error) throw new AccountProvisioningError('ACCOUNT_LINK_FAILED')
      const linked = await createSupabaseMasterDataRepository(currentClient).businessUsers.getById(input.staffId)
      if (!linked) throw new AccountProvisioningError('ACCOUNT_LINK_FAILED')
      return linked
    },
  }
}

export function createAccountProvisioningService(
  dependencies: AccountProvisioningDependencies = {},
): AccountProvisioningService {
  let auth: ProvisioningAuthGateway | undefined = dependencies.auth
  const authGateway = () => auth ||= createDefaultAuthGateway()
  const staffGateway = dependencies.staff || createDefaultStaffGateway()

  async function loadStaff(staffId: string) {
    if (!staffId.trim()) throw providerError('ACCOUNT_PROVISIONING_INVALID_REQUEST')
    return assertStaffCanBeProvisioned(await staffGateway.getById(staffId), staffId)
  }

  return {
    async provisionExistingStaff(input) {
      if (!input || !input.email || !input.redirectTo) throw providerError('ACCOUNT_PROVISIONING_INVALID_REQUEST')
      const staff = await loadStaff(input.staffId)
      const email = normalizeEmail(input.email)
      if (email !== normalizeEmail(staff.email)) throw providerError('ACCOUNT_AUTH_EMAIL_MISMATCH')
      const systemPermission = roleFor(staff, input.initialRole)

      let matches: ProvisioningAuthUser[]
      try {
        matches = await authGateway().findUsersByEmail(email)
      } catch (error) {
        throw normalizeGatewayError(error, 'ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
      }
      if (matches.length > 1) throw providerError('ACCOUNT_EMAIL_AMBIGUOUS')
      if (matches.length === 1) throw providerError('ACCOUNT_EMAIL_ALREADY_EXISTS')

      let invited: ProvisioningAuthUser
      try {
        invited = await authGateway().inviteUserByEmail(email, input.redirectTo)
      } catch (error) {
        throw normalizeGatewayError(error, 'ACCOUNT_INVITE_FAILED')
      }
      try {
        return await staffGateway.linkAuthUser({
          staffId: staff.id,
          authUserId: invited.id,
          systemPermission,
          mode: 'provision',
        })
      } catch (error) {
        try {
          await authGateway().deleteUser(invited.id)
        } catch {
          // The link failed closed; cleanup is best effort and never replaces
          // the stable application error returned to the caller.
        }
        throw normalizeGatewayError(error, 'ACCOUNT_LINK_FAILED')
      }
    },

    async linkExistingAuthUser(input) {
      if (!input || !input.staffId.trim() || !input.authUserId.trim()) {
        throw providerError('ACCOUNT_PROVISIONING_INVALID_REQUEST')
      }
      const staff = await loadStaff(input.staffId)
      const systemPermission = roleFor(staff, input.initialRole)
      let authUser: ProvisioningAuthUser | null
      try {
        authUser = await authGateway().getUserById(input.authUserId)
      } catch (error) {
        throw normalizeGatewayError(error, 'ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
      }
      if (!authUser) throw providerError('ACCOUNT_AUTH_USER_NOT_FOUND')
      if (normalizedAuthUser(authUser) !== normalizeEmail(staff.email)) {
        throw providerError('ACCOUNT_AUTH_EMAIL_MISMATCH')
      }
      const mappedStaffId = authUser.appMetadata?.business_user_id
      if (mappedStaffId !== undefined
        && mappedStaffId !== null
        && String(mappedStaffId).trim()
        && String(mappedStaffId) !== staff.id) {
        throw providerError('ACCOUNT_AUTH_USER_ALREADY_LINKED')
      }

      try {
        return await staffGateway.linkAuthUser({
          staffId: staff.id,
          authUserId: authUser.id,
          systemPermission,
          mode: 'link',
        })
      } catch (error) {
        throw normalizeGatewayError(error, 'ACCOUNT_LINK_FAILED')
      }
    },
  }
}

export const accountProvisioningService = createAccountProvisioningService()
