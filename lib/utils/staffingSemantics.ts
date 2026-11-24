import type {
  OperationalRole,
  PersistedSegmentStaffingBreakdown,
  PersistedStaffingSegment,
  PlannedStaffingSegmentDraft,
  SegmentRoleStaffingCounts,
  Shift,
  ShiftRoleStaffingMetrics,
  ShiftStaffingMetrics,
} from '@/lib/types/database.types'
import {
  DEFAULT_BUSINESS_TIMEZONE,
  isValidIanaTimeZone,
  resolveSegmentDateTime,
  resolveShiftDateTime,
} from '@/lib/utils/shiftUtils'

export const OPERATIONAL_ROLES: readonly OperationalRole[] = ['host', 'support', 'technical'] as const

const ROLE_REQUIRED_FIELD: Record<
  OperationalRole,
  'required_host_count' | 'required_support_count' | 'required_technical_count'
> = {
  host: 'required_host_count',
  support: 'required_support_count',
  technical: 'required_technical_count',
}

export interface NormalizedShiftSegment extends PlannedStaffingSegmentDraft {
  segment_id?: string
  start_at: string
  end_at: string
  duration_minutes: number
}

export type StaffingRegistrationLike = {
  id: string
  shift_id: string
  staffing_segment_id?: string | null
  user_id: string
  operational_role: OperationalRole
  status: string
}

const isApprovedStatus = (status: string) =>
  status === 'approved' || status === 'manually_assigned'

function roundStaffHours(totalPersonMinutes: number): number {
  return Math.round((totalPersonMinutes / 60) * 100) / 100
}

/**
 * Formats an ISO timestamp or Date to HH:MM wall-clock time in the target IANA
 * business timezone (default Asia/Ho_Chi_Minh), never browser-local timezone.
 */
export function formatWallTimeInTimezone(
  isoOrDate: string | Date,
  timezone = DEFAULT_BUSINESS_TIMEZONE,
): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(date.getTime())) return ''
  const tz = isValidIanaTimeZone(timezone) ? timezone : DEFAULT_BUSINESS_TIMEZONE
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  const hh = map.hour === '24' ? '00' : String(map.hour ?? '00').padStart(2, '0')
  const mm = String(map.minute ?? '00').padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Projects a persisted DB staffing segment row into canonical HH:MM draft form
 * in Asia/Ho_Chi_Minh while strictly preserving zero technical counts (KT0).
 */
export function persistedSegmentToDraft(
  segment: PersistedStaffingSegment,
  timezone = DEFAULT_BUSINESS_TIMEZONE,
): PlannedStaffingSegmentDraft {
  return {
    segment_index: segment.segment_index,
    start_time: formatWallTimeInTimezone(segment.start_at, timezone),
    end_time: formatWallTimeInTimezone(segment.end_at, timezone),
    required_host_count: segment.required_host_count ?? 0,
    required_support_count: segment.required_support_count ?? 0,
    required_technical_count: segment.required_technical_count ?? 0,
    planned_host_names: [...(segment.planned_host_names ?? [])],
    planned_support_names: [...(segment.planned_support_names ?? [])],
    planned_technical_names: [...(segment.planned_technical_names ?? [])],
  }
}

/**
 * Normalizes either persisted DB segments or planned draft segments on a Shift
 * into one deterministic time-ordered list with resolved ISO timestamps.
 */
export function normalizeShiftSegments(
  shift: Pick<
    Shift,
    'date' | 'start_time' | 'end_time' | 'timezone' | 'persisted_staffing_segments' | 'staffing_segments'
  >,
): NormalizedShiftSegment[] {
  const tz = shift.timezone || DEFAULT_BUSINESS_TIMEZONE
  if (shift.persisted_staffing_segments && shift.persisted_staffing_segments.length > 0) {
    return [...shift.persisted_staffing_segments]
      .sort((a, b) => a.segment_index - b.segment_index || a.start_at.localeCompare(b.start_at) || a.id.localeCompare(b.id))
      .map(seg => {
        const startMs = new Date(seg.start_at).getTime()
        const endMs = new Date(seg.end_at).getTime()
        const durationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? Math.round((endMs - startMs) / 60_000)
          : 0
        return {
          ...persistedSegmentToDraft(seg, tz),
          segment_id: seg.id,
          start_at: new Date(seg.start_at).toISOString(),
          end_at: new Date(seg.end_at).toISOString(),
          duration_minutes: durationMinutes,
        }
      })
  }

  if (!shift.staffing_segments || shift.staffing_segments.length === 0) return []

  const draftSegments: NormalizedShiftSegment[] = []
  for (const seg of [...shift.staffing_segments].sort((a, b) => a.segment_index - b.segment_index)) {
    const resolved = resolveSegmentDateTime(
      shift.date,
      shift.start_time,
      shift.end_time,
      seg.start_time,
      seg.end_time,
      tz,
    )
    const fallbackStart = new Date(`2000-01-01T${seg.start_time}:00Z`)
    const fallbackEnd = new Date(`2000-01-${seg.end_time <= seg.start_time ? '02' : '01'}T${seg.end_time}:00Z`)
    const startAt = resolved?.valid && resolved.startAt ? resolved.startAt : fallbackStart
    const endAt = resolved?.valid && resolved.endAt ? resolved.endAt : fallbackEnd
    const durationMinutes = resolved?.valid && resolved.durationMinutes !== undefined
      ? resolved.durationMinutes
      : Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60_000))

    draftSegments.push({
      segment_index: seg.segment_index,
      start_time: seg.start_time,
      end_time: seg.end_time,
      required_host_count: seg.required_host_count ?? 0,
      required_support_count: seg.required_support_count ?? 0,
      required_technical_count: seg.required_technical_count ?? 0,
      planned_host_names: [...(seg.planned_host_names ?? [])],
      planned_support_names: [...(seg.planned_support_names ?? [])],
      planned_technical_names: [...(seg.planned_technical_names ?? [])],
      start_at: Number.isNaN(startAt.getTime()) ? '' : startAt.toISOString(),
      end_at: Number.isNaN(endAt.getTime()) ? '' : endAt.toISOString(),
      duration_minutes: durationMinutes,
    })
  }
  return draftSegments
}

/**
 * Exact half-open [startMs, endMs) sweep-line calculation for maximum concurrent
 * headcount demand. Contiguous boundaries process exits before entries so
 * sequential segments never double-count; overlapping segments sum accurately.
 */
export function computePeakConcurrentRequired(
  intervals: ReadonlyArray<{ startMs: number; endMs: number; count: number }>,
): number {
  const events: Array<{ time: number; delta: number; kind: 0 | 1 }> = []
  for (const item of intervals) {
    if (!Number.isFinite(item.startMs) || !Number.isFinite(item.endMs)) continue
    if (item.endMs <= item.startMs || item.count <= 0) continue
    events.push({ time: item.startMs, delta: item.count, kind: 1 })
    events.push({ time: item.endMs, delta: -item.count, kind: 0 })
  }
  if (events.length === 0) return 0
  events.sort((a, b) => a.time - b.time || a.kind - b.kind)
  let active = 0
  let peak = 0
  for (const ev of events) {
    active += ev.delta
    if (active > peak) peak = active
  }
  return peak
}

/**
 * Computes all seven canonical staffing semantics at both shift and segment levels
 * without merging pending requests into approved assignments or losing zero values.
 */
export function computeShiftStaffingMetrics(
  shift: Partial<Pick<Shift, 'id'>> & Pick<
    Shift,
    | 'date'
    | 'start_time'
    | 'end_time'
    | 'timezone'
    | 'duration_minutes'
    | 'required_host_count'
    | 'required_support_count'
    | 'required_technical_count'
    | 'persisted_staffing_segments'
    | 'staffing_segments'
    | 'staffing_summary'
  >,
  registrations: ReadonlyArray<StaffingRegistrationLike> = [],
): ShiftStaffingMetrics {
  const segments = normalizeShiftSegments(shift)
  const shiftRegistrations = shift.id ? registrations.filter(r => r.shift_id === shift.id) : []
  const tz = shift.timezone || DEFAULT_BUSINESS_TIMEZONE
  const shiftResolved = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, tz)
  const shiftDurationMinutes = shiftResolved?.valid
    ? shiftResolved.durationMinutes
    : Math.max(0, shift.duration_minutes ?? 0)

  const segmentBreakdowns: PersistedSegmentStaffingBreakdown[] = segments.map(seg => {
    const segRegs = seg.segment_id
      ? shiftRegistrations.filter(r => r.staffing_segment_id === seg.segment_id)
      : []

    const roleEntries = OPERATIONAL_ROLES.map(role => {
      const required = seg[ROLE_REQUIRED_FIELD[role]] ?? 0
      const roleRegs = segRegs.filter(r => r.operational_role === role)
      const approvedRegs = roleRegs.filter(r => isApprovedStatus(r.status))
      const pendingRegs = roleRegs.filter(r => r.status === 'pending')
      const uniquePeople = new Set(approvedRegs.map(r => r.user_id || r.id)).size
      const roleCounts: SegmentRoleStaffingCounts = {
        role,
        required,
        approved: approvedRegs.length,
        pending: pendingRegs.length,
        remaining: Math.max(0, required - approvedRegs.length),
        unique_people: uniquePeople,
        approved_registration_ids: approvedRegs.map(r => r.id),
        approved_user_ids: approvedRegs.map(r => r.user_id).filter(Boolean),
        pending_registration_ids: pendingRegs.map(r => r.id),
      }
      return [role, roleCounts] as const
    })

    return {
      segment_id: seg.segment_id,
      segment_index: seg.segment_index,
      start_time: seg.start_time,
      end_time: seg.end_time,
      start_at: seg.start_at,
      end_at: seg.end_at,
      duration_minutes: seg.duration_minutes,
      duration_hours: roundStaffHours(seg.duration_minutes),
      planned_host_names: seg.planned_host_names,
      planned_support_names: seg.planned_support_names,
      planned_technical_names: seg.planned_technical_names,
      roles: Object.fromEntries(roleEntries) as Record<OperationalRole, SegmentRoleStaffingCounts>,
    }
  })

  const roles = Object.fromEntries(
    OPERATIONAL_ROLES.map(role => {
      const summary = shift.staffing_summary?.find(s => s.role === role)
      const roleRegs = shiftRegistrations.filter(r => r.operational_role === role)
      const approvedRegs = roleRegs.filter(r => isApprovedStatus(r.status))
      const pendingRegs = roleRegs.filter(r => r.status === 'pending')

      if (segmentBreakdowns.length > 0) {
        const totalPositionsRequired = segmentBreakdowns.reduce(
          (sum, seg) => sum + seg.roles[role].required,
          0,
        )
        const peakConcurrentRequired = computePeakConcurrentRequired(
          segmentBreakdowns.map(seg => ({
            startMs: new Date(seg.start_at).getTime(),
            endMs: new Date(seg.end_at).getTime(),
            count: seg.roles[role].required,
          })),
        )
        const requiredStaffHours = roundStaffHours(
          segmentBreakdowns.reduce(
            (sum, seg) => sum + seg.roles[role].required * seg.duration_minutes,
            0,
          ),
        )
        const legacyUnsegmentedApproved = approvedRegs.filter(r => !r.staffing_segment_id).length
        const segmentRemainingSum = segmentBreakdowns.reduce(
          (sum, seg) => sum + seg.roles[role].remaining,
          0,
        )
        const rawApprovedCount = approvedRegs.length
        const rawPendingCount = pendingRegs.length
        const useSummaryTotals =
          Boolean(summary) &&
          rawApprovedCount === 0 &&
          rawPendingCount === 0 &&
          (summary!.approved > 0 || summary!.pending > 0)

        const approvedAssignments = useSummaryTotals ? summary!.approved : rawApprovedCount
        const pendingAssignments = useSummaryTotals ? summary!.pending : rawPendingCount
        const remainingVacancies = useSummaryTotals
          ? summary!.remaining
          : Math.max(0, segmentRemainingSum - legacyUnsegmentedApproved)

        const metrics: ShiftRoleStaffingMetrics = {
          role,
          peak_concurrent_required: peakConcurrentRequired,
          total_positions_required: totalPositionsRequired,
          unique_assigned_people: approvedRegs.length > 0
            ? new Set(approvedRegs.map(r => r.user_id || r.id)).size
            : approvedAssignments,
          approved_assignments: approvedAssignments,
          pending_assignments: pendingAssignments,
          remaining_vacancies: remainingVacancies,
          required_staff_hours: requiredStaffHours,
        }
        return [role, metrics] as const
      }

      const rawRequired = shift[ROLE_REQUIRED_FIELD[role]]
      const required = typeof rawRequired === 'number'
        ? rawRequired
        : summary?.required ?? (role === 'host' ? 1 : 0)
      const useSummaryTotals =
        Boolean(summary) &&
        approvedRegs.length === 0 &&
        pendingRegs.length === 0 &&
        (summary!.approved > 0 || summary!.pending > 0)
      const approvedAssignments = useSummaryTotals ? summary!.approved : approvedRegs.length
      const pendingAssignments = useSummaryTotals ? summary!.pending : pendingRegs.length

      const metrics: ShiftRoleStaffingMetrics = {
        role,
        peak_concurrent_required: required,
        total_positions_required: required,
        unique_assigned_people: approvedRegs.length > 0
          ? new Set(approvedRegs.map(r => r.user_id || r.id)).size
          : approvedAssignments,
        approved_assignments: approvedAssignments,
        pending_assignments: pendingAssignments,
        remaining_vacancies: useSummaryTotals
          ? summary!.remaining
          : Math.max(0, required - approvedAssignments),
        required_staff_hours: roundStaffHours(required * shiftDurationMinutes),
      }
      return [role, metrics] as const
    }),
  ) as Record<OperationalRole, ShiftRoleStaffingMetrics>

  const approvedShiftRegs = shiftRegistrations.filter(r => isApprovedStatus(r.status))
  const totalUniquePeople = approvedShiftRegs.length > 0
    ? new Set(approvedShiftRegs.map(r => r.user_id || r.id)).size
    : OPERATIONAL_ROLES.reduce((sum, r) => sum + roles[r].unique_assigned_people, 0)

  const totals = {
    peak_concurrent_required: OPERATIONAL_ROLES.reduce((sum, r) => sum + roles[r].peak_concurrent_required, 0),
    total_positions_required: OPERATIONAL_ROLES.reduce((sum, r) => sum + roles[r].total_positions_required, 0),
    unique_assigned_people: totalUniquePeople,
    approved_assignments: OPERATIONAL_ROLES.reduce((sum, r) => sum + roles[r].approved_assignments, 0),
    pending_assignments: OPERATIONAL_ROLES.reduce((sum, r) => sum + roles[r].pending_assignments, 0),
    remaining_vacancies: OPERATIONAL_ROLES.reduce((sum, r) => sum + roles[r].remaining_vacancies, 0),
    required_staff_hours: Math.round(
      OPERATIONAL_ROLES.reduce((sum, r) => sum + roles[r].required_staff_hours, 0) * 100,
    ) / 100,
  }

  return {
    shift_id: shift.id || '',
    has_segments: segmentBreakdowns.length > 0,
    segment_count: segmentBreakdowns.length,
    roles,
    totals,
    segments: segmentBreakdowns,
  }
}

/**
 * Formats segment drafts as canonical `K01 HH:MM-HH:MM H# T# KT#` lines for
 * re-parse round-trips in preview/draft editors without losing segment counts.
 */
export function segmentDraftToCanonicalLines(
  segments: readonly PlannedStaffingSegmentDraft[],
): string {
  return [...segments]
    .sort((a, b) => a.segment_index - b.segment_index)
    .map(seg => {
      const idx = `K${String(seg.segment_index).padStart(2, '0')}`
      return `${idx} ${seg.start_time}-${seg.end_time} H${seg.required_host_count} T${seg.required_support_count} KT${seg.required_technical_count}`
    })
    .join('\n')
}
