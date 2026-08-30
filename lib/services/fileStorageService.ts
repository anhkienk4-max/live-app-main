import type { FileProvider, FileProviderName, FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { assertMetadataContainsNoBinary, validateFileUploadInput } from '@/lib/files/fileValidation'
import { FileProviderError, notImplementedProvider, resolveFileProviderName } from '@/lib/server/fileProviderResolver'
import { mockFileProvider } from '@/lib/server/mockFileProvider'

type Environment = Record<string, string | undefined>

function providerFor(name: FileProviderName | 'mock'): FileProvider {
  if (name === 'mock') return mockFileProvider
  return notImplementedProvider(name)
}

export function createFileStorageService(options: { env?: Environment; provider?: FileProvider } = {}) {
  if (typeof window !== 'undefined') throw new FileProviderError('FILE_PROVIDER_SERVER_ONLY')
  const env = options.env ?? process.env
  const provider = options.provider ?? providerFor(resolveFileProviderName(env))
  return {
    providerName: provider.name,
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      validateFileUploadInput(input)
      const result = await provider.upload(input)
      if (result.asset.provider_metadata) assertMetadataContainsNoBinary(result.asset.provider_metadata)
      return result
    },
    getMetadata: (externalFileId: string) => provider.getMetadata(externalFileId),
    getViewUrl: (externalFileId: string) => provider.getViewUrl(externalFileId),
    getDownloadUrl: (externalFileId: string) => provider.getDownloadUrl(externalFileId),
    delete: (externalFileId: string) => provider.delete(externalFileId),
    healthCheck: () => provider.healthCheck(),
  }
}

/** Server-only gateway. Do not import this module from browser components. */
export const fileStorageService = {
  get providerName() { return createFileStorageService().providerName },
  upload(input: FileUploadInput) { return createFileStorageService().upload(input) },
  getMetadata(externalFileId: string) { return createFileStorageService().getMetadata(externalFileId) },
  getViewUrl(externalFileId: string) { return createFileStorageService().getViewUrl(externalFileId) },
  getDownloadUrl(externalFileId: string) { return createFileStorageService().getDownloadUrl(externalFileId) },
  delete(externalFileId: string) { return createFileStorageService().delete(externalFileId) },
  healthCheck() { return createFileStorageService().healthCheck() },
}

export { FileProviderError }
