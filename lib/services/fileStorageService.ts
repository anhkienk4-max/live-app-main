import 'server-only'

import type { FileAssetReference, FileProvider, FileProviderName, FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { assertMetadataContainsNoBinary, validateFileUploadInput } from '@/lib/files/fileValidation'
import { FileProviderError } from '@/lib/server/fileProviderResolver'
import { createFileProviderRegistry, type FileProviderAvailability, type FileProviderRegistry } from '@/lib/server/fileProviderRegistry'

type Environment = Record<string, string | undefined>
type ProviderKey = FileProviderName | 'mock'

export interface FileStorageServiceOptions {
  env?: Environment
  provider?: FileProvider
  providers?: Partial<Record<ProviderKey, FileProvider>>
  registry?: FileProviderRegistry
}

function isAssetReference(value: FileAssetReference | string): value is FileAssetReference {
  return typeof value === 'object' && value !== null
}

function providerAndId(
  value: FileAssetReference | string,
  registry: FileProviderRegistry,
  providerName?: ProviderKey,
): { provider: FileProvider; externalFileId: string } {
  if (isAssetReference(value)) {
    return {
      provider: registry.getProvider(value.provider),
      externalFileId: value.external_file_id,
    }
  }
  return {
    provider: registry.getProvider(providerName ?? registry.defaultProviderName),
    externalFileId: value,
  }
}

export function createFileStorageService(options: FileStorageServiceOptions = {}) {
  const env = options.env ?? process.env
  const registry = options.registry ?? createFileProviderRegistry({
    env,
    defaultProvider: options.provider,
    providers: options.providers,
  })

  if (typeof window !== 'undefined') throw new FileProviderError('FILE_PROVIDER_SERVER_ONLY')

  return {
    providerName: registry.defaultProviderName,
    providerAvailability: registry.getAvailability(),
    getProvider: (name: ProviderKey) => registry.getProvider(name),
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      validateFileUploadInput(input)
      const provider = registry.getProvider(input.destination?.provider ?? registry.defaultProviderName)
      const result = await provider.upload(input)
      if (result.asset.provider_metadata) assertMetadataContainsNoBinary(result.asset.provider_metadata)
      return result
    },
    list: (parentId?: string, providerName?: ProviderKey) => registry.getProvider(providerName ?? registry.defaultProviderName).list(parentId),
    getMetadata: (assetOrId: FileAssetReference | string, providerName?: ProviderKey) => {
      const resolved = providerAndId(assetOrId, registry, providerName)
      return resolved.provider.getMetadata(resolved.externalFileId)
    },
    read: (assetOrId: FileAssetReference | string, providerName?: ProviderKey) => {
      const resolved = providerAndId(assetOrId, registry, providerName)
      return resolved.provider.read(resolved.externalFileId)
    },
    getViewUrl: (assetOrId: FileAssetReference | string, providerName?: ProviderKey) => {
      const resolved = providerAndId(assetOrId, registry, providerName)
      return resolved.provider.getViewUrl(resolved.externalFileId)
    },
    getDownloadUrl: (assetOrId: FileAssetReference | string, providerName?: ProviderKey) => {
      const resolved = providerAndId(assetOrId, registry, providerName)
      return resolved.provider.getDownloadUrl(resolved.externalFileId)
    },
    normalizeId: (value: string, providerName?: ProviderKey) => registry.getProvider(providerName ?? registry.defaultProviderName).normalizeId(value),
    delete: (assetOrId: FileAssetReference | string, providerName?: ProviderKey) => {
      const resolved = providerAndId(assetOrId, registry, providerName)
      return resolved.provider.delete(resolved.externalFileId)
    },
    healthCheck: (providerName?: ProviderKey) => registry.getProvider(providerName ?? registry.defaultProviderName).healthCheck(),
  }
}

/** Server-only gateway. Do not import this module from browser components. */
export const fileStorageService = {
  get providerName() { return createFileStorageService().providerName },
  get providerAvailability(): FileProviderAvailability { return createFileStorageService().providerAvailability },
  getProvider(name: ProviderKey) { return createFileStorageService().getProvider(name) },
  upload(input: FileUploadInput) { return createFileStorageService().upload(input) },
  list(parentId?: string, providerName?: ProviderKey) { return createFileStorageService().list(parentId, providerName) },
  getMetadata(assetOrId: FileAssetReference | string, providerName?: ProviderKey) { return createFileStorageService().getMetadata(assetOrId, providerName) },
  read(assetOrId: FileAssetReference | string, providerName?: ProviderKey) { return createFileStorageService().read(assetOrId, providerName) },
  getViewUrl(assetOrId: FileAssetReference | string, providerName?: ProviderKey) { return createFileStorageService().getViewUrl(assetOrId, providerName) },
  getDownloadUrl(assetOrId: FileAssetReference | string, providerName?: ProviderKey) { return createFileStorageService().getDownloadUrl(assetOrId, providerName) },
  normalizeId(value: string, providerName?: ProviderKey) { return createFileStorageService().normalizeId(value, providerName) },
  delete(assetOrId: FileAssetReference | string, providerName?: ProviderKey) { return createFileStorageService().delete(assetOrId, providerName) },
  healthCheck(providerName?: ProviderKey) { return createFileStorageService().healthCheck(providerName) },
}

export { FileProviderError }
