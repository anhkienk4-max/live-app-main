import type { FileProvider, FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { sanitizeFileName } from '@/lib/files/fileValidation'

const assets = new Map<string, FileUploadResult>()

export const mockFileProvider: FileProvider = {
  name: 'mock',
  async upload(input: FileUploadInput) {
    const externalFileId = `mock-${assets.size + 1}`
    const asset = {
      id: externalFileId,
      provider: 'mock' as const,
      external_file_id: externalFileId,
      external_parent_id: input.external_parent_id,
      name: sanitizeFileName(input.name),
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      checksum_sha256: input.checksum_sha256,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      status: 'active' as const,
      created_by: input.created_by,
      created_at: new Date().toISOString(),
      provider_metadata: { logical_path: input.logical_path },
    }
    const result = { asset, view_url: `mock://view/${externalFileId}`, download_url: `mock://download/${externalFileId}` }
    assets.set(externalFileId, result)
    return result
  },
  async getMetadata(externalFileId) {
    const result = assets.get(externalFileId)
    if (!result) throw new Error('FILE_NOT_FOUND')
    return { id: result.asset.external_file_id, name: result.asset.name, mime_type: result.asset.mime_type, size_bytes: result.asset.size_bytes, checksum_sha256: result.asset.checksum_sha256, provider_metadata: result.asset.provider_metadata }
  },
  async getViewUrl(externalFileId) {
    if (!assets.has(externalFileId)) throw new Error('FILE_NOT_FOUND')
    return `mock://view/${externalFileId}`
  },
  async getDownloadUrl(externalFileId) {
    if (!assets.has(externalFileId)) throw new Error('FILE_NOT_FOUND')
    return `mock://download/${externalFileId}`
  },
  async delete(externalFileId) {
    assets.delete(externalFileId)
  },
  async healthCheck() { return { ok: true, provider: 'mock' } },
}
