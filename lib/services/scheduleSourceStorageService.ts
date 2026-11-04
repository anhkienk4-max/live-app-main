import { getAuthMode } from '@/lib/auth/authMode'
export type ScheduleSourceFileReceipt = {
  id: string
  batch_id: string
  provider: 'google_drive'
  external_file_id: string
  external_parent_id: string
  file_name: string
  mime_type: string
  size_bytes: number
  checksum_sha256: string
  reconciliation_status: 'provider_verified'
}

export async function uploadScheduleSourceFile(
  batchId: string,
  file: File,
  fetcher: typeof fetch = fetch,
): Promise<ScheduleSourceFileReceipt> {
  const form = new FormData()
  form.set('batch_id', batchId)
  form.set('file', file, file.name)
  if (getAuthMode() === 'mock') {
    return {
      id: `mock-source-${batchId}`,
      batch_id: batchId,
      provider: 'google_drive',
      external_file_id: `mock-drive-${batchId}`,
      external_parent_id: 'mock-folder-root',
      file_name: file.name,
      mime_type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size_bytes: file.size,
      checksum_sha256: 'mock-checksum',
      reconciliation_status: 'provider_verified',
    }
  }
  try {
    const response = await fetcher('/api/schedule-source-files', { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store' })
    const payload = await response.json().catch(() => null) as { ok?: unknown; file?: ScheduleSourceFileReceipt; error?: { code?: unknown } } | null
    if (response.ok && payload?.ok === true && payload.file?.id) {
      return payload.file
    }
    if (process.env.NODE_ENV !== 'production' && (!process.env.NEXT_PUBLIC_SUPABASE_URL || response.status === 401 || response.status === 404)) {
      return {
        id: `mock-source-${batchId}`,
        batch_id: batchId,
        provider: 'google_drive',
        external_file_id: `mock-drive-${batchId}`,
        external_parent_id: 'mock-folder-root',
        file_name: file.name,
        mime_type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size_bytes: file.size,
        checksum_sha256: 'mock-checksum',
        reconciliation_status: 'provider_verified',
      }
    }
    throw new Error(typeof payload?.error?.code === 'string' ? payload.error.code : 'SCHEDULE_SOURCE_UPLOAD_FAILED')
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return {
        id: `mock-source-${batchId}`,
        batch_id: batchId,
        provider: 'google_drive',
        external_file_id: `mock-drive-${batchId}`,
        external_parent_id: 'mock-folder-root',
        file_name: file.name,
        mime_type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size_bytes: file.size,
        checksum_sha256: 'mock-checksum',
        reconciliation_status: 'provider_verified',
      }
    }
    throw error
  }
}

export async function verifyScheduleSourceFile(
  fileId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && (!process.env.NEXT_PUBLIC_SUPABASE_URL || fileId.startsWith('mock-source-'))) {
    return
  }
  const response = await fetcher(`/api/schedule-source-files?file_id=${encodeURIComponent(fileId)}&verify_only=true`, {
    credentials: 'same-origin', cache: 'no-store',
  })
  const payload = await response.json().catch(() => null) as { ok?: unknown; error?: { code?: unknown } } | null
  if (!response.ok || payload?.ok !== true) {
    throw new Error(typeof payload?.error?.code === 'string' ? payload.error.code : 'SCHEDULE_SOURCE_VERIFY_FAILED')
  }
}

export async function downloadScheduleSourceFile(
  fileId: string,
  fetcher: typeof fetch = fetch,
): Promise<Blob> {
  const response = await fetcher(`/api/schedule-source-files?file_id=${encodeURIComponent(fileId)}`, {
    credentials: 'same-origin', cache: 'no-store',
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: unknown } } | null
    throw new Error(typeof payload?.error?.code === 'string' ? payload.error.code : 'SCHEDULE_SOURCE_DOWNLOAD_FAILED')
  }
  return response.blob()
}
