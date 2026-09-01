import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import type { FileProvider, FileProviderMetadata, FileProviderName } from '@/lib/files/fileProvider'
import { parseScheduleTabularData } from '@/lib/utils/excelUtils'
import { CloudFileIngestionError, createCloudFileIngestionService } from '@/lib/services/cloudFileIngestionService'
import { FileProviderError } from '@/lib/server/fileProviderResolver'
import { GoogleDriveError } from '@/lib/server/googleDriveAuth'
import { normalizeGoogleDriveFileId } from '@/lib/server/googleDriveDestination'
import { OneDriveError } from '@/lib/server/oneDriveAuth'
import { normalizeOneDriveItemId } from '@/lib/server/oneDriveDestination'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type FakeProviderOptions = {
  name: FileProviderName
  resourceId?: string
  metadata?: Partial<FileProviderMetadata>
  content?: Uint8Array
  normalize?: (value: string) => string
  metadataError?: unknown
  readError?: unknown
}

function fakeProvider(options: FakeProviderOptions): FileProvider {
  const resourceId = options.resourceId || `${options.name}-file-1`
  const content = options.content || new Uint8Array([1, 2, 3])
  const metadata = {
    id: resourceId,
    name: 'schedule.xlsx',
    mime_type: XLSX_MIME,
    size_bytes: content.byteLength,
    parent_ids: ['root'],
    kind: 'file' as const,
    provider_metadata: { web_url: 'https://provider.example/file', access_token: 'must-not-escape' },
    ...options.metadata,
  }
  return {
    name: options.name,
    async upload() { throw new FileProviderError('NOT_USED') },
    async list() { return [metadata] },
    async getMetadata() {
      if (options.metadataError) throw options.metadataError
      return metadata
    },
    async read() {
      if (options.readError) throw options.readError
      return content
    },
    async getViewUrl() { return 'https://provider.example/view' },
    async getDownloadUrl() { return 'https://provider.example/download' },
    normalizeId(value) { return options.normalize ? options.normalize(value) : value.trim() || (() => { throw new FileProviderError('FILE_PROVIDER_INVALID_ID') })() },
    async delete() { throw new FileProviderError('NOT_USED') },
    async healthCheck() { return { ok: true, provider: options.name } },
  }
}

function serviceFor(provider: FileProvider) {
  return createCloudFileIngestionService({
    env: { NODE_ENV: 'test', FILE_STORAGE_ENABLED: 'true', FILE_PROVIDER: provider.name },
    provider,
  })
}

function arrayBufferOf(content: Uint8Array): ArrayBuffer {
  return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
}

async function rejectsWithCode(promise: Promise<unknown>, code: CloudFileIngestionError['code']) {
  await assert.rejects(promise, (error: unknown) => error instanceof CloudFileIngestionError && error.code === code)
}

test('Google and OneDrive files produce the same provider-neutral ingestion shape', async () => {
  const google = fakeProvider({
    name: 'google_drive',
    resourceId: 'google-file-1',
    normalize: normalizeGoogleDriveFileId,
  })
  const oneDrive = fakeProvider({
    name: 'onedrive',
    resourceId: 'item-1!drive',
    normalize: normalizeOneDriveItemId,
  })
  const googleResult = await serviceFor(google).ingest({
    provider: 'google_drive',
    resource: 'https://drive.google.com/file/d/google-file-1/view',
    expectedContentType: XLSX_MIME,
    purpose: 'schedule_import',
  })
  const oneDriveResult = await serviceFor(oneDrive).ingest({
    provider: 'onedrive',
    resource: 'https://graph.microsoft.com/v1.0/me/drive/items/item-1!drive',
    expectedContentType: XLSX_MIME,
    purpose: 'schedule_import',
  })

  assert.equal(googleResult.provider, 'google_drive')
  assert.equal(googleResult.providerResourceId, 'google-file-1')
  assert.equal(oneDriveResult.provider, 'onedrive')
  assert.equal(oneDriveResult.providerResourceId, 'item-1!drive')
  assert.deepEqual({ filename: googleResult.filename, mimeType: googleResult.mimeType, size: googleResult.size, content: [...googleResult.content] }, {
    filename: oneDriveResult.filename,
    mimeType: oneDriveResult.mimeType,
    size: oneDriveResult.size,
    content: [...oneDriveResult.content],
  })
  assert.equal('provider_metadata' in googleResult.metadata, false)
  assert.equal('provider_metadata' in oneDriveResult.metadata, false)
})

test('provider selection rejects unknown providers without fallback', async () => {
  await rejectsWithCode(createCloudFileIngestionService({ env: { NODE_ENV: 'test' } }).ingest({ provider: 'dropbox', resource: 'file-1' }), 'CLOUD_INGESTION_PROVIDER_UNSUPPORTED')
})

test('resource normalization delegates URL and ID handling to the selected provider', async () => {
  const calls: string[] = []
  const provider = fakeProvider({
    name: 'google_drive',
    resourceId: 'google-file-1',
    normalize(value) {
      calls.push(value)
      return normalizeGoogleDriveFileId(value)
    },
  })
  await serviceFor(provider).ingest({ provider: 'google_drive', resource: 'google-file-1' })
  assert.deepEqual(calls, ['google-file-1'])
  await rejectsWithCode(serviceFor(provider).ingest({ provider: 'google_drive', resource: 'not a valid id' }), 'CLOUD_INGESTION_RESOURCE_INVALID')
})

test('folders are rejected before content retrieval', async () => {
  let readCalls = 0
  const provider = fakeProvider({ name: 'onedrive', metadata: { kind: 'folder', name: 'folder' } })
  const original = provider.read
  provider.read = async id => { readCalls += 1; return original(id) }
  await rejectsWithCode(serviceFor(provider).ingest({ provider: 'onedrive', resource: 'folder-1' }), 'CLOUD_INGESTION_RESOURCE_TYPE_UNSUPPORTED')
  assert.equal(readCalls, 0)
})

test('file metadata, content, and existing file policy are validated', async () => {
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'google_drive', metadata: { mime_type: 'application/zip' } })).ingest({ provider: 'google_drive', resource: 'file-1' }), 'CLOUD_INGESTION_FILE_TYPE_UNSUPPORTED')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'google_drive', content: new Uint8Array(), metadata: { size_bytes: 0 } })).ingest({ provider: 'google_drive', resource: 'file-1' }), 'CLOUD_INGESTION_EMPTY_FILE')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'google_drive', metadata: { name: 'schedule.xls' } })).ingest({ provider: 'google_drive', resource: 'file-1', expectedContentType: XLSX_MIME }), 'CLOUD_INGESTION_FILE_TYPE_UNSUPPORTED')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'google_drive', metadata: { size_bytes: 4 } })).ingest({ provider: 'google_drive', resource: 'file-1' }), 'CLOUD_INGESTION_MALFORMED_RESPONSE')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'google_drive', metadata: { size_bytes: 26 * 1024 * 1024 } })).ingest({ provider: 'google_drive', resource: 'file-1' }), 'CLOUD_INGESTION_FILE_TOO_LARGE')
})

test('provider errors normalize to consumer-safe auth, permission, not-found, and transient errors', async () => {
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'google_drive', metadataError: new GoogleDriveError('GOOGLE_DRIVE_REAUTH_REQUIRED') })).ingest({ provider: 'google_drive', resource: 'file-1' }), 'CLOUD_INGESTION_REAUTH_REQUIRED')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'onedrive', metadataError: new OneDriveError('ONEDRIVE_AUTH_REQUIRED') })).ingest({ provider: 'onedrive', resource: 'file-1' }), 'CLOUD_INGESTION_AUTH_REQUIRED')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'google_drive', metadataError: new GoogleDriveError('GOOGLE_DRIVE_PERMISSION_DENIED') })).ingest({ provider: 'google_drive', resource: 'file-1' }), 'CLOUD_INGESTION_PERMISSION_DENIED')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'onedrive', metadataError: new OneDriveError('ONEDRIVE_ITEM_NOT_FOUND') })).ingest({ provider: 'onedrive', resource: 'file-1' }), 'CLOUD_INGESTION_NOT_FOUND')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'google_drive', metadataError: new GoogleDriveError('GOOGLE_DRIVE_PROVIDER_UNAVAILABLE') })).ingest({ provider: 'google_drive', resource: 'file-1' }), 'CLOUD_INGESTION_TRANSIENT_FAILURE')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'onedrive', metadataError: new OneDriveError('ONEDRIVE_RESPONSE_INVALID') })).ingest({ provider: 'onedrive', resource: 'file-1' }), 'CLOUD_INGESTION_MALFORMED_RESPONSE')
})

test('malformed provider metadata and content failures do not leak provider errors', async () => {
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'onedrive', metadata: { name: '', mime_type: undefined } })).ingest({ provider: 'onedrive', resource: 'file-1' }), 'CLOUD_INGESTION_MALFORMED_RESPONSE')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'onedrive', metadata: { parent_ids: ['root', 4 as unknown as string] } })).ingest({ provider: 'onedrive', resource: 'file-1' }), 'CLOUD_INGESTION_MALFORMED_RESPONSE')
  await rejectsWithCode(serviceFor(fakeProvider({ name: 'onedrive', readError: new OneDriveError('ONEDRIVE_RESPONSE_INVALID', 'provider payload must not escape') })).ingest({ provider: 'onedrive', resource: 'file-1' }), 'CLOUD_INGESTION_MALFORMED_RESPONSE')
})

test('the normalized content composes with the existing schedule spreadsheet parser', async () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Date', 'Start time', 'End time', 'Brand', 'Platform', 'Campaign', 'Shift title', 'Studio'],
    ['2026-09-10', '10:00', '13:00', 'TechGear Pro', 'TikTok Shop', 'Flash Sale Week', 'Cloud imported shift', 'Studio A'],
  ])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  const content = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  const maps = {
    brands: new Map([['TechGear Pro', 'brand-1']]),
    platforms: new Map([['TikTok Shop', 'platform-1']]),
    campaigns: new Map([['Flash Sale Week', 'campaign-1']]),
  }

  const results = await Promise.all((['google_drive', 'onedrive'] as const).map(providerName => serviceFor(fakeProvider({ name: providerName, resourceId: `${providerName}-file-1`, content, metadata: { name: 'schedule.xlsx', mime_type: XLSX_MIME, size_bytes: content.byteLength } })).ingest({
    provider: providerName,
    resource: `${providerName}-file-1`,
    expectedContentType: XLSX_MIME,
    purpose: 'schedule_import',
  })))
  const parsed = results.map(result => parseScheduleTabularData(arrayBufferOf(result.content), 'array', maps))
  assert.deepEqual(parsed[0], parsed[1])
  assert.equal(parsed[0].success, true)
  assert.equal(parsed[0].validRows, 1)
  assert.equal(parsed[0].rows[0].row.title, 'Cloud imported shift')
})

test('the same neutral service can supply report content without wiring report UX', async () => {
  const result = await serviceFor(fakeProvider({ name: 'onedrive', resourceId: 'report-image-1', metadata: { name: 'evidence.png', mime_type: 'image/png' }, content: new Uint8Array([8, 9]) })).ingest({
    provider: 'onedrive',
    resource: 'report-image-1',
    expectedContentType: 'image/png',
    purpose: 'report',
  })
  assert.equal(result.filename, 'evidence.png')
  assert.deepEqual([...result.content], [8, 9])
})

