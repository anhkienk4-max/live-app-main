import type { SupabaseClient } from '@supabase/supabase-js'
import type { OperationalRole } from '@/lib/types/database.types'
import { createClient } from '@/lib/supabase/client'
import { validateStaffingCandidateResult, type StaffingCandidateRow } from '@/lib/utils/staffingCandidateContract'

export type { StaffingCandidateRow, StaffingAvailability } from '@/lib/utils/staffingCandidateContract'

export interface StaffingCandidatePage {
  items: StaffingCandidateRow[]
  total: number
  page: number
  pageSize: number
}

export interface StaffingCandidateQuery {
  shiftId: string
  role: OperationalRole
  search: string
  page: number
  pageSize?: number
}

export async function readStaffingCandidates(
  query: StaffingCandidateQuery,
  client: Pick<SupabaseClient, 'rpc'> = createClient(),
): Promise<StaffingCandidatePage> {
  const pageSize = query.pageSize ?? 20
  const offset = (query.page - 1) * pageSize
  if (!query.shiftId || !['host', 'support', 'technical'].includes(query.role) ||
    !Number.isInteger(query.page) || query.page < 1 || query.page > 501 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
    query.search.trim().length > 100 || offset > 10000) {
    throw new Error('STAFFING_CANDIDATE_QUERY_INVALID')
  }
  const { data, error } = await client.rpc('search_staffing_candidates', {
    p_shift_id: query.shiftId,
    p_role: query.role,
    p_search: query.search.trim(),
    p_limit: pageSize,
    p_offset: offset,
  })
  if (error) throw new Error(error.message || 'STAFFING_CANDIDATE_READ_FAILED')
  const result = validateStaffingCandidateResult(data, pageSize, offset)
  return { ...result, page: query.page, pageSize }
}
