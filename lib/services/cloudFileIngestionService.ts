import 'server-only'

import type { FileProvider, FileProviderMetadata, FileProviderName } from '@/lib/files/fileProvider'
import { ALLOWED_FILE_MIME_TYPES, MAX_FILE_SIZE_BYTES, sanitizeFileName } from '@/lib/files/fileValidation'
import { FileProviderError, resolveFileProviderName } from '@/lib/server/fileProviderResolver'
import { createFileStorageService } from '@/lib/services/fileStorageService'

export type CloudFileIngestionPurpose = 'general' | 'report' | 'schedule_import'

export interface CloudFileIngestionRequest {
  provider: string
  resource: string
  expectedContentType?: string
  purpose?: CloudFileIngestionPurpose
}

export interface CloudFileIngestionResult {
  provider: FileProviderName
  providerResourceId: string
  filename: string
  mimeType: string
  size: number
  metadata: FileProviderMetadata
  content: Uint8Array
}

export type CloudFileIngestionErrorCode =
  | 'CLOUD_INGESTION_INVALID_REQUEST'
  | 'CLOUD_INGESTION_PROVIDER_UNSUPPORTED'
  | 'CLOUD_INGESTION_RESOURCE_INVALID'
  | 'CLOUD_INGESTION_AUTH_REQUIRED'
  | 'CLOUD_INGESTION_REAUTH_REQUIRED'
  | 'CLOUD_INGESTION_PERMISSION_DENIED'
  | 'CLOUD_INGESTION_NOT_FOUND'
  | 'CLOUD_INGESTION_RESOURCE_TYPE_UNSUPPORTED'
  | 'CLOUD_INGESTION_FILE_TYPE_UNSUPPORTED'
  | 'CLOUD_INGESTION_EMPTY_FILE'
  | 'CLOUD_INGESTION_FILE_TOO_LARGE'
  | 'CLOUD_INGESTION_TRANSIENT_FAILURE'
  | 'CLOUD_INGESTION_MALFORMED_RESPONSE'
  | 'CLOUD_INGESTION_PROVIDER_ERROR'

export class CloudFileIngestionError extends FileProviderError {
  constructor(public readonly code: CloudFileIngestionErrorCode, message = code) {
    super(code, message)
    this.name = 'CloudFileIngestionError'
  }
}

type CloudFileIngestionEnvironment = Record<string, string | undefined>

export interface CloudFileIngestionServiceOptions {
  env?: CloudFileIngestionEnvironment
  provider?: FileProvider
}

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'text/csv': ['csv'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/pdf': ['pdf'],
}

const providerCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function normalizeProviderError(error: unknown): CloudFileIngestionError {
  if (error instanceof CloudFileIngestionError) return error
  const code = providerCode(error)

  if (code === 'FILE_PROVIDER_UNSUPPORTED' || code === 'FILE_PROVIDER_NOT_IMPLEMENTED' || code === 'FILE_PROVIDER_NOT_ALLOWED') {
    return new CloudFileIngestionError('CLOUD_INGESTION_PROVIDER_UNSUPPORTED')
  }
  if (code === 'FILE_PROVIDER_INVALID_ID' || code?.endsWith('_FILE_ID_INVALID') || code === 'ONEDRIVE_SHARE_LINK_REMOTE_REQUIRED') {
    return new CloudFileIngestionError('CLOUD_INGESTION_RESOURCE_INVALID')
  }
  if (code === 'FILE_STORAGE_DISABLED' || code?.endsWith('_NOT_CONFIGURED') || code === 'ONEDRIVE_AUTH_REQUIRED' || code?.endsWith('_AUTH_FAILED')) {
    return new CloudFileIngestionError('CLOUD_INGESTION_AUTH_REQUIRED')
  }
  if (code?.endsWith('_REAUTH_REQUIRED')) return new CloudFileIngestionError('CLOUD_INGESTION_REAUTH_REQUIRED')
  if (code?.endsWith('_PERMISSION_DENIED')) return new CloudFileIngestionError('CLOUD_INGESTION_PERMISSION_DENIED')
  if (code?.endsWith('_FILE_NOT_FOUND') || code?.endsWith('_ITEM_NOT_FOUND') || code?.endsWith('_FOLDER_NOT_FOUND')) {
    return new CloudFileIngestionError('CLOUD_INGESTION_NOT_FOUND')
  }
  if (code?.endsWith('_RATE_LIMITED') || code?.endsWith('_NETWORK_ERROR') || code?.endsWith('_PROVIDER_UNAVAILABLE')) {
    return new CloudFileIngestionError('CLOUD_INGESTION_TRANSIENT_FAILURE')
  }
  if (code?.endsWith('_RESPONSE_INVALID')) return new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  return new CloudFileIngestionError('CLOUD_INGESTION_PROVIDER_ERROR')
}

function invalidRequest(): never {
  throw new CloudFileIngestionError('CLOUD_INGESTION_INVALID_REQUEST')
}

function validateRequest(request: CloudFileIngestionRequest): void {
  if (!request || typeof request !== 'object') invalidRequest()
  if (typeof request.provider !== 'string' || !request.provider.trim()) invalidRequest()
  if (typeof request.resource !== 'string' || !request.resource.trim()) invalidRequest()
  if (request.expectedContentType !== undefined && (typeof request.expectedContentType !== 'string' || !request.expectedContentType.trim())) {
    invalidRequest()
  }
}

function safeMetadata(metadata: FileProviderMetadata, normalizedId: string, filename: string, mimeType: string, size: number): FileProviderMetadata {
  if (metadata.parent_ids !== undefined && (!Array.isArray(metadata.parent_ids) || metadata.parent_ids.some(id => typeof id !== 'string'))) {
    throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  }
  if (metadata.checksum_sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(metadata.checksum_sha256)) {
    throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  }
  if (metadata.kind !== undefined && metadata.kind !== 'file') {
    throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  }
  return {
    id: normalizedId,
    name: filename,
    mime_type: mimeType,
    size_bytes: size,
    checksum_sha256: metadata.checksum_sha256,
    parent_ids: metadata.parent_ids ? [...metadata.parent_ids] : undefined,
    kind: 'file',
  }
}

function validateFileMetadata(
  metadata: FileProviderMetadata,
  expectedContentType?: string,
): { filename: string; mimeType: string; declaredSize?: number } {
  if (!metadata || typeof metadata !== 'object' || typeof metadata.id !== 'string' || !metadata.id.trim()) {
    throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  }
  if (metadata.kind === 'folder') throw new CloudFileIngestionError('CLOUD_INGESTION_RESOURCE_TYPE_UNSUPPORTED')
  if (metadata.kind !== undefined && metadata.kind !== 'file') {
    throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  }

  const filename = sanitizeFileName(metadata.name)
  if (filename === 'unnamed-file') throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  const mimeType = String(metadata.mime_type ?? '').trim().toLowerCase()
  if (!mimeType) throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  if (!ALLOWED_FILE_MIME_TYPES.has(mimeType)) throw new CloudFileIngestionError('CLOUD_INGESTION_FILE_TYPE_UNSUPPORTED')
  if (expectedContentType && mimeType !== expectedContentType.trim().toLowerCase()) {
    throw new CloudFileIngestionError('CLOUD_INGESTION_FILE_TYPE_UNSUPPORTED')
  }

  const extension = filename.split('.').pop()?.toLowerCase() || ''
  if (!MIME_EXTENSIONS[mimeType]?.includes(extension)) {
    throw new CloudFileIngestionError('CLOUD_INGESTION_FILE_TYPE_UNSUPPORTED')
  }

  if (metadata.size_bytes !== undefined && (!Number.isSafeInteger(metadata.size_bytes) || metadata.size_bytes < 0)) {
    throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
  }
  if (metadata.size_bytes !== undefined && metadata.size_bytes > MAX_FILE_SIZE_BYTES) {
    throw new CloudFileIngestionError('CLOUD_INGESTION_FILE_TOO_LARGE')
  }
  return { filename, mimeType, declaredSize: metadata.size_bytes }
}

function providerFor(
  request: CloudFileIngestionRequest,
  options: CloudFileIngestionServiceOptions,
): { name: FileProviderName; provider: FileProvider } {
  const env = options.env ?? process.env
  let name: FileProviderName
  try {
    const resolved = resolveFileProviderName({ ...env, FILE_PROVIDER: request.provider.trim() })
    if (resolved === 'mock' || resolved === 'supabase_legacy') {
      throw new CloudFileIngestionError('CLOUD_INGESTION_PROVIDER_UNSUPPORTED')
    }
    name = resolved
  } catch (error) {
    throw normalizeProviderError(error)
  }
  const provider = options.provider ?? storageProvider(name, env)
  if (provider.name !== name) throw new CloudFileIngestionError('CLOUD_INGESTION_PROVIDER_UNSUPPORTED')
  return { name, provider }
}

function storageProvider(name: FileProviderName, env: CloudFileIngestionEnvironment): FileProvider {
  const storage = createFileStorageService({ env: { ...env, FILE_PROVIDER: name } })
  return {
    name,
    upload: storage.upload,
    list: storage.list,
    getMetadata: storage.getMetadata,
    read: storage.read,
    getViewUrl: storage.getViewUrl,
    getDownloadUrl: storage.getDownloadUrl,
    normalizeId: storage.normalizeId,
    delete: storage.delete,
    healthCheck: storage.healthCheck,
  }
}

export interface CloudFileIngestionService {
  ingest(request: CloudFileIngestionRequest): Promise<CloudFileIngestionResult>
}

export function createCloudFileIngestionService(options: CloudFileIngestionServiceOptions = {}): CloudFileIngestionService {
  return {
    async ingest(request) {
      validateRequest(request)
      const { name, provider } = providerFor(request, options)
      let normalizedId: string
      let metadata: FileProviderMetadata
      let content: Uint8Array
      try {
        normalizedId = provider.normalizeId(request.resource)
        if (!normalizedId.trim()) throw new CloudFileIngestionError('CLOUD_INGESTION_RESOURCE_INVALID')
        metadata = await provider.getMetadata(normalizedId)
        const validated = validateFileMetadata(metadata, request.expectedContentType)
        content = await provider.read(normalizedId)
        if (!(content instanceof Uint8Array)) throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
        if (content.byteLength === 0) throw new CloudFileIngestionError('CLOUD_INGESTION_EMPTY_FILE')
        if (content.byteLength > MAX_FILE_SIZE_BYTES) throw new CloudFileIngestionError('CLOUD_INGESTION_FILE_TOO_LARGE')
        if (validated.declaredSize !== undefined && validated.declaredSize !== content.byteLength) {
          throw new CloudFileIngestionError('CLOUD_INGESTION_MALFORMED_RESPONSE')
        }
        return {
          provider: name,
          providerResourceId: normalizedId,
          filename: validated.filename,
          mimeType: validated.mimeType,
          size: content.byteLength,
          metadata: safeMetadata(metadata, normalizedId, validated.filename, validated.mimeType, content.byteLength),
          content: new Uint8Array(content),
        }
      } catch (error) {
        throw normalizeProviderError(error)
      }
    },
  }
}

/** Server-only default gateway. Never import this module from browser components. */
export const cloudFileIngestionService = createCloudFileIngestionService()
