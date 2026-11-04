export function workforcePeriodRange(period: string) {
  if (/^\d{4}$/u.test(period)) return { from: `${period}-01-01`, to: `${period}-12-31` }
  const [year, month] = period.split('-').map(Number)
  return {
    from: `${period}-01`,
    to: `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`,
  }
}

export function parseWorkforceYearDraft(value: string): { draft: string; period?: string } | null {
  if (!/^\d{0,4}$/u.test(value)) return null
  return /^\d{4}$/u.test(value) ? { draft: value, period: value } : { draft: value }
}
