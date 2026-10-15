import { isValidIanaTimeZone, zonedWallTimeToUtc, DEFAULT_BUSINESS_TIMEZONE } from '@/lib/utils/shiftUtils'

export function actualPickerValue(instant: string, timezone = DEFAULT_BUSINESS_TIMEZONE): string {
  if (!isValidIanaTimeZone(timezone) || !Number.isFinite(Date.parse(instant))) throw new Error('WORKFORCE_TIME_INVALID')
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant))
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

export function actualPickerInstant(value: string, timezone = DEFAULT_BUSINESS_TIMEZONE): string {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value) || !isValidIanaTimeZone(timezone)) throw new Error('WORKFORCE_TIME_INVALID')
  const instant = zonedWallTimeToUtc(value.slice(0, 10), value.slice(11), timezone)
  if (!Number.isFinite(instant.getTime()) || actualPickerValue(instant.toISOString(), timezone) !== value) throw new Error('WORKFORCE_TIME_INVALID')
  return instant.toISOString()
}
