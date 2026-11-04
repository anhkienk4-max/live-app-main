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
  const response = await fetcher('/api/schedule-source-files', { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store' })
  const payload = await response.json().catch(() => null) as { ok?: unknown; file?: ScheduleSourceFileReceipt; error?: { code?: unknown } } | null
  if (!response.ok || payload?.ok !== true || !payload.file?.id) {
    throw new Error(typeof payload?.error?.code === 'string' ? payload.error.code : 'SCHEDULE_SOURCE_UPLOAD_FAILED')
  }
  return payload.file
}

export async function verifyScheduleSourceFile(
  fileId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
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
