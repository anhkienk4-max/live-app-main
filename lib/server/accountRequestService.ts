import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  AccountRequest,
  AccountRequestStatus,
  AccountRequestSubmission,
} from '@/lib/types/accountRequest.types'

export type AccountRequestServiceErrorCode =
  | 'ACCOUNT_REQUEST_FAILED'
  | 'ACCOUNT_REQUEST_NOT_FOUND'
  | 'ACCOUNT_REQUEST_NOT_PENDING'
  | 'ACCOUNT_REQUEST_REVIEW_STALE'
  | 'ACCOUNT_REQUEST_REJECTION_REASON_REQUIRED'
  | 'ACCOUNT_REQUEST_REJECTION_REASON_TOO_LONG'
  | 'ACCOUNT_REQUEST_RATE_LIMITED'
  | 'STAFF_ADMIN_REQUIRED'

export class AccountRequestServiceError extends Error {
  constructor(
    message = 'Unable to process the account request.',
    public readonly code: AccountRequestServiceErrorCode = 'ACCOUNT_REQUEST_FAILED',
  ) {
    super(message)
    this.name = 'AccountRequestServiceError'
  }
}

export interface AccountRequestService {
  submitAccountRequest(input: AccountRequestSubmission, clientIp?: string): Promise<void>
  listAccountRequests(status: AccountRequestStatus | 'all'): Promise<AccountRequest[]>
  getAccountRequest(id: string): Promise<AccountRequest | null>
  approveAccountRequest(requestId: string, expectedVersion: number): Promise<AccountRequest>
  rejectAccountRequest(requestId: string, expectedVersion: number, rejectionReason: string): Promise<AccountRequest>
}

const serviceErrorCodes: AccountRequestServiceErrorCode[] = [
  'ACCOUNT_REQUEST_NOT_FOUND',
  'ACCOUNT_REQUEST_NOT_PENDING',
  'ACCOUNT_REQUEST_REVIEW_STALE',
  'ACCOUNT_REQUEST_REJECTION_REASON_REQUIRED',
  'ACCOUNT_REQUEST_REJECTION_REASON_TOO_LONG',
  'ACCOUNT_REQUEST_RATE_LIMITED',
  'STAFF_ADMIN_REQUIRED',
]

function errorCode(error: { message?: string; code?: string }): AccountRequestServiceErrorCode {
  const candidate = `${error.message ?? ''} ${error.code ?? ''}`
  return serviceErrorCodes.find(code => candidate.includes(code)) ?? 'ACCOUNT_REQUEST_FAILED'
}

function throwIfError(operation: string, error: { message?: string; code?: string } | null): never | void {
  if (error) throw new AccountRequestServiceError(`Unable to ${operation}.`, errorCode(error))
}

export async function submitAccountRequest(input: AccountRequestSubmission, clientIp?: string): Promise<void> {
  const supabase = await createClient({ clientIp })
  const { error } = await supabase.rpc('submit_account_request', {
    p_email: input.email,
    p_full_name: input.full_name,
    p_phone: input.phone ?? null,
    p_department: input.department ?? null,
  })
  throwIfError('submit the account request', error)
}

export async function listAccountRequests(
  status: AccountRequestStatus | 'all' = 'pending',
): Promise<AccountRequest[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_account_requests', { p_status: status })
  throwIfError('read account requests', error)
  return (data ?? []) as AccountRequest[]
}

export async function getAccountRequest(id: string): Promise<AccountRequest | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_account_request', { p_request_id: id })
  throwIfError('read the account request', error)
  return (data ?? null) as AccountRequest | null
}

export async function approveAccountRequest(
  requestId: string,
  expectedVersion: number,
): Promise<AccountRequest> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('approve_account_request', {
    p_request_id: requestId,
    p_expected_version: expectedVersion,
  })
  throwIfError('approve the account request', error)
  return data as AccountRequest
}

export async function rejectAccountRequest(
  requestId: string,
  expectedVersion: number,
  rejectionReason: string,
): Promise<AccountRequest> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reject_account_request', {
    p_request_id: requestId,
    p_expected_version: expectedVersion,
    p_rejection_reason: rejectionReason,
  })
  throwIfError('reject the account request', error)
  return data as AccountRequest
}
