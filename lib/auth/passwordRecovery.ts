const NON_ENUMERATING_ERROR_CODES = new Set([
  'user_not_found',
  'email_not_found',
])

/**
 * Supabase normally returns no error for an unknown email. Some providers or
 * self-hosted GoTrue versions return a documented not-found code instead;
 * those must retain the same generic success UX without hiding real outages.
 */
export function isNonEnumeratingPasswordRecoveryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as Record<string, unknown>
  return [record.code, record.error_code, record.errorCode]
    .some(value => typeof value === 'string' && NON_ENUMERATING_ERROR_CODES.has(value.toLowerCase()))
}

export type PasswordSecurityErrorKind = 'leaked' | 'weak' | 'unknown'

export function classifyPasswordSecurityError(error: unknown): PasswordSecurityErrorKind {
  if (!error || typeof error !== 'object') return 'unknown'
  const record = error as Record<string, unknown>
  const code = [record.code, record.error_code, record.errorCode]
    .find(value => typeof value === 'string')
    ?.toLowerCase()
  const reasons = Array.isArray(record.reasons)
    ? record.reasons.filter((value): value is string => typeof value === 'string').map(value => value.toLowerCase())
    : []
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : ''

  if (reasons.some(reason => ['pwned', 'leaked', 'compromised'].includes(reason))
    || /pwned|leaked|breach|compromised/.test(message)) {
    return 'leaked'
  }
  if (code === 'weak_password') return 'weak'
  return 'unknown'
}
