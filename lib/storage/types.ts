import { FileProviderName } from '@/lib/files/fileProvider'

export type CloudStorageErrorCode =
  | 'CLOUD_ROOT_NOT_FOUND'
  | 'CLOUD_FOLDER_NOT_FOUND'
  | 'CLOUD_FOLDER_AMBIGUOUS'
  | 'CLOUD_BRAND_NOT_FOUND'
  | 'CLOUD_BRAND_NOT_ALLOWED'
  | 'CLOUD_PROVIDER_UNAVAILABLE'
  | 'CLOUD_FOLDER_CREATE_FAILED'
  | 'CLOUD_FILE_UPLOAD_FAILED'
  | 'CLOUD_FILE_CONFLICT'
  | 'CLOUD_STORAGE_PLAN_STALE'

export class CloudStorageError extends Error {
  constructor(public readonly code: CloudStorageErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'CloudStorageError'
  }
}

/**
 * Keep provider-specific failures from crossing the storage-management
 * boundary. Known domain errors retain their stable code; raw provider
 * failures intentionally expose no provider response or credential detail.
 */
export function normalizeCloudStorageError(error: unknown): CloudStorageError {
  if (error instanceof CloudStorageError) return error
  return new CloudStorageError('CLOUD_PROVIDER_UNAVAILABLE')
}

export interface CloudFolderRef {
  provider: FileProviderName
  id: string
  name: string
  parentId?: string
}

export interface CloudFileRef {
  provider: FileProviderName
  id: string
  name: string
  mimeType: string
  size: number
  parentId?: string
  viewUrl?: string
}

export interface CloudStoragePlan {
  provider: FileProviderName
  rootFolderId: string
  year: {
    label: string
    exists: boolean
    folderId?: string
  }
  month: {
    label: string
    exists: boolean
    folderId?: string
  }
  brand: {
    brandId: string
    label: string
    exists: boolean
    folderId?: string
  }
  actionsRequired: Array<'create_year_folder' | 'create_month_folder' | 'create_brand_folder' | 'upload_file'>
}

export interface CloudStorageExecutionResult {
  plan: CloudStoragePlan
  fileRef: CloudFileRef
}
