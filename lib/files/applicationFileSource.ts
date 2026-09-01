export type ApplicationFilePurpose = 'schedule_import' | 'report'

export type CloudFileProvider = 'google_drive' | 'onedrive'

export type CloudFileSource = {
  type: CloudFileProvider
  resource: string
}
export type ApplicationFileSource =
  | { type: 'local'; file: Blob }
  | { type: 'google_sheets'; url: string }
  | CloudFileSource

export interface NormalizedCloudFile {
  sourceType: CloudFileProvider
  providerResourceId: string
  filename: string
  mimeType: string
  size: number
  content: Uint8Array
}
