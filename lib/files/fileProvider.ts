export type FileProviderName = 'google_drive' | 'onedrive' | 'supabase_legacy'

export type FileEntityType =
  | 'report'
  | 'shift'
  | 'schedule_import'
  | 'campaign'
  | 'brand'
  | 'attachment'

export type FileAssetStatus = 'active' | 'archived' | 'deleted'

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
  provider_metadata?: Record<string, unknown>
}

export interface FileProvider {
  readonly name: FileProviderName | 'mock'
  upload(input: FileUploadInput): Promise<FileUploadResult>
  getMetadata(externalFileId: string): Promise<FileProviderMetadata>
  getViewUrl(externalFileId: string): Promise<string>
  getDownloadUrl(externalFileId: string): Promise<string>
  delete(externalFileId: string): Promise<void>
  healthCheck(): Promise<{ ok: boolean; provider: string }>
}
