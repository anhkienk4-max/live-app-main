const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
export const formatChartAxis = (value: number, currency = false) => `${compactNumber.format(value)}${currency ? ' \u20ab' : ''}`
export const formatDimensionTick = (value: string) => value.length > 12 ? `${value.slice(0, 11)}\u2026` : value
