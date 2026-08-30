import type { FileProvider, FileProviderName } from '@/lib/files/fileProvider'

export type FileProviderEnvironment = Record<string, string | undefined>

export class FileProviderError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message)
    this.name = 'FileProviderError'
  }
}

export function isFileStorageEnabled(env: FileProviderEnvironment = process.env): boolean {
  return env.FILE_STORAGE_ENABLED !== 'false'
}

export function resolveFileProviderName(env: FileProviderEnvironment = process.env): FileProviderName | 'mock' {
  const configured = env.FILE_PROVIDER?.trim().toLowerCase()
  const production = env.NODE_ENV === 'production'
  if (!isFileStorageEnabled(env)) throw new FileProviderError('FILE_STORAGE_DISABLED')
  if (!configured) {
    if (production) throw new FileProviderError('FILE_PROVIDER_NOT_CONFIGURED')
    return 'mock'
  }
  if (configured === 'mock') {
    if (production) throw new FileProviderError('FILE_PROVIDER_NOT_ALLOWED')
    return 'mock'
  }
  if (!['google_drive', 'onedrive', 'supabase_legacy'].includes(configured)) {
    throw new FileProviderError('FILE_PROVIDER_UNSUPPORTED')
  }
  return configured as FileProviderName
}

export function notImplementedProvider(name: FileProviderName): FileProvider {
  const fail = async (): Promise<never> => { throw new FileProviderError('FILE_PROVIDER_NOT_IMPLEMENTED', `${name} adapter is not implemented.`) }
  return {
    name,
    upload: fail,
    getMetadata: fail,
    getViewUrl: fail,
    getDownloadUrl: fail,
    delete: fail,
    healthCheck: fail,
  }
}
