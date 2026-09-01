export type FileProviderName = 'google_drive' | 'onedrive' | 'supabase_legacy'

export type FileEntityType =
  | 'report'
  | 'shift'
  | 'schedule_import'
  | 'campaign'
  | 'brand'
  | 'attachment'

export type FileAssetStatus = 'active' | 'archived' | 'deleted'

export type FileDestinationScope = 'general' | 'report' | 'approval' | 'campaign' | 'backup' | 'delivery'

export type FileDestinationStatus = 'active' | 'archived' | 'invalid'

/** Neutral upload destination; provider-specific fields are optional extensions. */
export interface FileDestination {
  provider: FileProviderName
  external_folder_id?: string
  folder_url?: string
}

/** Persistence-ready destination contract; no provider implementation is implied. */
export interface SavedFileDestination {
  id: string
  name: string
  provider: FileProviderName
  external_folder_id?: string
  folder_url?: string
  scope: FileDestinationScope
  status: FileDestinationStatus
  created_by: string
  created_at: string
  last_validated_at?: string
}

/** Metadata only. Binary content must never be placed on this object. */
export interface FileAsset {
  id: string
  provider: FileProviderName | 'mock'
  external_file_id: string
  external_parent_id?: string
  name: string
  mime_type: string
  size_bytes: number
  checksum_sha256?: string
  entity_type: FileEntityType
  entity_id: string
  status: FileAssetStatus
  created_by: string
  created_at: string
  archived_at?: string
  provider_metadata?: Record<string, unknown>
}

export interface FileUploadInput {
  name: string
  mime_type: string
  size_bytes: number
  content: Blob | ArrayBuffer | Uint8Array
  checksum_sha256?: string
  entity_type: FileEntityType
  entity_id: string
  created_by: string
  logical_path: string
  external_parent_id?: string
  destination?: FileDestination
}

export interface FileUploadResult {
  asset: FileAsset
  view_url?: string
  download_url?: string
}

export interface FileProviderMetadata {
  id: string
  name: string
  mime_type?: string
  size_bytes?: number
  checksum_sha256?: string
  parent_ids?: string[]
  kind?: 'file' | 'folder'
  provider_metadata?: Record<string, unknown>
}

export interface FileProvider {
  readonly name: FileProviderName | 'mock'
  upload(input: FileUploadInput): Promise<FileUploadResult>
  list(parentId?: string): Promise<FileProviderMetadata[]>
  getMetadata(externalFileId: string): Promise<FileProviderMetadata>
  read(externalFileId: string): Promise<Uint8Array>
  getViewUrl(externalFileId: string): Promise<string>
  getDownloadUrl(externalFileId: string): Promise<string>
  normalizeId(value: string): string
  delete(externalFileId: string): Promise<void>
  healthCheck(): Promise<{ ok: boolean; provider: string }>
}
