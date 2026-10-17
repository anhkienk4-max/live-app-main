/**
 * RC1.7A: Auditable, configurable lateness and interval evaluation policy.
 * Distinguishes actual_late_minutes from late_after_grace.
 * Pure domain logic: no DB queries, no implicit grace assumptions.
 */

export interface LatenessEvaluation {
  /** Signed difference in minutes: positive = clocked in after scheduled start; <= 0 = on time or early */
  actualLateMinutes: number
  /** Net late minutes exceeding grace threshold: max(0, actualLateMinutes - graceMinutes) */
  lateAfterGraceMinutes: number
  /** True strictly when actualLateMinutes > graceMinutes */
  isLate: boolean
  /** True when clocked in late but within the allowed grace period (0 < actualLateMinutes <= graceMinutes) */
  isWithinGrace: boolean
  /** True when clocked in on or before scheduled start (actualLateMinutes <= 0) */
  isOnTime: boolean
  /** The explicit grace period applied for this evaluation (in minutes) */
  graceMinutes: number
}

export interface ShiftIntervalResolution {
  startIso: string
  endIso: string
  crossesMidnight: boolean
  durationMinutes: number
}

function parseEpoch(zonedIso: string | number): number {
  if (typeof zonedIso === 'number') return zonedIso
  const ms = Date.parse(zonedIso)
  if (!Number.isFinite(ms)) throw new Error('INVALID_ISO_TIMESTAMP')
  return ms
}

/**
 * Evaluates lateness against an explicit grace period.
 * Does NOT assume a default grace period: graceMinutes must be provided explicitly.
 */
export function evaluateLateness(
  actualStartAt: string | number,
  scheduledStartAt: string | number,
  graceMinutes: number,
): LatenessEvaluation {
  if (!Number.isSafeInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 180) {
    throw new Error('INVALID_GRACE_PERIOD')
  }

  const actualMs = parseEpoch(actualStartAt)
  const scheduledMs = parseEpoch(scheduledStartAt)
  const actualLateMinutes = Math.round((actualMs - scheduledMs) / 60_000)

  const lateAfterGraceMinutes = Math.max(0, actualLateMinutes - graceMinutes)
  const isLate = actualLateMinutes > graceMinutes
  const isWithinGrace = actualLateMinutes > 0 && actualLateMinutes <= graceMinutes
  const isOnTime = actualLateMinutes <= 0

  return {
    actualLateMinutes,
    lateAfterGraceMinutes,
    isLate,
    isWithinGrace,
    isOnTime,
    graceMinutes,
  }
}

/**
 * Evaluates overtime and early departure for a completed segment against scheduled end.
 */
export function evaluateEndVariance(
  actualEndAt: string | number,
  scheduledEndAt: string | number,
): {
  overtimeMinutes: number
  earlyDepartureMinutes: number
  diffMinutes: number
} {
  const actualMs = parseEpoch(actualEndAt)
  const scheduledMs = parseEpoch(scheduledEndAt)
  const diffMinutes = Math.round((actualMs - scheduledMs) / 60_000)

  return {
    diffMinutes,
    overtimeMinutes: Math.max(0, diffMinutes),
    earlyDepartureMinutes: Math.max(0, -diffMinutes),
  }
}

/**
 * Resolves full ISO zoned timestamps for a shift, properly handling overnight shifts
 * that cross midnight (e.g. 23:00 to 02:00 next day).
 */
export function resolveShiftPlannedInterval(shift: {
  date: string
  start_time: string
  end_time: string
  start_at?: string | null
  end_at?: string | null
  end_date?: string | null
  crosses_midnight?: boolean | null
  timezone?: string | null
}): ShiftIntervalResolution {
  // If authoritative start_at and end_at already exist in DB, use them
  if (shift.start_at && shift.end_at) {
    const startMs = parseEpoch(shift.start_at)
    const endMs = parseEpoch(shift.end_at)
    if (endMs <= startMs) throw new Error('INVALID_SHIFT_INTERVAL_ORDER')
    const durationMinutes = Math.round((endMs - startMs) / 60_000)
    const crossesMidnight = Boolean(shift.crosses_midnight ?? (new Date(endMs).getDate() !== new Date(startMs).getDate()))
    return {
      startIso: shift.start_at,
      endIso: shift.end_at,
      crossesMidnight,
      durationMinutes,
    }
  }

  const tz = shift.timezone === 'Asia/Ho_Chi_Minh' || !shift.timezone ? '+07:00' : '+07:00'
  const startTime = shift.start_time.slice(0, 5)
  const endTime = shift.end_time.slice(0, 5)

  const startDate = shift.date
  let endDate = shift.end_date

  // Compute midnight crossing if end_time <= start_time
  const [sH, sM] = startTime.split(':').map(Number)
  const [eH, eM] = endTime.split(':').map(Number)
  const crosses = Boolean(shift.crosses_midnight || (eH * 60 + eM <= sH * 60 + sM))

  if (!endDate) {
    if (crosses) {
      const d = new Date(startDate + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      endDate = d.toISOString().slice(0, 10)
    } else {
      endDate = startDate
    }
  }

  const startIso = `${startDate}T${startTime}:00${tz}`
  const endIso = `${endDate}T${endTime}:00${tz}`

  const startMs = parseEpoch(startIso)
  const endMs = parseEpoch(endIso)
  if (endMs <= startMs) throw new Error('RESOLVED_END_MUST_BE_AFTER_START')

  return {
    startIso,
    endIso,
    crossesMidnight: crosses,
    durationMinutes: Math.round((endMs - startMs) / 60_000),
  }
}
