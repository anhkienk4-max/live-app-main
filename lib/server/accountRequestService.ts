import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  AccountRequest,
  AccountRequestStatus,
  AccountRequestSubmission,
} from '@/lib/types/accountRequest.types'

export class AccountRequestServiceError extends Error {
  constructor(message = 'Unable to process the account request.') {
    super(message)
    this.name = 'AccountRequestServiceError'
  }
}

export interface AccountRequestService {
  submitAccountRequest(input: AccountRequestSubmission): Promise<void>
  listAccountRequests(status: AccountRequestStatus | 'all'): Promise<unknown[]>
  getAccountRequest(id: string): Promise<unknown | null>
}

function throwIfError(operation: string, error: { message?: string } | null): never | void {
  if (error) {
    throw new AccountRequestServiceError(`Unable to ${operation}.`)
  }
}

export async function submitAccountRequest(input: AccountRequestSubmission): Promise<void> {
  const supabase = await createClient()
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
