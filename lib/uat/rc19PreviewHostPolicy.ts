/**
 * Offline, fail-closed host boundary for the manual RC19 Staging-backed UAT.
 * This does not validate deployment configuration or runtime credentials.
 */
export type PreviewHostRejection = 'PRODUCTION_APP_HOST' | 'FOREIGN_VERCEL_PREVIEW' | null

export function classifyRc19PreviewHost(
  requestUrl: URL,
  approvedPreviewOrigin: string,
): PreviewHostRejection {
  const hostname = requestUrl.hostname.toLowerCase()
  if (hostname === 'ops5729.top' || hostname.endsWith('.ops5729.top')) {
    return 'PRODUCTION_APP_HOST'
  }
  if (hostname.endsWith('.vercel.app') && requestUrl.origin !== approvedPreviewOrigin) {
    return 'FOREIGN_VERCEL_PREVIEW'
  }
  return null
}
