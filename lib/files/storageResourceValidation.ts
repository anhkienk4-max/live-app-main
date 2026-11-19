export type RegistryProvider = 'google_drive' | 'onedrive'

export type ResourceVerificationStatus = 'verified_metadata' | 'broken' | 'verification_error'

export function classifyResourceVerificationError(error: unknown): ResourceVerificationStatus {
  if (!(error instanceof Error)) return 'verification_error'
  return /(?:NOT_FOUND|FILE_NOT_FOUND|ITEM_NOT_FOUND)/iu.test(error.message) ? 'broken' : 'verification_error'
}

export function validateCanonicalResourceReference(provider: RegistryProvider, rawUrl: string, canonicalId: string) {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('RESOURCE_URL_INVALID') }
  const host = url.hostname.toLowerCase()
  const allowedHost = provider === 'google_drive'
    ? ['drive.google.com', 'www.drive.google.com', 'docs.google.com'].includes(host)
    : host === 'onedrive.live.com' || /^[a-z0-9-]+\.sharepoint\.com$/u.test(host)
  const validId = provider === 'google_drive'
    ? /^[A-Za-z0-9_-]+$/u.test(canonicalId)
    : /^[A-Za-z0-9_-]+(?:![A-Za-z0-9_-]+)*$/u.test(canonicalId)
  const encodedPathEscape = /%(?:2e|2f|5c)/iu.test(rawUrl)
  const rawPath = rawUrl.match(/^https:\/\/[^/]+(\/[^?#]*)?/iu)?.[1] ?? ''
  const literalTraversal = /(?:^|\/)\.{1,2}(?:\/|$)/u.test(rawPath) || rawPath.includes('\\')
  const unsafePath = url.pathname.split('/').some(part => {
    let decoded = part
    try { decoded = decodeURIComponent(part) } catch { return true }
    return decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')
  })
  if (!allowedHost || url.protocol !== 'https:' || url.username || url.password || url.port
    || url.search || url.hash || unsafePath || encodedPathEscape || literalTraversal || !validId || !url.pathname || url.pathname === '/') {
    throw new Error('RESOURCE_REFERENCE_INVALID')
  }
  if (provider === 'google_drive') {
    const segments = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part))
    const documentId = segments[0] === 'drive' && segments[1] === 'folders'
      ? segments[2]
      : ['file', 'document', 'spreadsheets', 'presentation', 'forms'].includes(segments[0]) && segments[1] === 'd'
        ? segments[2]
        : segments[0] === 'drive' && segments[1] === 'u' && segments[3] === 'folders'
          ? segments[4]
          : undefined
    if (documentId !== canonicalId) throw new Error('RESOURCE_REFERENCE_MISMATCH')
  }
  return { canonicalId, canonicalUrl: url.toString().replace(/\/$/u, '') }
}
