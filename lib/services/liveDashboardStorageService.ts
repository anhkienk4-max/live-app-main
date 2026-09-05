import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export const LIVE_DASHBOARD_IMAGE_BUCKET = 'live-dashboard-images'
export const LIVE_DASHBOARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'] as const

type StorageClient = Pick<SupabaseClient, 'storage'>

const extensionByType: Record<(typeof allowedTypes)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function dashboardScreenshotPath(shiftId: string, type: string, id = crypto.randomUUID()) {
  const extension = extensionByType[type as keyof typeof extensionByType]
  if (!extension) throw new Error('Unsupported dashboard image type.')
  if (!shiftId.trim()) throw new Error('Dashboard shift is required.')
  return `dashboard/${shiftId}/${id}.${extension}`
}

export async function uploadDashboardScreenshot(
  file: Blob & { type: string; size: number },
  shiftId: string,
  client: StorageClient = createClient(),
) {
  if (!allowedTypes.includes(file.type as (typeof allowedTypes)[number])) throw new Error('Unsupported dashboard image type.')
  if (file.size > LIVE_DASHBOARD_IMAGE_MAX_BYTES) throw new Error('Dashboard image is too large.')
  const storagePath = dashboardScreenshotPath(shiftId, file.type)
  const result = await client.storage.from(LIVE_DASHBOARD_IMAGE_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (result.error) throw new Error('Dashboard image upload failed.')
  const { data } = client.storage.from(LIVE_DASHBOARD_IMAGE_BUCKET).getPublicUrl(storagePath)
  return { storagePath, screenshotUrl: data.publicUrl }
}

export async function removeDashboardScreenshot(
  storagePath: string | undefined,
  shiftId: string,
  client: StorageClient = createClient(),
) {
  if (!storagePath || !storagePath.startsWith(`dashboard/${shiftId}/`)) return
  const result = await client.storage.from(LIVE_DASHBOARD_IMAGE_BUCKET).remove([storagePath])
  if (result.error) throw new Error('Dashboard image cleanup failed.')
}
