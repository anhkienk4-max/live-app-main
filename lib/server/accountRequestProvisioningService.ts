import type { SupabaseClient } from '@supabase/supabase-js'

import type { User } from '@/lib/types/database.types'
import type { AccountRequest } from '@/lib/types/accountRequest.types'

export type AccountRequestProvisioningErrorCode =
  | 'ACCOUNT_REQUEST_NOT_FOUND'
  | 'ACCOUNT_REQUEST_NOT_APPROVED'
  | 'ACCOUNT_PROVISIONING_IN_PROGRESS'
  | 'ACCOUNT_PROVISIONING_RETRY_REQUIRED'
  | 'ACCOUNT_PROVISIONING_RETRY_INVALID'
  | 'ACCOUNT_PROVISIONING_STATE_INVALID'
  | 'ACCOUNT_PROVISIONING_STALE'
  | 'ACCOUNT_PROVISIONING_NOT_IN_PROGRESS'
  | 'ACCOUNT_PROVISIONING_STATUS_INVALID'
  | 'ACCOUNT_PROVISIONING_IDENTITY_INCOMPLETE'
  | 'ACCOUNT_PROVISIONING_IDENTITY_CONFLICT'
  | 'ACCOUNT_PROVISIONING_ERROR_CODE_INVALID'
  | 'ACCOUNT_AUTH_USER_NOT_FOUND'
  | 'ACCOUNT_AUTH_EMAIL_MISMATCH'
  | 'ACCOUNT_AUTH_USER_ALREADY_LINKED'
  | 'ACCOUNT_STAFF_NOT_FOUND'
  | 'ACCOUNT_STAFF_ARCHIVED'
  | 'ACCOUNT_STAFF_INACTIVE'
  | 'ACCOUNT_STAFF_ALREADY_LINKED'
  | 'ACCOUNT_EMAIL_AMBIGUOUS'
  | 'ACCOUNT_AUTH_PROVIDER_UNAVAILABLE'
  | 'ACCOUNT_INVITE_FAILED'
  | 'ACCOUNT_METADATA_SYNC_FAILED'
  | 'ACCOUNT_PROVISIONING_FAILED'

export class AccountRequestProvisioningError extends Error {
  constructor(
    public readonly code: AccountRequestProvisioningErrorCode,
    message = code,
  ) {
    super(message)
    this.name = 'AccountRequestProvisioningError'
  }
}

export interface ProvisioningAuthUser {
  id: string
  email?: string
  appMetadata?: Record<string, unknown>
  hasGoogleIdentity?: boolean
}

export interface ProvisioningAuthGateway {
  findUsersByEmail(email: string): Promise<ProvisioningAuthUser[]>
  getUserById(authUserId: string): Promise<ProvisioningAuthUser | null>
  inviteUserByEmail(email: string, redirectTo: string): Promise<ProvisioningAuthUser>
  updateAppMetadata(authUserId: string, metadata: Record<string, unknown>): Promise<void>
  deleteUser(authUserId: string): Promise<void>
}

export interface ProvisioningStaffGateway {
  findByEmail(email: string): Promise<User[]>
  getById(staffId: string): Promise<User | null>
  ensureIdentity(input: {
    requestId: string
    expectedVersion: number
    authUserId: string
    staffId: string | null
  }): Promise<AccountRequest>
  complete(input: {
    requestId: string
    expectedVersion: number
    provisioningStatus: 'invited' | 'linked'
  }): Promise<AccountRequest>
  fail(input: { requestId: string; expectedVersion: number; errorCode: string }): Promise<AccountRequest>
  begin(input: { requestId: string; expectedVersion: number; retry: boolean }): Promise<AccountRequest>
}

export interface AccountRequestProvisioningService {
  provision(input: {
    requestId: string
    expectedVersion: number
    retry: boolean
    redirectTo: string
  }): Promise<AccountRequest>
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function appMetadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function isProvisioningError(error: unknown): error is AccountRequestProvisioningError {
  return error instanceof AccountRequestProvisioningError
}

function normalizeError(error: unknown, fallback: AccountRequestProvisioningErrorCode) {
  return isProvisioningError(error) ? error : new AccountRequestProvisioningError(fallback)
}

function providerError(code: AccountRequestProvisioningErrorCode): AccountRequestProvisioningError {
  return new AccountRequestProvisioningError(code)
}

function assertActiveStaff(staff: User | null): User {
  if (!staff) throw providerError('ACCOUNT_STAFF_NOT_FOUND')
  if (staff.archived_at || staff.deleted_at) throw providerError('ACCOUNT_STAFF_ARCHIVED')
  if (staff.status !== 'active' || staff.account_status === 'rejected') {
    throw providerError('ACCOUNT_STAFF_INACTIVE')
  }
  return staff
}

async function createDefaultAuthGateway(): Promise<ProvisioningAuthGateway> {
  const { createSupabaseAdminClient } = await import('@/lib/server/supabaseAdmin')
  const admin = createSupabaseAdminClient()
  const mapUser = (user: {
    id: string
    email?: string
    app_metadata?: unknown
    identities?: Array<{ provider?: string }> | null
  }): ProvisioningAuthUser => ({
    id: user.id,
    email: user.email,
    appMetadata: appMetadataOf(user.app_metadata),
    hasGoogleIdentity: Boolean(user.identities?.some(identity => identity.provider === 'google')),
  })

  return {
    async findUsersByEmail(email) {
      const matches: ProvisioningAuthUser[] = []
      const perPage = 1000
      for (let page = 1; page <= 10; page += 1) {
        const result = await admin.auth.admin.listUsers({ page, perPage })
        if (result.error) throw providerError('ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
        for (const user of result.data.users) {
          if (user.email && normalizeEmail(user.email) === email) matches.push(mapUser(user))
        }
        if (result.data.users.length < perPage) break
        if (page === 10) throw providerError('ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
      }
      return matches
    },
    async getUserById(authUserId) {
      const result = await admin.auth.admin.getUserById(authUserId)
      if (result.error) {
        if (result.error.status === 404 || result.error.code === 'user_not_found') return null
        throw providerError('ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
      }
      return result.data.user ? mapUser(result.data.user) : null
    },
    async inviteUserByEmail(email, redirectTo) {
      const result = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
      if (result.error || !result.data.user) throw providerError('ACCOUNT_INVITE_FAILED')
      return mapUser(result.data.user)
    },
    async updateAppMetadata(authUserId, metadata) {
      const result = await admin.auth.admin.updateUserById(authUserId, { app_metadata: metadata })
      if (result.error) throw providerError('ACCOUNT_METADATA_SYNC_FAILED')
    },
    async deleteUser(authUserId) {
      const result = await admin.auth.admin.deleteUser(authUserId, true)
      if (result.error) throw providerError('ACCOUNT_AUTH_PROVIDER_UNAVAILABLE')
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
  async function repository() {
    const { createSupabaseMasterDataRepository } = await import('@/lib/services/supabaseMasterDataService')
    return createSupabaseMasterDataRepository(await dataClient())
  }
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await (await dataClient()).rpc(name, args).maybeSingle()
    if (result.error || !result.data) throw new AccountRequestProvisioningError(errorCode(result.error))
    return result.data as T
  }
  return {
    async findByEmail(email) {
      const users = await (await repository()).businessUsers.getAll(true)
      return users.filter(user => normalizeEmail(user.email) === email)
    },
    async getById(staffId) {
      return (await repository()).businessUsers.getById(staffId)
    },
    async begin(input) {
      return rpc<AccountRequest>('begin_account_request_provisioning', {
        p_request_id: input.requestId,
        p_expected_version: input.expectedVersion,
        p_retry: input.retry,
      })
    },
    async ensureIdentity(input) {
      return rpc<AccountRequest>('ensure_account_request_identity', {
        p_request_id: input.requestId,
        p_expected_version: input.expectedVersion,
        p_auth_user_id: input.authUserId,
        p_staff_id: input.staffId,
      })
    },
    async complete(input) {
      return rpc<AccountRequest>('complete_account_request_provisioning', {
        p_request_id: input.requestId,
        p_expected_version: input.expectedVersion,
        p_provisioning_status: input.provisioningStatus,
      })
    },
    async fail(input) {
      return rpc<AccountRequest>('fail_account_request_provisioning', {
        p_request_id: input.requestId,
        p_expected_version: input.expectedVersion,
        p_error_code: input.errorCode,
      })
    },
  }
}

function errorCode(error: { message?: string; code?: string } | null): AccountRequestProvisioningErrorCode {
  const value = `${error?.message ?? ''} ${error?.code ?? ''}`
  const codes: AccountRequestProvisioningErrorCode[] = [
    'ACCOUNT_REQUEST_NOT_FOUND', 'ACCOUNT_REQUEST_NOT_APPROVED', 'ACCOUNT_PROVISIONING_IN_PROGRESS',
    'ACCOUNT_PROVISIONING_RETRY_REQUIRED', 'ACCOUNT_PROVISIONING_RETRY_INVALID',
    'ACCOUNT_PROVISIONING_STATE_INVALID', 'ACCOUNT_PROVISIONING_STALE',
    'ACCOUNT_PROVISIONING_NOT_IN_PROGRESS', 'ACCOUNT_PROVISIONING_STATUS_INVALID',
    'ACCOUNT_PROVISIONING_IDENTITY_INCOMPLETE', 'ACCOUNT_PROVISIONING_IDENTITY_CONFLICT',
    'ACCOUNT_PROVISIONING_ERROR_CODE_INVALID', 'ACCOUNT_AUTH_USER_NOT_FOUND',
    'ACCOUNT_AUTH_EMAIL_MISMATCH', 'ACCOUNT_AUTH_USER_ALREADY_LINKED', 'ACCOUNT_STAFF_NOT_FOUND',
    'ACCOUNT_STAFF_ARCHIVED', 'ACCOUNT_STAFF_INACTIVE', 'ACCOUNT_STAFF_ALREADY_LINKED', 'ACCOUNT_EMAIL_AMBIGUOUS',
  ]
  return codes.find(code => value.includes(code)) ?? 'ACCOUNT_PROVISIONING_FAILED'
}

export function createAccountRequestProvisioningService(
  dependencies: { auth?: ProvisioningAuthGateway; staff?: ProvisioningStaffGateway } = {},
): AccountRequestProvisioningService {
  const auth: ProvisioningAuthGateway | undefined = dependencies.auth
  let authPromise: Promise<ProvisioningAuthGateway> | undefined
  const authGateway = () => auth ? Promise.resolve(auth) : (authPromise ||= createDefaultAuthGateway())
  const staff = dependencies.staff || createDefaultStaffGateway()

  return {
    async provision(input) {
      let request = await staff.begin({
        requestId: input.requestId,
        expectedVersion: input.expectedVersion,
        retry: input.retry,
      })
      if (request.provisioning_status === 'invited' || request.provisioning_status === 'linked') {
        return request
      }
      let invitedAuthUser: ProvisioningAuthUser | null = null
      let identityPrepared = false
      try {
        const email = normalizeEmail(request.email)
        const staffMatches = request.staff_id
          ? [await staff.getById(request.staff_id)].filter((value): value is User => Boolean(value))
          : await staff.findByEmail(email)
        if (staffMatches.length > 1) throw providerError('ACCOUNT_EMAIL_AMBIGUOUS')
        const existingStaff = staffMatches[0] ? assertActiveStaff(staffMatches[0]) : null
        if (
          request.auth_user_id
          && existingStaff?.auth_user_id
          && request.auth_user_id !== existingStaff.auth_user_id
        ) {
          throw providerError('ACCOUNT_STAFF_ALREADY_LINKED')
        }
        const authMatches = request.auth_user_id
          ? [await (await authGateway()).getUserById(request.auth_user_id)].filter((value): value is ProvisioningAuthUser => Boolean(value))
          : await (await authGateway()).findUsersByEmail(email)
        if (authMatches.length > 1) throw providerError('ACCOUNT_EMAIL_AMBIGUOUS')
        let existingAuth = authMatches[0] ?? null
        if (existingStaff?.auth_user_id && (!existingAuth || existingAuth.id !== existingStaff.auth_user_id)) {
          const staffAuth = await (await authGateway()).getUserById(existingStaff.auth_user_id)
          if (!staffAuth) throw providerError('ACCOUNT_AUTH_USER_NOT_FOUND')
          existingAuth = staffAuth
        }
        if (existingStaff && existingAuth && normalizeEmail(existingAuth.email ?? '') !== email) {
          throw providerError('ACCOUNT_AUTH_EMAIL_MISMATCH')
        }
        if (existingStaff?.auth_user_id && existingAuth && existingStaff.auth_user_id !== existingAuth.id) {
          throw providerError('ACCOUNT_AUTH_USER_ALREADY_LINKED')
        }

        let authUser = existingAuth
        let outcome: 'invited' | 'linked' = 'linked'
        if (!authUser) {
          try {
            authUser = await (await authGateway()).inviteUserByEmail(
              email,
              input.redirectTo,
            )
            invitedAuthUser = authUser
            outcome = 'invited'
          } catch (error) {
            throw normalizeError(error, 'ACCOUNT_INVITE_FAILED')
          }
        }

        request = await staff.ensureIdentity({
          requestId: request.id,
          expectedVersion: request.version,
          authUserId: authUser.id,
          staffId: existingStaff?.id ?? null,
        })
        identityPrepared = true
        const metadata = {
          ...appMetadataOf(authUser.appMetadata),
          system_permission: existingStaff?.system_permission ?? 'member',
          business_user_id: request.staff_id,
        }
        await (await authGateway()).updateAppMetadata(authUser.id, metadata)
        return await staff.complete({
          requestId: request.id,
          expectedVersion: request.version,
          provisioningStatus: outcome,
        })
      } catch (error) {
        const normalized = normalizeError(error, 'ACCOUNT_PROVISIONING_FAILED')
        if (invitedAuthUser && !identityPrepared) {
          try { await (await authGateway()).deleteUser(invitedAuthUser.id) } catch { /* stable error wins */ }
        }
        try {
          request = await staff.fail({
            requestId: request.id,
            expectedVersion: request.version,
            errorCode: normalized.code,
          })
        } catch { /* preserve the original safe error */ }
        throw normalized
      }
    },
  }
}

export const accountRequestProvisioningService = createAccountRequestProvisioningService()
