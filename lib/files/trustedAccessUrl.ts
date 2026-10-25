/**
 * Security validator for operational file access URLs.
 * Rejects unsafe protocols (javascript:, vbscript:, data:, blob:) and untrusted hosts.
 */
export function isTrustedAccessUrl(url: string | null | undefined, expectedProvider?: string): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false

  // Reject all script injection and non-standard pseudo-protocols
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('file:') ||
    lower.startsWith('about:')
  ) {
    return false
  }

  // Internal relative API endpoints are backend-verified and trusted
  if (trimmed.startsWith('/api/operational-files') || trimmed.startsWith('/api/report-artifacts')) {
    return true
  }

  // Cloud provider and external links MUST use secure HTTPS
  if (!lower.startsWith('https://')) {
    return false
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()

    // Disallow raw IP addresses and localhost
    if (!hostname || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname === 'localhost') {
      return false
    }

    // Google Drive trusted domains
    const isGoogleDriveDomain =
      hostname === 'drive.google.com' ||
      hostname === 'docs.google.com' ||
      hostname.endsWith('.drive.google.com') ||
      hostname.endsWith('.docs.google.com')

    // Microsoft OneDrive / SharePoint trusted domains
    const isOneDriveDomain =
      hostname === 'onedrive.live.com' ||
      hostname === 'onedrive.com' ||
      hostname.endsWith('.onedrive.com') ||
      hostname === '1drv.ms' ||
      hostname.endsWith('.sharepoint.com') ||
      hostname.endsWith('.onedrive.live.com')

    // Backend storage (e.g. Supabase storage)
    const isSupabaseDomain = hostname.endsWith('.supabase.co')

    if (expectedProvider === 'google_drive') {
      return isGoogleDriveDomain
    }

    if (expectedProvider === 'onedrive') {
      return isOneDriveDomain
    }

    return isGoogleDriveDomain || isOneDriveDomain || isSupabaseDomain
  } catch {
    return false
  }
}
