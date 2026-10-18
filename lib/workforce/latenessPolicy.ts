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

export const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh'

export function isValidIanaTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format()
    return true
  } catch {
    return false
  }
}

/**
 * Returns YYYY-MM-DD date representation in the given IANA timezone.
 * Pure and strictly independent of runtime OS local timezone (no Date#getDate).
 */
export function getBusinessDateInZone(timestampMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestampMs))

  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error('FAILED_TO_FORMAT_BUSINESS_DATE')
  }
  return `${year}-${month}-${day}`
}

/**
 * Returns formatted offset string e.g. "+07:00", "-04:00", "+00:00" for a timestamp in a timezone.
 */
export function getTimeZoneOffsetString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const tzPart = parts.find(p => p.type === 'timeZoneName')
  if (tzPart && tzPart.value) {
    if (tzPart.value === 'GMT') return '+00:00'
    const m = tzPart.value.match(/GMT([+-]\d{2}:\d{2})/)
    if (m) return m[1]
  }
  return '+00:00'
}

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yStr = dt.getUTCFullYear().toString().padStart(4, '0')
  const mStr = (dt.getUTCMonth() + 1).toString().padStart(2, '0')
  const dStr = dt.getUTCDate().toString().padStart(2, '0')
  return `${yStr}-${mStr}-${dStr}`
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
 * Strictly evaluates dates in the business timezone without host runtime getDate() bias.
 * Rejects invalid/unsupported timezones with INVALID_TIMEZONE rather than silently coercing.
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
  // If timezone is specified explicitly, it must be a valid IANA timezone.
  // Never silently coerce unsupported/invalid timezone to +07:00.
  let effectiveTimezone = DEFAULT_BUSINESS_TIMEZONE
  if (shift.timezone !== undefined && shift.timezone !== null) {
    if (!isValidIanaTimeZone(shift.timezone)) {
      throw new Error('INVALID_TIMEZONE')
    }
    effectiveTimezone = shift.timezone
  }

  // If authoritative start_at and end_at already exist in DB, evaluate interval and midnight crossing
  if (shift.start_at && shift.end_at) {
    const startMs = parseEpoch(shift.start_at)
    const endMs = parseEpoch(shift.end_at)
    if (endMs <= startMs) throw new Error('INVALID_SHIFT_INTERVAL_ORDER')
    const durationMinutes = Math.round((endMs - startMs) / 60_000)

    // Evaluate midnight crossing strictly in the business timezone, never runtime getDate()
    let crossesMidnight: boolean
    if (shift.crosses_midnight !== undefined && shift.crosses_midnight !== null) {
      crossesMidnight = Boolean(shift.crosses_midnight)
    } else {
      const startDateInZone = getBusinessDateInZone(startMs, effectiveTimezone)
      const endDateInZone = getBusinessDateInZone(endMs, effectiveTimezone)
      crossesMidnight = startDateInZone !== endDateInZone
    }

    return {
      startIso: shift.start_at,
      endIso: shift.end_at,
      crossesMidnight,
      durationMinutes,
    }
  }

  const startTime = shift.start_time.slice(0, 5)
  const endTime = shift.end_time.slice(0, 5)

  const startDate = shift.date
  let endDate = shift.end_date

  const [sH, sM] = startTime.split(':').map(Number)
  const [eH, eM] = endTime.split(':').map(Number)
  if (
    !Number.isInteger(sH) || !Number.isInteger(sM) ||
    !Number.isInteger(eH) || !Number.isInteger(eM) ||
    sH < 0 || sH > 23 || sM < 0 || sM > 59 ||
    eH < 0 || eH > 23 || eM < 0 || eM > 59
  ) {
    throw new Error('INVALID_TIME_FORMAT')
  }

  const crosses = Boolean(shift.crosses_midnight || (eH * 60 + eM <= sH * 60 + sM))

  if (!endDate) {
    endDate = crosses ? addCalendarDays(startDate, 1) : startDate
  }

  // Calculate zoned wall time and offset using the validated IANA timezone
  const startWallUtc = new Date(Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10)),
    sH, sM
  ))
  const endWallUtc = new Date(Date.UTC(
    Number(endDate.slice(0, 4)),
    Number(endDate.slice(5, 7)) - 1,
    Number(endDate.slice(8, 10)),
    eH, eM
  ))

  const startOffset = getTimeZoneOffsetString(startWallUtc, effectiveTimezone)
  const endOffset = getTimeZoneOffsetString(endWallUtc, effectiveTimezone)

  const startIso = `${startDate}T${startTime}:00${startOffset}`
  const endIso = `${endDate}T${endTime}:00${endOffset}`

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
