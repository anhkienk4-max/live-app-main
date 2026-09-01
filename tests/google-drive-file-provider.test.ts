import assert from 'node:assert/strict'
import test from 'node:test'

import { createFileStorageService } from '@/lib/services/fileStorageService'
import type { FileUploadInput } from '@/lib/files/fileProvider'
import { FileProviderError } from '@/lib/server/fileProviderResolver'
import { createGoogleDriveFileProvider } from '@/lib/server/googleDriveFileProvider'
import {
  createGoogleDriveAuthorizationUrl,
  createGoogleDriveAuth,
  createGoogleDriveOAuthState,
  exchangeGoogleDriveAuthorizationCode,
  GoogleDriveError,
  resolveGoogleDriveAuthMode,
  resolveGoogleDriveOAuthRedirectUri,
  validateGoogleDriveOAuthState,
} from '@/lib/server/googleDriveAuth'
import { normalizeGoogleDriveFileId, parseGoogleDriveFolderUrl, validateGoogleDriveFolder } from '@/lib/server/googleDriveDestination'

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
  rootDriveId?: string
  customFolder?: { mimeType: string; trashed?: boolean; driveId?: string; capabilities?: { canAddChildren?: boolean; canEdit?: boolean } }
  allDriveFlags: { list: boolean; create: boolean; get: boolean; update: boolean }
  readData: Uint8Array
}

function fakeDrive(state: FakeState) {
  return {
    files: {
      async list(params: { q: string; supportsAllDrives?: boolean; includeItemsFromAllDrives?: boolean }) {
        state.listCalls += 1
        state.allDriveFlags.list = params.supportsAllDrives === true && params.includeItemsFromAllDrives === true
        const name = params.q.match(/name = '((?:\\\\|\\')*)'/)?.[1]?.replace(/\\'/g, "'") ?? ''
        const parent = params.q.match(/'([^']+)' in parents/)?.[1] ?? ''
        const id = state.folderIds.get(`${parent}/${name}`)
        if (!params.q.includes("name = '")) return { data: { files: [{ id: 'drive-file-1', name: 'report.png', mimeType: 'image/png', size: '4', parents: [parent] }, { id: 'folder-3', name: 'Folder', mimeType: 'application/vnd.google-apps.folder', parents: [parent] }] } }
        return { data: { files: id ? [{ id, name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }] : [] } }
      },
      async create(params: { requestBody: Record<string, unknown>; media?: { mimeType: string; body: Buffer }; supportsAllDrives?: boolean }) {
        state.allDriveFlags.create = params.supportsAllDrives === true
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
      async get(params: { fileId: string; fields?: string; alt?: 'media'; responseType?: 'arraybuffer'; supportsAllDrives?: boolean }) {
        state.allDriveFlags.get = params.supportsAllDrives === true
        if (params.fileId === 'missing') {
          throw Object.assign(new Error('not found'), { response: { status: 404 } })
        }
        if (params.fileId === 'root-folder') return { data: { id: 'root-folder', name: 'Root', mimeType: state.rootMimeType, trashed: false, driveId: state.rootDriveId } }
        if (params.fileId === 'custom-folder' && state.customFolder) {
          return { data: { id: 'custom-folder', name: 'Custom', ...state.customFolder } }
        }
        if (params.alt === 'media') return { data: state.readData }
        return { data: { id: params.fileId, name: 'báo cáo.png', mimeType: 'image/png', size: '4', md5Checksum: 'md5', parents: ['folder-3'], webViewLink: 'https://drive.google.com/file/d/drive-file-1/view' } }
      },
      async update(params: { fileId: string; requestBody: Record<string, unknown>; supportsAllDrives?: boolean }) {
        state.allDriveFlags.update = params.supportsAllDrives === true
        state.trashed = params.requestBody.trashed === true
        return { data: { id: params.fileId, trashed: state.trashed } }
      },
    },
  }
}

function state(): FakeState {
  return {
    folderIds: new Map(),
    folderCreates: 0,
    listCalls: 0,
    uploadCalls: 0,
    failUpload429: 0,
    rootMimeType: 'application/vnd.google-apps.folder',
    allDriveFlags: { list: false, create: false, get: false, update: false },
    readData: new Uint8Array([1, 2, 3, 4]),
  }
}

test('OAuth refresh-token mode is the default and requires every credential', () => {
  assert.equal(resolveGoogleDriveAuthMode({ NODE_ENV: 'production' }), 'oauth_refresh_token')
  assert.throws(() => createGoogleDriveAuth({ NODE_ENV: 'production' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
  assert.throws(() => createGoogleDriveAuth({ ...env, GOOGLE_DRIVE_CLIENT_ID: '' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
  assert.throws(() => createGoogleDriveAuth({ ...env, GOOGLE_DRIVE_CLIENT_SECRET: '' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
  assert.throws(() => createGoogleDriveAuth({ ...env, GOOGLE_DRIVE_REFRESH_TOKEN: '' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
})

test('OAuth state, redirect and code exchange are validated without exposing secrets', async () => {
  const testEnv = { ...env, NODE_ENV: 'test' }
  const state = createGoogleDriveOAuthState()
  assert.equal(state.length > 20, true)
  assert.equal(resolveGoogleDriveOAuthRedirectUri(testEnv), 'http://127.0.0.1:53682/oauth2callback')
  const authorizationUrl = createGoogleDriveAuthorizationUrl({ env: testEnv, state })
  assert.equal(new URL(authorizationUrl).searchParams.get('state'), state)
  assert.throws(() => validateGoogleDriveOAuthState('wrong', state), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_OAUTH_STATE_INVALID')

  let exchangedCode = ''
  const oauthClient = {
    generateAuthUrl: () => 'https://accounts.google.com/o/oauth2/auth',
    async getToken(code: string) {
      exchangedCode = code
      return { tokens: { refresh_token: 'refresh-token', expiry_date: 123 } }
    },
  }
  const tokens = await exchangeGoogleDriveAuthorizationCode({ env: testEnv, code: ' auth-code ', expectedState: state, receivedState: state, oauthClient })
  assert.equal(exchangedCode, 'auth-code')
  assert.deepEqual(tokens, { refresh_token: 'refresh-token', expiry_date: 123 })
  await assert.rejects(() => exchangeGoogleDriveAuthorizationCode({ env: testEnv, code: 'auth-code', expectedState: state, receivedState: 'wrong', oauthClient }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_OAUTH_STATE_INVALID')
})

test('revoked OAuth grants normalize to re-authentication-required', async () => {
  const oauthClient = {
    generateAuthUrl: () => 'https://accounts.google.com/o/oauth2/auth',
    async getToken() {
      throw Object.assign(new Error('invalid grant'), { response: { status: 400, data: { error: 'invalid_grant' } } })
    },
  }
  await assert.rejects(() => exchangeGoogleDriveAuthorizationCode({ env: { ...env, NODE_ENV: 'test' }, code: 'auth-code', oauthClient }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_REAUTH_REQUIRED')
})

test('Google OAuth client refreshes an expired token and retries the API once', async () => {
  const auth = createGoogleDriveAuth(env).auth as {
    credentials: { access_token?: string; refresh_token?: string; expiry_date?: number }
    forceRefreshOnFailure: boolean
    transporter: { request(options: { url?: string | URL }): Promise<unknown> }
    request(options: { url: string; method: string }): Promise<unknown>
  }
  auth.credentials = { access_token: 'expired-access-token', refresh_token: 'refresh-token', expiry_date: Date.now() + 600_000 }
  auth.forceRefreshOnFailure = true
  let refreshRequests = 0
  let apiRequests = 0
  auth.transporter.request = async (options) => {
    if (String(options.url).includes('/token')) {
      refreshRequests += 1
      return { data: { access_token: 'fresh-access-token', expires_in: 3600, token_type: 'Bearer' }, status: 200, config: {}, headers: {} }
    }
    apiRequests += 1
    if (apiRequests === 1) throw Object.assign(new Error('expired'), { response: { status: 401, config: { data: undefined } } })
    return { data: { ok: true }, status: 200, config: {}, headers: {} }
  }
  const result = await auth.request({ url: 'https://www.googleapis.com/drive/v3/files', method: 'GET' })
  assert.deepEqual((result as { data: unknown }).data, { ok: true })
  assert.equal(refreshRequests, 1)
  assert.equal(apiRequests, 2)
})

test('production OAuth redirects fail closed unless HTTPS is explicitly configured', () => {
  assert.throws(() => resolveGoogleDriveOAuthRedirectUri({ NODE_ENV: 'production' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_NOT_CONFIGURED')
  assert.throws(() => resolveGoogleDriveOAuthRedirectUri({ NODE_ENV: 'production', GOOGLE_DRIVE_OAUTH_REDIRECT_URI: 'http://example.test/callback' }), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_AUTH_FAILED')
  assert.equal(resolveGoogleDriveOAuthRedirectUri({ NODE_ENV: 'production', GOOGLE_DRIVE_OAUTH_REDIRECT_URI: 'https://app.example.test/auth/google/callback' }), 'https://app.example.test/auth/google/callback')
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

test('supported Google Drive folder URL formats resolve deterministically', () => {
  assert.equal(parseGoogleDriveFolderUrl('https://drive.google.com/drive/folders/folder-123'), 'folder-123')
  assert.equal(parseGoogleDriveFolderUrl('https://drive.google.com/drive/u/0/folders/folder-123?usp=sharing'), 'folder-123')
  assert.equal(parseGoogleDriveFolderUrl('https://drive.google.com/open?id=folder-123'), 'folder-123')
})

test('Google Drive file and Docs URLs normalize to provider IDs', () => {
  assert.equal(normalizeGoogleDriveFileId('drive-file-1'), 'drive-file-1')
  assert.equal(normalizeGoogleDriveFileId('https://drive.google.com/file/d/drive-file-1/view'), 'drive-file-1')
  assert.equal(normalizeGoogleDriveFileId('https://drive.google.com/open?id=drive-file-1'), 'drive-file-1')
  assert.equal(normalizeGoogleDriveFileId('https://docs.google.com/spreadsheets/d/sheet-1/edit'), 'sheet-1')
  for (const value of ['https://drive.google.com/drive/folders/folder-1', 'https://example.com/file/d/file-1', 'bad id']) {
    assert.throws(() => normalizeGoogleDriveFileId(value), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_FILE_ID_INVALID')
  }
})

test('malformed, non-Drive and file URLs are rejected', () => {
  for (const value of [
    'not a URL',
    'https://example.com/drive/folders/folder-123',
    'https://drive.google.com/file/d/file-123/view',
    'https://drive.google.com/drive/folders/',
    'https://drive.google.com/drive/folders/bad%20id',
  ]) {
    assert.throws(() => parseGoogleDriveFolderUrl(value), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_FOLDER_URL_INVALID')
  }
})

test('custom folder validation rejects missing, non-folder, trashed and read-only targets', async () => {
  const cases = [
    { expected: 'GOOGLE_DRIVE_FOLDER_NOT_FOUND' as const, configure: () => undefined, id: 'missing' },
    { expected: 'GOOGLE_DRIVE_FOLDER_INVALID' as const, configure: (target: FakeState) => { target.customFolder = { mimeType: 'text/plain' } }, id: 'custom-folder' },
    { expected: 'GOOGLE_DRIVE_FOLDER_INVALID' as const, configure: (target: FakeState) => { target.customFolder = { mimeType: 'application/vnd.google-apps.folder', trashed: true } }, id: 'custom-folder' },
    { expected: 'GOOGLE_DRIVE_FOLDER_NOT_WRITABLE' as const, configure: (target: FakeState) => { target.customFolder = { mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: false, canEdit: false } } }, id: 'custom-folder' },
  ]
  for (const item of cases) {
    const driveState = state()
    item.configure(driveState)
    const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(driveState), retryDelayMs: 0 })
    await assert.rejects(
      () => provider.upload({ ...input, destination: { provider: 'google_drive', external_folder_id: item.id } }),
      (error: unknown) => error instanceof GoogleDriveError && error.code === item.expected,
    )
  }
})

test('writable custom folder is accepted and receives the file directly', async () => {
  const driveState = state()
  driveState.customFolder = {
    mimeType: 'application/vnd.google-apps.folder',
    capabilities: { canAddChildren: true, canEdit: true },
  }
  const folder = await validateGoogleDriveFolder(fakeDrive(driveState), 'custom-folder')
  assert.equal(folder.id, 'custom-folder')
  const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(driveState), retryDelayMs: 0 })
  await provider.upload({ ...input, destination: { provider: 'google_drive', folder_url: 'https://drive.google.com/drive/folders/custom-folder' } })
  assert.deepEqual(driveState.uploaded?.parents, ['custom-folder'])
  assert.equal(driveState.folderCreates, 0)
  assert.equal(driveState.allDriveFlags.get, true)
  assert.equal(driveState.allDriveFlags.create, true)
})

test('invalid custom destination never falls back to the managed root', async () => {
  const driveState = state()
  driveState.customFolder = { mimeType: 'text/plain' }
  const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(driveState), retryDelayMs: 0 })
  await assert.rejects(
    () => provider.upload({ ...input, destination: { provider: 'google_drive', external_folder_id: 'custom-folder' } }),
    (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_FOLDER_INVALID',
  )
  assert.equal(driveState.folderCreates, 0)
  assert.equal(driveState.uploadCalls, 0)
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

test('list and read stay provider-neutral and use normalized IDs', async () => {
  const driveState = state()
  const provider = createGoogleDriveFileProvider({ env, drive: fakeDrive(driveState), retryDelayMs: 0 })
  const entries = await provider.list()
  assert.deepEqual(entries.map(entry => entry.kind), ['file', 'folder'])
  assert.deepEqual([...await provider.read('https://drive.google.com/file/d/drive-file-1/view')], [1, 2, 3, 4])
  assert.equal(provider.normalizeId('https://docs.google.com/document/d/doc-1/edit'), 'doc-1')
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
  await assert.rejects(() => provider.healthCheck(), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_PERMISSION_DENIED')
})

test('Drive error statuses normalize to stable application errors', async () => {
  const cases = [
    [401, 'GOOGLE_DRIVE_REAUTH_REQUIRED'],
    [403, 'GOOGLE_DRIVE_PERMISSION_DENIED'],
    [429, 'GOOGLE_DRIVE_RATE_LIMITED'],
    [503, 'GOOGLE_DRIVE_PROVIDER_UNAVAILABLE'],
  ] as const
  for (const [status, code] of cases) {
    const drive = fakeDrive(state())
    const failingDrive = { ...drive, files: { ...drive.files, async get() { throw Object.assign(new Error('provider failure'), { response: { status } }) } } }
    const provider = createGoogleDriveFileProvider({ env, drive: failingDrive, retryDelayMs: 0 })
    await assert.rejects(() => provider.healthCheck(), (error: unknown) => error instanceof GoogleDriveError && error.code === code)
  }
})

test('provider-level invalid_grant failures do not fall back to a generic operation error', async () => {
  const drive = fakeDrive(state())
  const failingDrive = { ...drive, files: { ...drive.files, async get() { throw Object.assign(new Error('invalid grant'), { response: { status: 400, data: { error: 'invalid_grant' } } }) } } }
  const provider = createGoogleDriveFileProvider({ env, drive: failingDrive, retryDelayMs: 0 })
  await assert.rejects(() => provider.healthCheck(), (error: unknown) => error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_REAUTH_REQUIRED')
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
