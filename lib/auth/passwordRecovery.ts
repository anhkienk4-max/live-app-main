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
