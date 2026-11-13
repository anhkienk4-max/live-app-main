/**
 * RC19 G6 — originating-context return for cross-module edit flows.
 * A caller appends `return_to=<current path+query>`; the destination returns there after save/close.
 * Only same-origin relative paths are accepted (no open redirect).
 */
export const RETURN_TO_PARAM = 'return_to'

const MAX_LENGTH = 2048

export function sanitizeReturnPath(raw: string | null | undefined): string | null {
  // `raw` is already URL-decoded (URLSearchParams.get). Never decode again: encoded filters must survive.
  if (!raw) return null
  if (raw.length > MAX_LENGTH) return null
  const value = raw
  if (!value.startsWith('/')) return null
  // Block protocol-relative, backslash tricks, control characters and embedded schemes.
  if (value.startsWith('//') || value.includes('\\')) return null
  if (/[\u0000-\u001f]/.test(value)) return null
  if (/^\/[^?#]*:\/\//.test(value)) return null
  return value
}

export function withReturnTo(targetHref: string, currentPathAndSearch: string): string {
  const safe = sanitizeReturnPath(currentPathAndSearch)
  if (!safe) return targetHref
  const joiner = targetHref.includes('?') ? '&' : '?'
  return `${targetHref}${joiner}${RETURN_TO_PARAM}=${encodeURIComponent(safe)}`
}
