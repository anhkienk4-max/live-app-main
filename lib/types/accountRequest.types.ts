export type AccountRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type AccountRequestProvisioningStatus =
  | 'not_started'
  | 'in_progress'
  | 'invited'
  | 'linked'
  | 'failed'

export interface AccountRequest {
  id: string
  email: string
  full_name: string
  phone: string | null
  department: string | null
  status: AccountRequestStatus
  provisioning_status: AccountRequestProvisioningStatus
  staff_id: string | null
  auth_user_id: string | null
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  provisioning_error_code: string | null
  created_at: string
  updated_at: string
}

export interface AccountRequestSubmission {
  email: string
  full_name: string
  phone?: string | null
  department?: string | null
}
