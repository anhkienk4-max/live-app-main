import 'server-only'

import { OneDriveError } from '@/lib/server/oneDriveAuth'

export function isValidOneDriveItemId(value: string): boolean {
  return /^[A-Za-z0-9_-]+(?:![A-Za-z0-9_-]+)*$/.test(value)
}

function invalid(): never {
  throw new OneDriveError('ONEDRIVE_FILE_ID_INVALID', 'Invalid OneDrive item ID or URL.')
}

/** Normalize only raw Graph IDs and canonical Microsoft Graph item URLs. */
export function normalizeOneDriveItemId(value: string): string {
  const raw = String(value ?? '').trim()
  if (isValidOneDriveItemId(raw)) return raw
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return invalid()
  }
  if (url.hostname.toLowerCase() === '1drv.ms') {
    throw new OneDriveError('ONEDRIVE_SHARE_LINK_REMOTE_REQUIRED', 'OneDrive short links require explicit remote resolution.')
  }
  if (url.hostname.toLowerCase() !== 'graph.microsoft.com') return invalid()
  const segments = url.pathname.split('/').filter(Boolean).map(segment => {
    try { return decodeURIComponent(segment) } catch { return segment }
  })
  const itemIndex = segments.indexOf('items')
  const id = itemIndex >= 0 ? segments[itemIndex + 1] : undefined
  if (!id || !isValidOneDriveItemId(id)) return invalid()
  return id
}

/** Classify share links without performing a hidden network request. */
export function classifyOneDriveLink(value: string): 'local_id' | 'graph_url' | 'remote_share_link' {
  const raw = String(value ?? '').trim()
  if (isValidOneDriveItemId(raw)) return 'local_id'
  let url: URL
  try { url = new URL(raw) } catch { return invalid() }
  const host = url.hostname.toLowerCase()
  if (host === '1drv.ms' || host === 'onedrive.live.com' || host.endsWith('.sharepoint.com')) return 'remote_share_link'
  if (host === 'graph.microsoft.com') return 'graph_url'
  return invalid()
}
