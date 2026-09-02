import type {
  ApplicationFilePurpose,
  CloudFileSource,
} from '@/lib/files/applicationFileSource'

export class ApplicationFileSourceClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApplicationFileSourceClientError'
  }
}
function decodeFilename(value: string | null): string {
  if (!value) return 'cloud-file'
  try {
    return decodeURIComponent(value)
  } catch {
    return 'cloud-file'
  }
}

export async function fetchCloudFileSource(
  source: CloudFileSource,
  purpose: ApplicationFilePurpose,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  file: File
  sourceType: CloudFileSource['type']
  providerResourceId: string
}> {
  const response = await fetchImpl('/api/file-sources/ingest', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose, provider: source.type, resource: source.resource }),
  })

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string } } = {}
    try {
      payload = await response.json() as typeof payload
    } catch {
      // Keep a stable provider-neutral error when the route returns no JSON.
    }
    throw new ApplicationFileSourceClientError(
      payload.error?.message || 'The selected cloud file could not be loaded.',
      payload.error?.code || 'CLOUD_INGESTION_PROVIDER_ERROR',
      response.status,
    )
  }

  const content = await response.arrayBuffer()
  const mimeType = response.headers.get('content-type') || 'application/octet-stream'
  const filename = decodeFilename(response.headers.get('x-file-name'))
  return {
    file: new File([content], filename, { type: mimeType }),
    sourceType: source.type,
    providerResourceId: response.headers.get('x-file-resource-id') || '',
  }
}
