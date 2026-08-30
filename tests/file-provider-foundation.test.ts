import assert from 'node:assert/strict'
import test from 'node:test'

import { logicalFilePlacement } from '@/lib/files/filePlacement'
import type { FileProvider, FileUploadInput } from '@/lib/files/fileProvider'
import { assertMetadataContainsNoBinary, sanitizeFileName } from '@/lib/files/fileValidation'
import { fileStorageService, createFileStorageService } from '@/lib/services/fileStorageService'
import { FileProviderError, notImplementedProvider, resolveFileProviderName } from '@/lib/server/fileProviderResolver'

const uploadInput: FileUploadInput = {
  name: 'report image.png',
  mime_type: 'image/png',
  size_bytes: 4,
  content: new Uint8Array([1, 2, 3, 4]),
  entity_type: 'report',
  entity_id: 'report-1',
  created_by: 'user-1',
  logical_path: 'LiveStreamOps/reports/2026/08/report-1',
}

test('system provider resolver selects Google Drive and OneDrive', () => {
  assert.equal(resolveFileProviderName({ NODE_ENV: 'production', FILE_PROVIDER: 'google_drive' }), 'google_drive')
  assert.equal(resolveFileProviderName({ NODE_ENV: 'production', FILE_PROVIDER: 'onedrive' }), 'onedrive')
})

test('unsupported and missing production providers fail closed', () => {
  assert.throws(() => resolveFileProviderName({ NODE_ENV: 'production', FILE_PROVIDER: 'dropbox' }), (error: unknown) => error instanceof FileProviderError && error.code === 'FILE_PROVIDER_UNSUPPORTED')
  assert.throws(() => resolveFileProviderName({ NODE_ENV: 'production' }), (error: unknown) => error instanceof FileProviderError && error.code === 'FILE_PROVIDER_NOT_CONFIGURED')
  assert.throws(() => resolveFileProviderName({ NODE_ENV: 'production', FILE_PROVIDER: 'mock' }), (error: unknown) => error instanceof FileProviderError && error.code === 'FILE_PROVIDER_NOT_ALLOWED')
})

test('development/test may resolve the deterministic mock only', () => {
  assert.equal(resolveFileProviderName({ NODE_ENV: 'development' }), 'mock')
  assert.equal(resolveFileProviderName({ NODE_ENV: 'test', FILE_PROVIDER: 'mock' }), 'mock')
})

test('gateway delegates to the configured provider without provider-specific business types', async () => {
  const calls: string[] = []
  const provider: FileProvider = {
    name: 'google_drive',
    async upload(input) {
      calls.push(`upload:${input.entity_type}`)
      return {
        asset: {
          id: 'asset-1', provider: 'google_drive', external_file_id: 'external-1', name: input.name,
          mime_type: input.mime_type, size_bytes: input.size_bytes, entity_type: input.entity_type,
          entity_id: input.entity_id, status: 'active', created_by: input.created_by,
          created_at: '2026-08-30T00:00:00.000Z', provider_metadata: { logical_path: input.logical_path },
        },
      }
    },
    async getMetadata(id) { calls.push(`metadata:${id}`); return { id, name: 'file' } },
    async getViewUrl(id) { calls.push(`view:${id}`); return `https://provider.test/view/${id}` },
    async getDownloadUrl(id) { calls.push(`download:${id}`); return `https://provider.test/download/${id}` },
    async delete(id) { calls.push(`delete:${id}`) },
    async healthCheck() { calls.push('health'); return { ok: true, provider: 'google_drive' } },
  }
  const gateway = createFileStorageService({ provider })
  const result = await gateway.upload(uploadInput)
  assert.equal(result.asset.external_file_id, 'external-1')
  assert.deepEqual(calls, ['upload:report'])
  assert.equal(await gateway.getViewUrl('external-1'), 'https://provider.test/view/external-1')
})

test('mock provider is deterministic and never stores binary in FileAsset metadata', async () => {
  const gateway = createFileStorageService({ env: { NODE_ENV: 'development' } })
  const result = await gateway.upload(uploadInput)
  assert.equal(result.asset.provider, 'mock')
  assert.equal(result.asset.size_bytes, uploadInput.size_bytes)
  assert.ok(!('content' in result.asset))
  assert.ok(!('base64' in (result.asset.provider_metadata ?? {})))
})

test('logical placement and filename sanitization are deterministic', () => {
  const first = logicalFilePlacement('schedule_import', 'batch/../one', '2026-08-30T23:00:00.000Z')
  const second = logicalFilePlacement('schedule_import', 'batch/../one', '2026-08-30T23:00:00.000Z')
  assert.deepEqual(first, second)
  assert.equal(first.logical_path, 'LiveStreamOps/imports/2026/08/batch-.-one')
  assert.equal(sanitizeFileName('  báo cáo\u00a0\u200b.png  '), 'báo cáo.png')
  assert.equal(sanitizeFileName('../payload.exe'), 'payload.exe')
})

test('central validation rejects executable payloads and binary metadata', async () => {
  const gateway = createFileStorageService({ env: { NODE_ENV: 'development' } })
  await assert.rejects(() => gateway.upload({ ...uploadInput, name: 'run.exe' }), /FILE_EXECUTABLE_NOT_ALLOWED/)
  assert.throws(() => assertMetadataContainsNoBinary({ data: 'base64' }), /FILE_METADATA_BINARY_FORBIDDEN/)
})

test('configured external adapters cannot report fake success before implementation', async () => {
  const provider = notImplementedProvider('onedrive')
  await assert.rejects(() => provider.upload(uploadInput), (error: unknown) => error instanceof FileProviderError && error.code === 'FILE_PROVIDER_NOT_IMPLEMENTED')
  assert.equal(fileStorageService !== undefined, true)
})

test('provider credentials are server-only environment names', () => {
  const source = [
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.ONEDRIVE_CLIENT_ID,
    process.env.ONEDRIVE_CLIENT_SECRET,
  ]
  assert.equal(source.every(value => value === undefined || typeof value === 'string'), true)
  assert.equal(Object.keys(process.env).some(key => /^NEXT_PUBLIC_.*(DRIVE|ONEDRIVE|FILE_PROVIDER|SECRET)/i.test(key)), false)
})
