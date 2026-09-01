export type AuthCodeErrorReason =
  | 'expired_link'
  | 'google_not_authorized'
  | 'oauth_error'

const GOOGLE_HOOK_DENIAL_MARKER = 'google account creation is not allowed'

/**
 * Supabase Auth propagates a Before User Created hook error in the OAuth
 * callback's error_description. This presentation-only match never grants or
 * denies application access.
 */
export function classifyGoogleOAuthError(
  errorDescription: string | null | undefined,
): Exclude<AuthCodeErrorReason, 'expired_link'> {
  const normalized = errorDescription?.replace(/\s+/g, ' ').trim().toLowerCase()
  return normalized?.includes(GOOGLE_HOOK_DENIAL_MARKER)
    ? 'google_not_authorized'
    : 'oauth_error'
}
