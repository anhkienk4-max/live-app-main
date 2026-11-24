import type {
  AgencyCode,
  ExecutionSource,
  PersistedStaffingSegment,
  PlannedStaffingSegmentDraft,
  Shift,
  ShiftStaffingMetrics,
  ShiftStaffingSummary,
} from '@/lib/types/database.types'
import { DEFAULT_BUSINESS_TIMEZONE } from '@/lib/utils/shiftUtils'
import {
  computeShiftStaffingMetrics,
  formatWallTimeInTimezone,
  OPERATIONAL_ROLES,
  type StaffingRegistrationLike,
} from '@/lib/utils/staffingSemantics'

export interface ReadbackVerificationResult {
  ok: boolean
  mismatches: string[]
  snapshot: {
    shift_id: string
    date: string
    start_time: string
    end_time: string
    agency_code: AgencyCode | null
    execution_source: ExecutionSource | null
    brand_id: string
    platform_id: string
    segment_count: number
    metrics: ShiftStaffingMetrics
  }
}

const sortExpectedSegments = (segments: readonly PlannedStaffingSegmentDraft[]) =>
  [...segments].sort((a, b) => a.segment_index - b.segment_index)

const sortPersistedSegments = (segments: readonly PersistedStaffingSegment[]) =>
  [...segments].sort((a, b) => a.segment_index - b.segment_index || a.start_at.localeCompare(b.start_at) || a.id.localeCompare(b.id))

/**
 * Verifies persisted PostgreSQL / store state read back after create or
 * reconciliation against expected shift, segment, assignment, and counter state.
 */
export function verifyImportedShiftReadback(input: {
  expected: Omit<Shift, 'id' | 'created_at' | 'updated_at'>
  persisted: Shift
  persistedSegments?: PersistedStaffingSegment[]
  registrations?: StaffingRegistrationLike[]
  staffingSummary?: ShiftStaffingSummary[]
  previousRegistrations?: StaffingRegistrationLike[]
  previousSegments?: PersistedStaffingSegment[]
}): ReadbackVerificationResult {
  const {
    expected,
    persisted,
    registrations = [],
    staffingSummary,
    previousRegistrations,
    previousSegments,
  } = input
  const mismatches: string[] = []
  const persSegs = sortPersistedSegments(
    input.persistedSegments ?? persisted.persisted_staffing_segments ?? [],
  )
  const expSegs = sortExpectedSegments(expected.staffing_segments ?? [])
  const tz = persisted.timezone || expected.timezone || DEFAULT_BUSINESS_TIMEZONE

  if (!persisted.id) mismatches.push('missing_shift_id')
  if (persisted.date !== expected.date) {
    mismatches.push(`date_mismatch:${expected.date}->${persisted.date}`)
  }
  if (persisted.start_time.slice(0, 5) !== expected.start_time.slice(0, 5)) {
    mismatches.push(`start_time_mismatch:${expected.start_time}->${persisted.start_time}`)
  }
  if (persisted.end_time.slice(0, 5) !== expected.end_time.slice(0, 5)) {
    mismatches.push(`end_time_mismatch:${expected.end_time}->${persisted.end_time}`)
  }
  if (persisted.brand_id !== expected.brand_id) {
    mismatches.push(`brand_id_mismatch:${expected.brand_id}->${persisted.brand_id}`)
  }
  if (persisted.platform_id !== expected.platform_id) {
    mismatches.push(`platform_id_mismatch:${expected.platform_id}->${persisted.platform_id}`)
  }
  if (expected.agency_code && (persisted.agency_code ?? null) !== expected.agency_code) {
    mismatches.push(`agency_code_mismatch:${expected.agency_code}->${persisted.agency_code ?? 'null'}`)
  }
  if (expected.execution_source && (persisted.execution_source ?? null) !== expected.execution_source) {
    mismatches.push(`execution_source_mismatch:${expected.execution_source}->${persisted.execution_source ?? 'null'}`)
  }

  if (persSegs.length !== expSegs.length) {
    mismatches.push(`segment_count_mismatch:${expSegs.length}->${persSegs.length}`)
  } else if (expSegs.length > 0) {
    for (let i = 0; i < expSegs.length; i += 1) {
      const expSeg = expSegs[i]
      const actSeg = persSegs[i]
      const label = `K${String(expSeg.segment_index).padStart(2, '0')}`
      if (actSeg.segment_index !== expSeg.segment_index) {
        mismatches.push(`${label}_index_mismatch:${expSeg.segment_index}->${actSeg.segment_index}`)
      }
      const actStart = formatWallTimeInTimezone(actSeg.start_at, tz)
      const actEnd = formatWallTimeInTimezone(actSeg.end_at, tz)
      if (actStart !== expSeg.start_time || actEnd !== expSeg.end_time) {
        mismatches.push(`${label}_time_mismatch:${expSeg.start_time}-${expSeg.end_time}->${actStart}-${actEnd}`)
      }
      if ((actSeg.required_host_count ?? -1) !== expSeg.required_host_count) {
        mismatches.push(`${label}_host_mismatch:${expSeg.required_host_count}->${actSeg.required_host_count}`)
      }
      if ((actSeg.required_support_count ?? -1) !== expSeg.required_support_count) {
        mismatches.push(`${label}_support_mismatch:${expSeg.required_support_count}->${actSeg.required_support_count}`)
      }
      if ((actSeg.required_technical_count ?? -1) !== expSeg.required_technical_count) {
        mismatches.push(`${label}_tech_mismatch:${expSeg.required_technical_count}->${actSeg.required_technical_count}`)
      }
    }

    const peakHost = Math.max(...expSegs.map(s => s.required_host_count))
    const peakSupport = Math.max(...expSegs.map(s => s.required_support_count))
    const peakTech = Math.max(...expSegs.map(s => s.required_technical_count))
    if ((persisted.required_host_count ?? -1) !== peakHost) {
      mismatches.push(`parent_peak_host_mismatch:${peakHost}->${persisted.required_host_count}`)
    }
    if ((persisted.required_support_count ?? -1) !== peakSupport) {
      mismatches.push(`parent_peak_support_mismatch:${peakSupport}->${persisted.required_support_count}`)
    }
    if ((persisted.required_technical_count ?? -1) !== peakTech) {
      mismatches.push(`parent_peak_tech_mismatch:${peakTech}->${persisted.required_technical_count}`)
    }
  } else {
    const expHost = expected.required_host_count ?? 0
    const expSupport = expected.required_support_count ?? 0
    const expTech = expected.required_technical_count ?? 0
    if ((persisted.required_host_count ?? -1) !== expHost) {
      mismatches.push(`parent_host_mismatch:${expHost}->${persisted.required_host_count}`)
    }
    if ((persisted.required_support_count ?? -1) !== expSupport) {
      mismatches.push(`parent_support_mismatch:${expSupport}->${persisted.required_support_count}`)
    }
    if ((persisted.required_technical_count ?? -1) !== expTech) {
      mismatches.push(`parent_tech_mismatch:${expTech}->${persisted.required_technical_count}`)
    }
  }

  if (previousRegistrations && previousRegistrations.length > 0) {
    const activePrev = previousRegistrations.filter(r =>
      r.shift_id === persisted.id && ['pending', 'approved', 'manually_assigned'].includes(r.status),
    )
    const currentById = new Map(registrations.map(r => [r.id, r]))
    for (const prevReg of activePrev) {
      const curReg = currentById.get(prevReg.id)
      if (!curReg) {
        mismatches.push(`missing_existing_registration:${prevReg.id}`)
      } else {
        if ((curReg.staffing_segment_id ?? null) !== (prevReg.staffing_segment_id ?? null)) {
          mismatches.push(`moved_registration_segment:${prevReg.id}`)
        }
        if (curReg.status !== prevReg.status || curReg.operational_role !== prevReg.operational_role || curReg.user_id !== prevReg.user_id) {
          mismatches.push(`mutated_registration:${prevReg.id}`)
        }
      }
    }
  }

  if (previousSegments && previousSegments.length > 0 && previousRegistrations) {
    const referencedIds = new Set(
      previousRegistrations
        .filter(r => r.shift_id === persisted.id && r.staffing_segment_id)
        .map(r => r.staffing_segment_id!),
    )
    const currentSegIds = new Set(persSegs.map(s => s.id))
    for (const segId of referencedIds) {
      if (!currentSegIds.has(segId)) {
        mismatches.push(`dropped_referenced_segment_id:${segId}`)
      }
    }
  }

  const metrics = computeShiftStaffingMetrics(
    {
      ...persisted,
      persisted_staffing_segments: persSegs,
      staffing_segments: expSegs.length > 0 ? expSegs : persisted.staffing_segments,
      staffing_summary: staffingSummary ?? persisted.staffing_summary,
    },
    registrations,
  )

  if (staffingSummary && staffingSummary.length > 0) {
    for (const role of OPERATIONAL_ROLES) {
      const sumRow = staffingSummary.find(s => s.role === role)
      const calc = metrics.roles[role]
      if (!sumRow) {
        mismatches.push(`summary_missing_role:${role}`)
      } else {
        if (sumRow.required !== calc.total_positions_required) {
          mismatches.push(`summary_${role}_required:${calc.total_positions_required}->${sumRow.required}`)
        }
        if (registrations.length > 0) {
          if (sumRow.approved !== calc.approved_assignments) {
            mismatches.push(`summary_${role}_approved:${calc.approved_assignments}->${sumRow.approved}`)
          }
          if (sumRow.pending !== calc.pending_assignments) {
            mismatches.push(`summary_${role}_pending:${calc.pending_assignments}->${sumRow.pending}`)
          }
          if (sumRow.remaining !== calc.remaining_vacancies) {
            mismatches.push(`summary_${role}_remaining:${calc.remaining_vacancies}->${sumRow.remaining}`)
          }
        }
      }
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    snapshot: {
      shift_id: persisted.id,
      date: persisted.date,
      start_time: persisted.start_time.slice(0, 5),
      end_time: persisted.end_time.slice(0, 5),
      agency_code: persisted.agency_code ?? null,
      execution_source: persisted.execution_source ?? null,
      brand_id: persisted.brand_id,
      platform_id: persisted.platform_id,
      segment_count: persSegs.length,
      metrics,
    },
  }
}
