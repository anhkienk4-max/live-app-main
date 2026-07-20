export interface CurrencyFormatSettings {
  locale: string
  currency: string
  minimumFractionDigits: number
  maximumFractionDigits: number
}

export const DEFAULT_CURRENCY_SETTINGS: CurrencyFormatSettings = {
  locale: 'vi-VN',
  currency: 'VND',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
}

export function formatCurrency(
  value: number | null | undefined,
  settings: Partial<CurrencyFormatSettings> = {},
): string {
  const resolved = { ...DEFAULT_CURRENCY_SETTINGS, ...settings }
  return new Intl.NumberFormat(resolved.locale, {
    style: 'currency',
    currency: resolved.currency,
    minimumFractionDigits: resolved.minimumFractionDigits,
    maximumFractionDigits: resolved.maximumFractionDigits,
  }).format(Number.isFinite(value) ? Number(value) : 0)
}

export function getExcelCurrencyNumberFormat(
  settings: Partial<CurrencyFormatSettings> = {},
): string {
  const resolved = { ...DEFAULT_CURRENCY_SETTINGS, ...settings }
  const decimals = resolved.maximumFractionDigits > 0
    ? `.${'0'.repeat(resolved.maximumFractionDigits)}`
    : ''
  return `#,##0${decimals} "${resolved.currency}"`
}
