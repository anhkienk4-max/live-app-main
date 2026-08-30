import assert from 'node:assert/strict'
import test from 'node:test'

import { createFileStorageService } from '@/lib/services/fileStorageService'
import type { FileUploadInput } from '@/lib/files/fileProvider'
import { FileProviderError } from '@/lib/server/fileProviderResolver'
import { createGoogleDriveFileProvider } from '@/lib/server/googleDriveFileProvider'
import { createGoogleDriveAuth, GoogleDriveError, resolveGoogleDriveAuthMode } from '@/lib/server/googleDriveAuth'

const env = {
  NODE_ENV: 'production',
  GOOGLE_DRIVE_AUTH_MODE: 'oauth_refresh_token',
  GOOGLE_DRIVE_CLIENT_ID: 'client-id',
  GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'refresh-token',
  GOOGLE_DRIVE_ROOT_FOLDER_ID: 'root-folder',
}

const serviceAccountEnv = {
  NODE_ENV: 'production',
  GOOGLE_DRIVE_AUTH_MODE: 'service_account',
  GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: 'storage@example.iam.gserviceaccount.com',
  GOOGLE_DRIVE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----',
  GOOGLE_DRIVE_ROOT_FOLDER_ID: 'root-folder',
}

const input: FileUploadInput = {
  name: '../báo cáo.png',
  mime_type: 'image/png',
  size_bytes: 4,
  content: new Uint8Array([1, 2, 3, 4]),
  checksum_sha256: 'a'.repeat(64),
  entity_type: 'report',
  entity_id: 'report-1',
  created_by: 'business-user-1',
  logical_path: 'LiveStreamOps/reports/2026/08/report-1',
}

type FakeState = {
  folderIds: Map<string, string>
  folderCreates: number
  uploaded?: Record<string, unknown>
  trashed?: boolean
  listCalls: number
  uploadCalls: number
  failUpload429: number
  rootMimeType: string
}

function fakeDrive(state: FakeState) {
  return {
    files: {
      async list(params: { q: string }) {
        state.listCalls += 1
        const name = params.q.match(/name = '((?:\\\\|\\')*)'/)?.[1]?.replace(/\\'/g, "'") ?? ''
        const parent = params.q.match(/'([^']+)' in parents/)?.[1] ?? ''
        const id = state.folderIds.get(`${parent}/${name}`)
        return { data: { files: id ? [{ id, name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }] : [] } }
      },
      async create(params: { requestBody: Record<string, unknown>; media?: { mimeType: string; body: Buffer } }) {
        if (params.media) {
          state.uploadCalls += 1
          if (state.failUpload429 > 0) {
            state.failUpload429 -= 1
            const error = Object.assign(new Error('rate limited'), { response: { status: 429 } })
            throw error
          }
          state.uploaded = { ...params.requestBody, mimeType: params.media.mimeType, content: params.media.body }
          return { data: { id: 'drive-file-1', name: params.requestBody.name as string, mimeType: params.media.mimeType, size: '4', md5Checksum: 'md5', parents: params.requestBody.parents as string[], createdTime: '2026-08-30T00:00:00.000Z' } }
        }
        state.folderCreates += 1
        const id = `folder-${state.folderCreates}`
        const parent = (params.requestBody.parents as string[])[0]
        state.folderIds.set(`${parent}/${params.requestBody.name as string}`, id)
        return { data: { id, name: params.requestBody.name as string, mimeType: 'application/vnd.google-apps.folder', parents: [parent] } }
      },
      async get(params: { fileId: string; fields: string }) {
        if (params.fileId === 'missing') {
          throw Object.assign(new Error('not found'), { response: { status: 404 } })
        }
        if (params.fileId === 'root-folder') return { data: { id: 'root-folder', name: 'Root', mimeType: state.rootMimeType, trashed: false } }
        return { data: { id: params.fileId, name: 'báo cáo.png', mimeType: 'image/png', size: '4', md5Checksum: 'md5', parents: ['folder-3'], webViewLink: 'https://drive.google.com/file/d/drive-file-1/view' } }
      },
      async update(params: { fileId: string; requestBody: Record<string, unknown> }) {
        state.trashed = params.requestBody.trashed === true
        return { data: { id: params.fileId, trashed: state.trashed } }
      },
    },
  }
}

function state(): FakeState {
  return { folderIds: new Map(), folderCreates: 0, listCalls: 0, uploadCalls: 0, failUpload429: 0, rootMimeType: 'application/vnd.google-apps.folder' }
}

test('OAuth refresh-token mode is the default and requires every credential', () => {
  assert.equal(resolveGoogleDriveAuthMode({ NODE_ENV: 'production' }), 'oauth_refresh_token')
  assert.throws(() => createGoogleDriveAuth({ NODE_ENV: 'production' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
  assert.throws(() => createGoogleDriveAuth({ ...env, GOOGLE_DRIVE_CLIENT_ID: '' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
  assert.throws(() => createGoogleDriveAuth({ ...env, GOOGLE_DRIVE_CLIENT_SECRET: '' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
  assert.throws(() => createGoogleDriveAuth({ ...env, GOOGLE_DRIVE_REFRESH_TOKEN: '' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
})

test('OAuth client receives the refresh token without a browser OAuth flow', () => {
  const result = createGoogleDriveAuth(env)
  assert.equal(result.mode, 'oauth_refresh_token')
  assert.equal((result.auth as { credentials?: { refresh_token?: string } }).credentials?.refresh_token, 'refresh-token')
})

test('service-account mode is explicit and malformed keys fail closed', () => {
  assert.equal(resolveGoogleDriveAuthMode(serviceAccountEnv), 'service_account')
  assert.equal(createGoogleDriveAuth(serviceAccountEnv).mode, 'service_account')
  assert.throws(() => createGoogleDriveAuth({ ...serviceAccountEnv, GOOGLE_DRIVE_PRIVATE_KEY: 'not-a-pem' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_AUTH_FAILED')
  assert.throws(() => createGoogleDriveAuth({ ...serviceAccountEnv, GOOGLE_DRIVE_AUTH_MODE: 'invalid' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_AUTH_FAILED')
  assert.throws(() => createGoogleDriveAuth({ ...serviceAccountEnv, GOOGLE_DRIVE_AUTH_MODE: undefined }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
  assert.throws(() => createGoogleDriveAuth({ NODE_ENV: 'production', GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: serviceAccountEnv.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY: serviceAccountEnv.GOOGLE_DRIVE_PRIVATE_KEY }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
})

test('root folder configuration is required independently of auth mode', () => {
  assert.throws(() => createGoogleDriveFileProvider({ env: { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: '' } }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
})

test('health check validates the configured root folder', async () => {
  const valid = createGoogleDriveFileProvider({ env, drive: fakeDrive(state()) })
  assert.deepEqual(await valid.healthCheck(), { ok: true, provider: 'google_drive' })
  const invalidState = state()
  invalidState.rootMimeType = 'text/plain'
  const invalid = createGoogleDriveFileProvider({ env, drive: fakeDrive(invalidState) })
  await assert.rejects(() => invalid.healthCheck(), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_ROOT_FOLDER_INVALID')
})

test('folder resolution is deterministic and idempotent under the configured root', async () => {
  const driveState = state()
  const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(driveState), retryDelayMs: 0 })
  await provider.upload(input)
  const createsAfterFirstUpload = driveState.folderCreates
  await provider.upload(input)
  assert.equal(createsAfterFirstUpload, 5)
  assert.equal(driveState.folderCreates, createsAfterFirstUpload)
  assert.equal(driveState.uploadCalls, 2)
})

test('upload maps sanitized metadata, MIME and binary content without sharing calls', async () => {
  const driveState = state()
  const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(driveState), retryDelayMs: 0 })
  const result = await provider.upload(input)
  assert.equal(result.asset.external_file_id, 'drive-file-1')
  assert.equal(result.asset.name, 'báo cáo.png')
  assert.equal(result.asset.mime_type, 'image/png')
  assert.equal(result.asset.size_bytes, 4)
  assert.equal(result.asset.provider_metadata?.md5_checksum, 'md5')
  assert.deepEqual(driveState.uploaded?.content, Buffer.from([1, 2, 3, 4]))
  assert.equal('permissions' in driveState, false)
})

test('view and download URLs remain private provider-authenticated links', async () => {
  const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(state()), retryDelayMs: 0 })
  assert.equal(await provider.getViewUrl('drive-file-1'), 'https://drive.google.com/file/d/drive-file-1/view')
  assert.equal(await provider.getDownloadUrl('drive-file-1'), 'https://www.googleapis.com/drive/v3/files/drive-file-1?alt=media')
})

test('delete moves a Drive file to trash and does not permanently destroy it', async () => {
  const driveState = state()
  const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(driveState), retryDelayMs: 0 })
  await provider.delete('drive-file-1')
  assert.equal(driveState.trashed, true)
})

test('404 maps to FILE_NOT_FOUND and transient 429 retries are bounded', async () => {
  const driveState = state()
  driveState.failUpload429 = 1
  const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(driveState), retryDelayMs: 0 })
  const result = await provider.upload(input)
  assert.equal(result.asset.external_file_id, 'drive-file-1')
  assert.equal(driveState.uploadCalls, 2)
  await assert.rejects(() => provider.getMetadata('missing'), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_FILE_NOT_FOUND')
})

test('authentication failures are deterministic and do not retry blindly', async () => {
  const drive = fakeDrive(state())
  const authDrive = {
    ...drive,
    files: { ...drive.files, async get() { throw Object.assign(new Error('forbidden'), { response: { status: 403 } }) } },
  }
  const provider = createGoogleDriveFileProvider({ env, drive: authDrive, retryDelayMs: 0 })
  await assert.rejects(() => provider.healthCheck(), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_AUTH_FAILED')
})

test('gateway resolves FILE_PROVIDER=google_drive without exposing a browser provider', () => {
  const gateway = createFileStorageService({ env: { ...env, FILE_PROVIDER: 'google_drive' } })
  assert.equal(gateway.providerName, 'google_drive')
  assert.equal(new FileProviderError('x').name, 'FileProviderError')
})

test('configured OneDrive remains an explicit not-implemented boundary', async () => {
  const gateway = createFileStorageService({ env: { NODE_ENV: 'production', FILE_PROVIDER: 'onedrive' } })
  await assert.rejects(() => gateway.upload(input), (error: unknown) => error instanceof FileProviderError && error.code === 'FILE_PROVIDER_NOT_IMPLEMENTED')
})
