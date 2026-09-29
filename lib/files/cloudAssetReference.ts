import type { FileProviderName } from '@/lib/files/fileProvider'

export type CloudAssetReference = {
  provider: Extract<FileProviderName, 'google_drive' | 'onedrive'>
  external_file_id: string
}

export type ReportImageRouteKind = 'report' | 'live'

export class CloudAssetReferenceError extends Error {
  readonly code = 'CLOUD_ASSET_REFERENCE_INVALID'

  constructor() {
    super('CLOUD_ASSET_REFERENCE_INVALID')
    this.name = 'CloudAssetReferenceError'
  }
}

const prefix = 'cloudref:v1:'

export function reportImageApiUrl(kind: ReportImageRouteKind, imageId: string): string {
  if (!imageId.trim()) throw new CloudAssetReferenceError()
  return `/api/report-images?kind=${kind}&image_id=${encodeURIComponent(imageId)}`
}

export function encodeCloudAssetReference(reference: CloudAssetReference): string {
  if (!['google_drive', 'onedrive'].includes(reference.provider) || !reference.external_file_id.trim()) {
    throw new CloudAssetReferenceError()
  }
  return `${prefix}${reference.provider}:${encodeURIComponent(reference.external_file_id)}`
}

export function decodeCloudAssetReference(value: unknown): CloudAssetReference | null {
  if (typeof value !== 'string' || !value.startsWith('cloudref:')) return null
  const match = /^cloudref:v1:(google_drive|onedrive):(.+)$/u.exec(value)
  if (!match) throw new CloudAssetReferenceError()
  try {
    const externalFileId = decodeURIComponent(match[2])
    if (!externalFileId.trim()) throw new CloudAssetReferenceError()
    return {
      provider: match[1] as CloudAssetReference['provider'],
      external_file_id: externalFileId,
    }
  } catch (error) {
    if (error instanceof CloudAssetReferenceError) throw error
    throw new CloudAssetReferenceError()
  }
}

export function projectCloudAssetReference(
  value: unknown,
  kind: ReportImageRouteKind,
  imageId: string,
  providerMetadata?: { provider?: unknown; external_file_id?: unknown },
): unknown {
  if (typeof value === 'string' && value.startsWith('cloudref:')) {
    decodeCloudAssetReference(value)
    return reportImageApiUrl(kind, imageId)
  }

  if (providerMetadata && (providerMetadata.provider != null || providerMetadata.external_file_id != null)) {
    if (
      (providerMetadata.provider !== 'google_drive' && providerMetadata.provider !== 'onedrive')
      || typeof providerMetadata.external_file_id !== 'string'
      || !providerMetadata.external_file_id.trim()
    ) {
      throw new CloudAssetReferenceError()
    }
    return reportImageApiUrl(kind, imageId)
  }

  return value
}

export function projectPublicReportImageRow(
  row: Record<string, unknown>,
  kind: ReportImageRouteKind,
): Record<string, unknown> {
  const result = { ...row }
  const imageId = typeof result.id === 'string' ? result.id : ''
  const providerMetadata = { provider: result.provider, external_file_id: result.external_file_id }
  delete result.provider
  delete result.external_file_id

  for (const [field, value] of Object.entries(result)) {
    if (typeof value === 'string' && value.startsWith('cloudref:')) {
      result[field] = projectCloudAssetReference(value, kind, imageId)
    }
  }

  const primaryField = kind === 'report' ? 'image_url' : 'file_url'
  if (Object.hasOwn(result, primaryField)) {
    result[primaryField] = projectCloudAssetReference(result[primaryField], kind, imageId, providerMetadata)
  }
  return result
}
