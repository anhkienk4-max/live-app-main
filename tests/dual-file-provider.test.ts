import assert from 'node:assert/strict'
import test from 'node:test'

import type { FileProvider, FileProviderName, FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { createFileProviderRegistry } from '@/lib/server/fileProviderRegistry'
import { createFileStorageService } from '@/lib/services/fileStorageService'

const dualProviderEnv = {
  NODE_ENV: 'production',
  FILE_STORAGE_ENABLED: 'true',
  FILE_PROVIDER: 'google_drive',
  GOOGLE_DRIVE_AUTH_MODE: 'oauth_refresh_token',
  GOOGLE_DRIVE_CLIENT_ID: 'google-client',
  GOOGLE_DRIVE_CLIENT_SECRET: 'google-secret',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'google-refresh',
  GOOGLE_DRIVE_ROOT_FOLDER_ID: 'google-root',
  ONEDRIVE_CLIENT_ID: 'microsoft-client',
  ONEDRIVE_CLIENT_SECRET: 'microsoft-secret',
  ONEDRIVE_REFRESH_TOKEN: 'microsoft-refresh',
}

function fakeProvider(name: FileProviderName, calls: string[]): FileProvider {
  return {
    name,
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      calls.push(`${name}:upload`)
      return {
        asset: {
          id: `${name}-asset`,
          provider: name,
          external_file_id: `${name}-file`,
          name: input.name,
          mime_type: input.mime_type,
          size_bytes: input.size_bytes,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          status: 'active',
          created_by: input.created_by,
          created_at: '2026-09-17T00:00:00.000Z',
        },
      }
    },
    async list() { calls.push(`${name}:list`); return [] },
    async getMetadata(id) { calls.push(`${name}:metadata:${id}`); return { id, name: `${name}.png` } },
    async read(id) { calls.push(`${name}:read:${id}`); return new Uint8Array([1]) },
    async getViewUrl(id) { calls.push(`${name}:view:${id}`); return `https://${name}.test/${id}` },
    async getDownloadUrl(id) { calls.push(`${name}:download:${id}`); return `https://${name}.test/${id}/download` },
    normalizeId(id) { return id },
    async delete(id) { calls.push(`${name}:delete:${id}`) },
    async healthCheck() { return { ok: true, provider: name } },
  }
}

const uploadInput: FileUploadInput = {
  name: 'evidence.png',
  mime_type: 'image/png',
  size_bytes: 1,
  content: new Uint8Array([1]),
  entity_type: 'report',
  entity_id: 'report-1',
  created_by: 'user-1',
  logical_path: 'LiveStreamOps/reports/2026/09/report-1',
}

test('both providers are available without instantiating browser-visible credentials', () => {
  const registry = createFileProviderRegistry({ env: dualProviderEnv })
  assert.deepEqual(registry.getAvailability(), { google_drive: true, onedrive: true, supabase_legacy: false })
  assert.equal(registry.defaultProviderName, 'google_drive')
  assert.equal(registry.getProvider('google_drive').name, 'google_drive')
  assert.equal(registry.getProvider('onedrive').name, 'onedrive')
})

test('FILE_PROVIDER remains the default while explicit uploads select either provider', async () => {
  const calls: string[] = []
  const gateway = createFileStorageService({
    env: dualProviderEnv,
    providers: {
      google_drive: fakeProvider('google_drive', calls),
      onedrive: fakeProvider('onedrive', calls),
    },
  })

  const defaultResult = await gateway.upload(uploadInput)
  const explicitResult = await gateway.upload({
    ...uploadInput,
    destination: { provider: 'onedrive' },
  })

  assert.equal(defaultResult.asset.provider, 'google_drive')
  assert.equal(explicitResult.asset.provider, 'onedrive')
  assert.deepEqual(calls, ['google_drive:upload', 'onedrive:upload'])
})

test('asset reads and deletes dispatch by persisted provider, not default provider', async () => {
  const calls: string[] = []
  const gateway = createFileStorageService({
    env: { ...dualProviderEnv, FILE_PROVIDER: 'onedrive' },
    providers: {
      google_drive: fakeProvider('google_drive', calls),
      onedrive: fakeProvider('onedrive', calls),
    },
  })

  const googleAsset = { provider: 'google_drive' as const, external_file_id: 'google-file' }
  const oneDriveAsset = { provider: 'onedrive' as const, external_file_id: 'onedrive-file' }

  await gateway.read(googleAsset)
  await gateway.getDownloadUrl(oneDriveAsset)
  await gateway.delete(googleAsset)
  await gateway.delete(oneDriveAsset)

  assert.deepEqual(calls, [
    'google_drive:read:google-file',
    'onedrive:download:onedrive-file',
    'google_drive:delete:google-file',
    'onedrive:delete:onedrive-file',
  ])
})

test('explicitly requested unavailable providers fail without fallback', async () => {
  const gateway = createFileStorageService({
    env: { ...dualProviderEnv, ONEDRIVE_CLIENT_ID: undefined, ONEDRIVE_CLIENT_SECRET: undefined, ONEDRIVE_REFRESH_TOKEN: undefined },
    providers: { google_drive: fakeProvider('google_drive', []) },
  })

  await assert.rejects(
    () => gateway.upload({ ...uploadInput, destination: { provider: 'onedrive' } }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'PROVIDER_NOT_CONFIGURED',
  )
})

test('provider availability distinguishes only-Google, only-OneDrive, and neither configuration', () => {
  const onlyGoogle = createFileProviderRegistry({
    env: { ...dualProviderEnv, ONEDRIVE_CLIENT_ID: undefined, ONEDRIVE_CLIENT_SECRET: undefined, ONEDRIVE_REFRESH_TOKEN: undefined },
  }).getAvailability()
  const onlyOneDrive = createFileProviderRegistry({
    env: { ...dualProviderEnv, GOOGLE_DRIVE_CLIENT_ID: undefined, GOOGLE_DRIVE_CLIENT_SECRET: undefined, GOOGLE_DRIVE_REFRESH_TOKEN: undefined },
  }).getAvailability()
  const neither = createFileProviderRegistry({
    env: {
      ...dualProviderEnv,
      GOOGLE_DRIVE_CLIENT_ID: undefined,
      GOOGLE_DRIVE_CLIENT_SECRET: undefined,
      GOOGLE_DRIVE_REFRESH_TOKEN: undefined,
      ONEDRIVE_CLIENT_ID: undefined,
      ONEDRIVE_CLIENT_SECRET: undefined,
      ONEDRIVE_REFRESH_TOKEN: undefined,
    },
  }).getAvailability()

  assert.deepEqual(onlyGoogle, { google_drive: true, onedrive: false, supabase_legacy: false })
  assert.deepEqual(onlyOneDrive, { google_drive: false, onedrive: true, supabase_legacy: false })
  assert.deepEqual(neither, { google_drive: false, onedrive: false, supabase_legacy: false })
})
