import { getAuthMode } from '@/lib/auth/authMode'
import { createClient } from '@/lib/supabase/client'
import type { ShiftIncidentV1 } from '@/lib/types/shiftIncidentContract'
import type { WorkforceIncidentMonthlyResponse } from '@/lib/types/workforceIncidentMonth'

export interface ShiftIncidentRecord extends ShiftIncidentV1 {
  shiftDate?: string | null
  shiftTitle?: string | null
  brandName?: string | null
  brandId?: string | null
  agencyId?: string | null
  platform?: string | null
  originalStaffName?: string | null
  replacementStaffName?: string | null
  reason?: string | null
  evidenceReferenceId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface StaffIncidentSummary {
  staffId: string
  staffName: string
  role?: string
  agencyId?: string
  brandId?: string
  totalIncidents: number
  skipCount: number
  absentCount: number
  lateCount: number
  earlyLeaveCount: number
  approvedPassCount: number
  approvedSwapCount: number
  authorizedAbsenceCount: number
  plannedReassignmentCount: number
  pendingCount: number
  rejectedCount: number
  correctedCount: number
  verifiedLateMinutes: number
  unknownDurationCount: number
  distinctShifts: number
}

export interface WorkforceIncidentSummary {
  month: string
  totalIncidents: number
  confirmedViolations: number
  confirmedSkips: number
  confirmedAbsents: number
  confirmedPunctuality: number
  confirmedLates: number
  confirmedEarlyLeaves: number
  approvedChanges: number
  approvedPasses: number
  approvedSwaps: number
  authorizedAbsences: number
  plannedReassignments: number
  pendingReviews: number
  rejectedReviews: number
  correctedReviews: number
  totalVerifiedLateMinutes: number
  unknownDurationCount: number
  distinctAffectedShifts: number
  distinctAffectedStaff: number
  staffSummaries: StaffIncidentSummary[]
}

export interface WorkforceSummaryParams {
  month?: string
  employeeId?: string
  role?: string
  brandId?: string
  agencyId?: string
  platform?: string
  status?: string
  incidentType?: string
}

export class ShiftIncidentServiceError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'ShiftIncidentServiceError'
    this.code = code
  }
}

let inMemoryIncidents: ShiftIncidentRecord[] = [
  {
    id: 'inc-001',
    shiftId: 'SFT-001',
    shiftDate: '2026-09-10',
    shiftTitle: 'Ca sáng Live TikTok',
    brandName: 'Brand Alpha',
    platform: 'tiktok',
    staffingSegmentId: 'seg-001',
    originalRegistrationId: 'reg-001',
    originalStaffId: 'USR-STAFF-01',
    originalStaffName: 'Nguyễn Văn A',
    replacementRegistrationId: 'reg-002',
    replacementStaffId: 'USR-STAFF-02',
    replacementStaffName: 'Trần Thị B',
    role: 'host',
    businessDate: '2026-09-10',
    incidentType: 'late',
    reviewState: 'confirmed',
    verifiedLateMinutes: 15,
    reason: 'Kẹt xe đột xuất trên đường đến studio',
    evidenceReferenceId: 'EV-001',
    version: 1,
    createdAt: '2026-09-10T07:15:00.000Z',
  },
  {
    id: 'inc-002',
    shiftId: 'SFT-002',
    shiftDate: '2026-09-12',
    shiftTitle: 'Ca tối Live Shopee',
    brandName: 'Brand Beta',
    platform: 'shopee',
    staffingSegmentId: 'seg-002',
    originalRegistrationId: 'reg-003',
    originalStaffId: 'USR-STAFF-01',
    originalStaffName: 'Nguyễn Văn A',
    replacementRegistrationId: null,
    replacementStaffId: null,
    replacementStaffName: null,
    role: 'host',
    businessDate: '2026-09-12',
    incidentType: 'approved_swap',
    reviewState: 'confirmed',
    verifiedLateMinutes: null,
    reason: 'Đổi ca báo trước 48h theo quy trình',
    evidenceReferenceId: null,
    version: 1,
    createdAt: '2026-09-12T18:00:00.000Z',
  },
  {
    id: 'inc-003',
    shiftId: 'SFT-003',
    shiftDate: '2026-09-15',
    shiftTitle: 'Ca chiều Live Lazada',
    brandName: 'Brand Gamma',
    platform: 'lazada',
    staffingSegmentId: null,
    originalRegistrationId: 'reg-005',
    originalStaffId: 'USR-STAFF-03',
    originalStaffName: 'Lê Hoàng C',
    replacementRegistrationId: 'reg-006',
    replacementStaffId: 'USR-STAFF-02',
    replacementStaffName: 'Trần Thị B',
    role: 'technical',
    businessDate: '2026-09-15',
    incidentType: 'early_leave',
    reviewState: 'pending',
    verifiedLateMinutes: null,
    reason: 'Việc gia đình khẩn cấp',
    evidenceReferenceId: null,
    version: 1,
    createdAt: '2026-09-15T15:30:00.000Z',
  },
]

export const shiftIncidentService = {
  async getIncidentsForStaff(staffId: string): Promise<ShiftIncidentRecord[]> {
    if (!staffId) return []

    if (getAuthMode() === 'supabase') {
      const client = createClient()
      const { data, error } = await client
        .from('shift_incidents')
        .select('*')
        .or(`original_staff_id.eq.${staffId},replacement_staff_id.eq.${staffId}`)
        .order('business_date', { ascending: false })

      if (error) {
        const isMissingRelation =
          error.code === '42P01' ||
          error.message?.includes('relation "public.shift_incidents" does not exist') ||
          error.message?.includes('shift_incidents')
        throw new ShiftIncidentServiceError(
          isMissingRelation
            ? 'SCHEMA_NOT_DEPLOYED: Tính năng Sự cố ca trực chưa được triển khai trên môi trường này.'
            : `SHIFT_INCIDENTS_READ_FAILED: ${error.message}`,
          isMissingRelation ? 'SCHEMA_NOT_DEPLOYED' : 'READ_FAILED',
        )
      }

      return (data ?? []).map(row => ({
        id: row.id,
        shiftId: row.shift_id,
        shiftDate: row.business_date,
        brandName: row.brand_name,
        platform: row.platform,
        staffingSegmentId: row.staffing_segment_id,
        originalRegistrationId: row.original_registration_id,
        originalStaffId: row.original_staff_id,
        originalStaffName: row.original_staff_name,
        replacementRegistrationId: row.replacement_registration_id,
        replacementStaffId: row.replacement_staff_id,
        replacementStaffName: row.replacement_staff_name,
        role: row.role,
        businessDate: row.business_date,
        incidentType: row.incident_type,
        reviewState: row.review_state,
        verifiedLateMinutes: row.verified_late_minutes,
        reason: row.reason,
        evidenceReferenceId: row.evidence_reference_id,
        version: row.version ?? 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    }

    return Promise.resolve(
      inMemoryIncidents.filter(
        inc => inc.originalStaffId === staffId || inc.replacementStaffId === staffId,
      ),
    )
  },

  async getWorkforceSummary(params?: WorkforceSummaryParams): Promise<WorkforceIncidentSummary> {
    const targetMonth = params?.month || new Date().toISOString().slice(0, 7)

    if (getAuthMode() === 'supabase') {
      const searchParams = new URLSearchParams()
      searchParams.set('month', targetMonth)
      if (params?.employeeId) searchParams.set('staff_id', params.employeeId)
      if (params?.brandId && params.brandId !== 'all') searchParams.set('brand_id', params.brandId)
      if (params?.role && params.role !== 'all') {
        const validRoles = ['host', 'support', 'technical']
        if (validRoles.includes(params.role)) {
          searchParams.set('role', params.role)
        }
      }
      if (params?.agencyId && params.agencyId !== 'all') searchParams.set('agency_id', params.agencyId)
      if (params?.platform && params.platform !== 'all') searchParams.set('platform_id', params.platform)
      if (params?.status && params.status !== 'all') searchParams.set('status', params.status)
      if (params?.incidentType && params.incidentType !== 'all') searchParams.set('incident_type', params.incidentType)

      let res: Response
      try {
        res = await fetch(`/api/workforce/incidents/monthly?${searchParams.toString()}`)
      } catch (err: unknown) {
        throw new ShiftIncidentServiceError(
          `WORKFORCE_SUMMARY_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`,
          'NETWORK_ERROR',
        )
      }

      if (res.status === 404 || res.status === 503) {
        throw new ShiftIncidentServiceError(
          'SCHEMA_NOT_DEPLOYED: Tính năng Tổng hợp sự cố nhân sự chưa được triển khai trên môi trường này.',
          'SCHEMA_NOT_DEPLOYED',
        )
      }

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null)
        const code = errorBody?.error?.code || `HTTP_${res.status}`
        throw new ShiftIncidentServiceError(`WORKFORCE_SUMMARY_FAILED: ${code}`, code)
      }

      const json = await res.json()
      const monthlyData: WorkforceIncidentMonthlyResponse = json?.data ?? json
      return mapMonthlyResponseToWorkforceIncidentSummary(monthlyData)
    }

    // Filter in-memory items
    const filtered = inMemoryIncidents.filter(inc => {
      if (inc.businessDate && !inc.businessDate.startsWith(targetMonth)) {
        return false
      }
      if (params?.employeeId && inc.originalStaffId !== params.employeeId && inc.replacementStaffId !== params.employeeId) {
        return false
      }
      if (params?.role && inc.role !== params.role) {
        return false
      }
      if (params?.brandId && inc.brandId !== params.brandId && inc.brandName !== params.brandId) {
        return false
      }
      if (params?.agencyId && inc.agencyId !== params.agencyId) {
        return false
      }
      if (params?.platform && inc.platform !== params.platform) {
        return false
      }
      if (params?.status && inc.reviewState !== params.status) {
        return false
      }
      if (params?.incidentType && inc.incidentType !== params.incidentType) {
        return false
      }
      return true
    })

    // Compute distinct shifts
    const distinctShifts = new Set(filtered.map(i => i.shiftId)).size

    let totalVerifiedLateMinutes = 0
    let unknownDurationCount = 0
    let confirmedSkips = 0
    let confirmedAbsents = 0
    let confirmedLates = 0
    let confirmedEarlyLeaves = 0
    let approvedPasses = 0
    let approvedSwaps = 0
    let authorizedAbsences = 0
    let plannedReassignments = 0
    let pendingReviews = 0
    let rejectedReviews = 0
    let correctedReviews = 0

    const staffMap = new Map<string, StaffIncidentSummary>()

    for (const inc of filtered) {
      if (inc.reviewState === 'pending') pendingReviews++
      if (inc.reviewState === 'rejected') rejectedReviews++
      if (inc.reviewState === 'corrected') correctedReviews++

      if (inc.incidentType === 'skip' && inc.reviewState === 'confirmed') confirmedSkips++
      if (inc.incidentType === 'absent' && inc.reviewState === 'confirmed') confirmedAbsents++
      if (inc.incidentType === 'late' && inc.reviewState === 'confirmed') confirmedLates++
      if (inc.incidentType === 'early_leave' && inc.reviewState === 'confirmed') confirmedEarlyLeaves++
      if (inc.incidentType === 'approved_pass') approvedPasses++
      if (inc.incidentType === 'approved_swap') approvedSwaps++
      if (inc.incidentType === 'authorized_absence') authorizedAbsences++
      if (inc.incidentType === 'planned_reassignment') plannedReassignments++

      if (inc.verifiedLateMinutes != null) {
        totalVerifiedLateMinutes += inc.verifiedLateMinutes
      } else if (inc.incidentType === 'late') {
        unknownDurationCount++
      }

      const sId = inc.originalStaffId
      if (!staffMap.has(sId)) {
        staffMap.set(sId, {
          staffId: sId,
          staffName: inc.originalStaffName || sId,
          role: inc.role,
          totalIncidents: 0,
          skipCount: 0,
          absentCount: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
          approvedPassCount: 0,
          approvedSwapCount: 0,
          authorizedAbsenceCount: 0,
          plannedReassignmentCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
          correctedCount: 0,
          verifiedLateMinutes: 0,
          unknownDurationCount: 0,
          distinctShifts: 0,
        })
      }
      const staffSummary = staffMap.get(sId)!
      staffSummary.totalIncidents++
      if (inc.reviewState === 'pending') staffSummary.pendingCount++
      if (inc.reviewState === 'rejected') staffSummary.rejectedCount++
      if (inc.reviewState === 'corrected') staffSummary.correctedCount++
      if (inc.incidentType === 'skip' && inc.reviewState === 'confirmed') staffSummary.skipCount++
      if (inc.incidentType === 'absent' && inc.reviewState === 'confirmed') staffSummary.absentCount++
      if (inc.incidentType === 'late' && inc.reviewState === 'confirmed') staffSummary.lateCount++
      if (inc.incidentType === 'early_leave' && inc.reviewState === 'confirmed') staffSummary.earlyLeaveCount++
      if (inc.incidentType === 'approved_pass') staffSummary.approvedPassCount++
      if (inc.incidentType === 'approved_swap') staffSummary.approvedSwapCount++
      if (inc.incidentType === 'authorized_absence') staffSummary.authorizedAbsenceCount++
      if (inc.incidentType === 'planned_reassignment') staffSummary.plannedReassignmentCount++

      if (inc.verifiedLateMinutes != null) {
        staffSummary.verifiedLateMinutes += inc.verifiedLateMinutes
      } else if (inc.incidentType === 'late') {
        staffSummary.unknownDurationCount++
      }
    }

    // Set distinct shifts per staff
    for (const [sId, summ] of staffMap.entries()) {
      summ.distinctShifts = new Set(filtered.filter(i => i.originalStaffId === sId).map(i => i.shiftId)).size
    }

    return Promise.resolve({
      month: targetMonth,
      totalIncidents: filtered.length,
      confirmedViolations: confirmedSkips + confirmedAbsents,
      confirmedSkips,
      confirmedAbsents,
      confirmedPunctuality: confirmedLates + confirmedEarlyLeaves,
      confirmedLates,
      confirmedEarlyLeaves,
      approvedChanges: approvedPasses + approvedSwaps + plannedReassignments,
      approvedPasses,
      approvedSwaps,
      authorizedAbsences,
      plannedReassignments,
      pendingReviews,
      rejectedReviews,
      correctedReviews,
      totalVerifiedLateMinutes,
      unknownDurationCount,
      distinctAffectedShifts: distinctShifts,
      distinctAffectedStaff: staffMap.size,
      staffSummaries: Array.from(staffMap.values()),
    })
  },

  resetIncidents(incidents: ShiftIncidentRecord[] = []) {
    inMemoryIncidents = [...incidents]
  },
}

export function mapMonthlyResponseToWorkforceIncidentSummary(
  data: WorkforceIncidentMonthlyResponse,
): WorkforceIncidentSummary {
  const staff = data.staff || []
  const totals = data.summary
  const allShiftIds = new Set<string>()

  let confirmedSkips = 0
  let confirmedAbsents = 0
  let authorizedAbsences = 0
  let confirmedLates = 0
  let confirmedEarlyLeaves = 0
  let approvedPasses = 0
  let approvedSwaps = 0
  let plannedReassignments = 0
  let pendingReviews = 0
  let rejectedReviews = 0
  let correctedReviews = 0
  let totalVerifiedLateMinutes = 0
  let unknownDurationCount = 0

  const staffSummaries: StaffIncidentSummary[] = staff.map(s => {
    if (!totals) {
      confirmedSkips += s.confirmed_skip_count ?? 0
      confirmedAbsents += s.confirmed_absent_count ?? 0
      authorizedAbsences += s.confirmed_authorized_absence_count ?? 0
      confirmedLates += s.confirmed_late_count ?? 0
      confirmedEarlyLeaves += s.confirmed_early_leave_count ?? 0
      approvedPasses += s.approved_pass_count ?? 0
      approvedSwaps += s.approved_swap_count ?? 0
      plannedReassignments += s.confirmed_planned_reassignment_count ?? 0
      pendingReviews += s.pending_count ?? 0
      rejectedReviews += s.rejected_count ?? 0
      correctedReviews += s.corrected_count ?? 0
      totalVerifiedLateMinutes += s.verified_late_minutes_total ?? 0
      unknownDurationCount += s.unknown_late_minutes_count ?? 0
    }

    if (Array.isArray(s.items)) {
      for (const item of s.items) {
        if (item.shiftId) allShiftIds.add(item.shiftId)
      }
    }

    return {
      staffId: s.staff_id,
      staffName: s.staff_id,
      totalIncidents: s.incident_count,
      skipCount: s.confirmed_skip_count,
      absentCount: s.confirmed_absent_count,
      lateCount: s.confirmed_late_count,
      earlyLeaveCount: s.confirmed_early_leave_count,
      approvedPassCount: s.approved_pass_count,
      approvedSwapCount: s.approved_swap_count,
      authorizedAbsenceCount: s.confirmed_authorized_absence_count,
      plannedReassignmentCount: s.confirmed_planned_reassignment_count ?? 0,
      pendingCount: s.pending_count,
      rejectedCount: s.rejected_count,
      correctedCount: s.corrected_count,
      verifiedLateMinutes: s.verified_late_minutes_total,
      unknownDurationCount: s.unknown_late_minutes_count,
      distinctShifts: s.distinct_shift_count,
    }
  })

  if (totals) {
    return {
      month: data.month,
      totalIncidents: data.totalIncidents,
      confirmedViolations: totals.confirmedSkipCount + totals.confirmedAbsentCount,
      confirmedSkips: totals.confirmedSkipCount,
      confirmedAbsents: totals.confirmedAbsentCount,
      confirmedPunctuality: totals.confirmedLateCount + totals.confirmedEarlyLeaveCount,
      confirmedLates: totals.confirmedLateCount,
      confirmedEarlyLeaves: totals.confirmedEarlyLeaveCount,
      approvedChanges: totals.approvedPassCount + totals.approvedSwapCount + (totals.confirmedPlannedReassignmentCount ?? 0),
      approvedPasses: totals.approvedPassCount,
      approvedSwaps: totals.approvedSwapCount,
      authorizedAbsences: totals.confirmedAuthorizedAbsenceCount,
      plannedReassignments: totals.confirmedPlannedReassignmentCount ?? 0,
      pendingReviews: totals.pendingCount,
      rejectedReviews: totals.rejectedCount,
      correctedReviews: totals.correctedCount,
      totalVerifiedLateMinutes: totals.verifiedLateMinutesTotal,
      unknownDurationCount: totals.unknownLateMinutesCount,
      distinctAffectedShifts: data.totalDistinctShifts ?? allShiftIds.size,
      distinctAffectedStaff: data.totalDistinctStaff ?? staff.length,
      staffSummaries,
    }
  }

  return {
    month: data.month,
    totalIncidents: data.totalIncidents,
    confirmedViolations: confirmedSkips + confirmedAbsents + authorizedAbsences,
    confirmedSkips,
    confirmedAbsents,
    confirmedPunctuality: confirmedLates + confirmedEarlyLeaves,
    confirmedLates,
    confirmedEarlyLeaves,
    approvedChanges: approvedPasses + approvedSwaps + plannedReassignments,
    approvedPasses,
    approvedSwaps,
    authorizedAbsences,
    plannedReassignments,
    pendingReviews,
    rejectedReviews,
    correctedReviews,
    totalVerifiedLateMinutes,
    unknownDurationCount,
    distinctAffectedShifts: data.totalDistinctShifts ?? allShiftIds.size,
    distinctAffectedStaff: data.totalDistinctStaff ?? staff.length,
    staffSummaries,
  }
}
