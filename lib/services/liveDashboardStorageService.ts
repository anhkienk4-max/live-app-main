import { MAX_OPERATIONAL_FILE_BYTES } from '@/lib/files/operationalFileCatalog'

export const LIVE_DASHBOARD_IMAGE_MAX_BYTES = MAX_OPERATIONAL_FILE_BYTES
const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'] as const

const extensionByType: Record<(typeof allowedTypes)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function dashboardScreenshotPath(shiftId: string, type: string, fileId: string) {
  const extension = extensionByType[type as keyof typeof extensionByType]
  if (!extension) throw new Error('Unsupported dashboard image type.')
  if (!shiftId.trim()) throw new Error('Dashboard shift is required.')
  if (!fileId.trim()) throw new Error('Dashboard image file is required.')
  return `dashboard/${shiftId}/${fileId}.${extension}`
}

export async function uploadDashboardScreenshot(
  file: Blob & { type: string; size: number },
  shiftId: string,
  fetcher: typeof fetch = fetch,
) {
  if (!allowedTypes.includes(file.type as (typeof allowedTypes)[number])) throw new Error('Unsupported dashboard image type.')
  if (file.size > LIVE_DASHBOARD_IMAGE_MAX_BYTES) throw new Error('Dashboard image is too large.')
  if (!shiftId.trim()) throw new Error('Dashboard shift is required.')
  const extension = extensionByType[file.type as keyof typeof extensionByType]
  const form = new FormData()
  form.set('shift_id', shiftId)
  form.set('category', 'live_snapshot')
  form.set('provider', 'google_drive')
  form.set('file', file, `dashboard-snapshot.${extension}`)
  const response = await fetcher('/api/operational-files', { method: 'POST', body: form })
  const payload = await response.json().catch(() => null) as { ok?: unknown; file?: { id?: unknown; provider?: unknown } } | null
  if (!response.ok || payload?.ok !== true || typeof payload.file?.id !== 'string'
    || payload.file.provider !== 'google_drive') {
    throw new Error('Dashboard image upload failed.')
  }
  const fileId = payload.file.id
  return {
    fileId,
    storagePath: dashboardScreenshotPath(shiftId, file.type, fileId),
    screenshotUrl: `/api/dashboard-screenshots?file_id=${encodeURIComponent(fileId)}`,
  }
}
