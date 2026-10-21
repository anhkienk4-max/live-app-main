export function workforcePeriodRange(period: string) {
  if (/^\d{4}$/u.test(period)) return { from: `${period}-01-01`, to: `${period}-12-31` }
  const [year, month] = period.split('-').map(Number)
  return {
    from: `${period}-01`,
    to: `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`,
  }
}
