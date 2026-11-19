export type StaffingAvailability = 'available' | 'already_on_shift' | 'conflict'

export interface StaffingCandidateRow {
  user_id: string
  full_name: string
  availability: StaffingAvailability
}

export interface StaffingCandidateResult {
  items: StaffingCandidateRow[]
  total: number
}

const allowedAvailability = new Set<StaffingAvailability>(['available', 'already_on_shift', 'conflict'])

/** Validate the entire RPC envelope, including an empty final page with a nonzero total. */
export function validateStaffingCandidateResult(raw: unknown, pageSize: number, offset: number): StaffingCandidateResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('STAFFING_CANDIDATE_RESPONSE_INVALID')
  const page = raw as Record<string, unknown>
  if (typeof page.total !== 'number' || !Number.isSafeInteger(page.total) || page.total < 0 ||
    !Array.isArray(page.items) || page.items.length > pageSize) {
    throw new Error('STAFFING_CANDIDATE_RESPONSE_INVALID')
  }
  const items: StaffingCandidateRow[] = page.items.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('STAFFING_CANDIDATE_RESPONSE_INVALID')
    const item = value as Record<string, unknown>
    if (typeof item.user_id !== 'string' || !item.user_id || item.user_id.length > 200 ||
      typeof item.full_name !== 'string' || !item.full_name || item.full_name.length > 300 ||
      !allowedAvailability.has(item.availability as StaffingAvailability)) {
      throw new Error('STAFFING_CANDIDATE_RESPONSE_INVALID')
    }
    return { user_id: item.user_id, full_name: item.full_name,
      availability: item.availability as StaffingAvailability }
  })
  if (new Set(items.map(item => item.user_id)).size !== items.length ||
    (items.length > 0 && offset + items.length > page.total) ||
    (offset < page.total && items.length === 0) ||
    (offset >= page.total && items.length > 0)) {
    throw new Error('STAFFING_CANDIDATE_RESPONSE_INVALID')
  }
  return { items, total: page.total }
}
