import 'server-only'

import type { FileProvider, FileProviderName } from '@/lib/files/fileProvider'
import { createGoogleDriveFileProvider } from '@/lib/server/googleDriveFileProvider'
import { createOneDriveFileProvider } from '@/lib/server/oneDriveFileProvider'
import { resolveGoogleDriveAuthMode } from '@/lib/server/googleDriveAuth'
import { FileProviderError, isFileStorageEnabled, notImplementedProvider, resolveFileProviderName } from '@/lib/server/fileProviderResolver'
import { mockFileProvider } from '@/lib/server/mockFileProvider'

type Environment = Record<string, string | undefined>
type ProviderKey = FileProviderName | 'mock'

export type FileProviderAvailability = Readonly<Record<FileProviderName, boolean>>

export interface FileProviderRegistry {
  readonly defaultProviderName: ProviderKey
  getProvider(name: ProviderKey): FileProvider
  getDefaultProvider(): FileProvider
  getAvailability(): FileProviderAvailability
}

export interface FileProviderRegistryOptions {
  env?: Environment
  defaultProvider?: FileProvider
  providers?: Partial<Record<ProviderKey, FileProvider>>
}

function has(env: Environment, ...names: string[]): boolean {
  return names.every(name => Boolean(env[name]?.trim()))
}

function isGoogleDriveConfigured(env: Environment): boolean {
  if (!has(env, 'GOOGLE_DRIVE_ROOT_FOLDER_ID')) return false
  try {
    return resolveGoogleDriveAuthMode(env) === 'service_account'
      ? has(env, 'GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_DRIVE_PRIVATE_KEY')
      : has(env, 'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN')
  } catch {
    return false
  }
}

function isOneDriveConfigured(env: Environment): boolean {
  return has(env, 'ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET', 'ONEDRIVE_REFRESH_TOKEN')
}

export function isFileProviderConfigured(name: FileProviderName, env: Environment = process.env): boolean {
  if (!isFileStorageEnabled(env)) return false
  if (name === 'google_drive') return isGoogleDriveConfigured(env)
  if (name === 'onedrive') return isOneDriveConfigured(env)
  return false
}

export function createFileProviderRegistry(options: FileProviderRegistryOptions = {}): FileProviderRegistry {
  const env = options.env ?? process.env
  const overrides = options.providers ?? {}
  const defaultProvider = options.defaultProvider
  const defaultProviderName = defaultProvider?.name ?? resolveFileProviderName(env)
  const cache = new Map<ProviderKey, FileProvider>()

  for (const [name, provider] of Object.entries(overrides) as Array<[ProviderKey, FileProvider | undefined]>) {
    if (provider) cache.set(name, provider)
  }
  if (defaultProvider) cache.set(defaultProvider.name, defaultProvider)

  function getProvider(name: ProviderKey): FileProvider {
    const cached = cache.get(name)
    if (cached) return cached
    if (!isFileStorageEnabled(env)) throw new FileProviderError('FILE_STORAGE_DISABLED')
    if (name === 'mock') {
      if (env.NODE_ENV === 'production') throw new FileProviderError('FILE_PROVIDER_NOT_ALLOWED')
      cache.set(name, mockFileProvider)
      return mockFileProvider
    }
    if (name === 'supabase_legacy') return notImplementedProvider(name)
    if (!isFileProviderConfigured(name, env)) throw new FileProviderError('PROVIDER_NOT_CONFIGURED')

    const provider = name === 'google_drive'
      ? createGoogleDriveFileProvider({ env })
      : createOneDriveFileProvider({ env })
    cache.set(name, provider)
    return provider
  }

  return {
    defaultProviderName,
    getProvider,
    getDefaultProvider() { return getProvider(defaultProviderName) },
    getAvailability() {
      return {
        google_drive: Boolean(overrides.google_drive) || defaultProvider?.name === 'google_drive' || isFileProviderConfigured('google_drive', env),
        onedrive: Boolean(overrides.onedrive) || defaultProvider?.name === 'onedrive' || isFileProviderConfigured('onedrive', env),
        supabase_legacy: false,
      }
    },
  }
}
