import assert from 'node:assert/strict'
import assert from 'node:assert/strict'
import test from 'node:test'

import type { FileProvider } from '@/lib/files/fileProvider'
import { createGoogleDriveFileProvider } from '@/lib/server/googleDriveFileProvider'
import { createOneDriveAuthorizationUrl, createOneDriveAuthClient, createOneDriveOAuthState, exchangeOneDriveAuthorizationCode, OneDriveError, type OneDriveAuthClient, type OneDriveEnvironment, type OneDriveFetch, type OneDriveHttpResponse } from '@/lib/server/oneDriveAuth'
import { normalizeOneDriveItemId, classifyOneDriveLink } from '@/lib/server/oneDriveDestination'
import { createOneDriveFileProvider } from '@/lib/server/oneDriveFileProvider'

const env: OneDriveEnvironment = {
  NODE_ENV: 'test',
  ONEDRIVE_CLIENT_ID: 'client-id',
  ONEDRIVE_CLIENT_SECRET: 'client-secret',
  ONEDRIVE_TENANT_ID: 'tenant-id',
  ONEDRIVE_REDIRECT_URI: 'http://127.0.0.1:53683/oauth2callback',
  ONEDRIVE_REFRESH_TOKEN: 'refresh-token',
}

function response(status: number, body: unknown = {}, bytes = new Uint8Array(), retryAfter?: string): OneDriveHttpResponse {
  return {
    status,
    headers: { get(name: string) { return name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null } },
    async json() { return body },
    async arrayBuffer() { return bytes.slice().buffer },
  }
}

function authClient(tokens = ['access-token']): OneDriveAuthClient & { refreshes: number } {
  let index = 0
  let refreshes = 0
  return {
    refreshes,
    async getAccessToken() { return tokens[Math.min(index, tokens.length - 1)] ?? 'access-token' },
    async refreshAccessToken() { refreshes += 1; index += 1; this.refreshes = refreshes; return tokens[Math.min(index, tokens.length - 1)] ?? 'refreshed-token' },
    connectionStatus() { return 'connected' },
  }
}

function graphClient(responses: OneDriveHttpResponse[]): OneDriveGraphClient & { calls: Array<{ path: string; accessToken: string }> } {
  const calls: Array<{ path: string; accessToken: string }> = []
  return {
    calls,
    async request(path, options) {
      calls.push({ path, accessToken: options.accessToken })
      return responses.shift() ?? response(500)
    },
  }
}

const item = (id = 'item-1') => ({ id, name: 'Report.pdf', size: 4, webUrl: 'https://onedrive.example/report', '@microsoft.graph.downloadUrl': 'https://download.example/report', file: { mimeType: 'application/pdf' }, parentReference: { id: 'root' } })

test('OneDrive IDs, Graph URLs and share links have explicit normalization boundaries', () => {
  assert.equal(normalizeOneDriveItemId('item-1!A'), 'item-1!A')
  assert.equal(normalizeOneDriveItemId('https://graph.microsoft.com/v1.0/me/drive/items/item-1!A'), 'item-1!A')
  assert.equal(classifyOneDriveLink('item-1'), 'local_id')
  assert.equal(classifyOneDriveLink('https://graph.microsoft.com/v1.0/me/drive/items/item-1'), 'graph_url')
  assert.equal(classifyOneDriveLink('https://1drv.ms/u/s!short'), 'remote_share_link')
  assert.throws(() => normalizeOneDriveItemId('https://1drv.ms/u/s!short'), (error: unknown) => error instanceof OneDriveError && error.code === 'ONEDRIVE_SHARE_LINK_REMOTE_REQUIRED')
  for (const value of ['', 'not an id', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'https://example.com/file/item-1']) {
    assert.throws(() => normalizeOneDriveItemId(value), (error: unknown) => error instanceof OneDriveError && error.code === 'ONEDRIVE_FILE_ID_INVALID')
  }
})

test('OneDrive list, metadata, read and URL operations use provider-neutral shapes', async () => {
  const auth = authClient()
  const graph = graphClient([
    response(200, { value: [item(), { ...item('folder-1'), folder: {} }] }),
    response(200, item()),
    response(200, {}, new Uint8Array([1, 2, 3, 4])),
    response(200, item()),
    response(200, item()),
  ])
  const provider = createOneDriveFileProvider({ auth, graph })
  const entries = await provider.list()
  assert.deepEqual(entries.map(entry => entry.kind), ['file', 'folder'])
  assert.equal((await provider.getMetadata('item-1')).mime_type, 'application/pdf')
  assert.deepEqual([...await provider.read('item-1')], [1, 2, 3, 4])
  assert.equal(await provider.getViewUrl('item-1'), 'https://onedrive.example/report')
  assert.equal(await provider.getDownloadUrl('item-1'), 'https://download.example/report')
  assert.deepEqual(graph.calls.map(call => call.path), ['/drive/root/children', '/drive/items/item-1', '/drive/items/item-1/content', '/drive/items/item-1', '/drive/items/item-1'])
})

test('Graph 401 refreshes once and retries once with the refreshed token', async () => {
  const auth = authClient(['old-token', 'new-token'])
  const graph = graphClient([response(401), response(200, item())])
  const provider = createOneDriveFileProvider({ auth, graph })
  assert.equal((await provider.getMetadata('item-1')).id, 'item-1')
  assert.equal(auth.refreshes, 1)
  assert.deepEqual(graph.calls.map(call => call.accessToken), ['old-token', 'new-token'])
})

test('Graph errors and malformed responses normalize without exposing Graph error strings', async () => {
  const cases = [
    [401, 'ONEDRIVE_REAUTH_REQUIRED'],
    [403, 'ONEDRIVE_PERMISSION_DENIED'],
    [404, 'ONEDRIVE_ITEM_NOT_FOUND'],
    [429, 'ONEDRIVE_RATE_LIMITED'],
    [503, 'ONEDRIVE_PROVIDER_UNAVAILABLE'],
  ] as const
  for (const [status, code] of cases) {
    const failures = [response(status, { error: { code: 'InvalidAuthenticationToken', message: 'do not expose' } }, new Uint8Array(), '7')]
    if (status === 401) failures.push(response(status, { error: { code: 'InvalidAuthenticationToken', message: 'do not expose' } }))
    const provider = createOneDriveFileProvider({ auth: authClient(), graph: graphClient(failures) })
    await assert.rejects(() => provider.getMetadata('item-1'), (error: unknown) => error instanceof OneDriveError && error.code === code && !error.message.includes('InvalidAuthenticationToken'))
  }
  const malformed = createOneDriveFileProvider({ auth: authClient(), graph: graphClient([response(200, { id: 'item-1' })]) })
  await assert.rejects(() => malformed.getMetadata('item-1'), (error: unknown) => error instanceof OneDriveError && error.code === 'ONEDRIVE_RESPONSE_INVALID')
})

test('Graph transport failures normalize at the provider boundary', async () => {
  const provider = createOneDriveFileProvider({
    auth: authClient(),
    graph: { async request() { throw Object.assign(new Error('socket closed'), { code: 'ECONNRESET' }) } },
  })
  await assert.rejects(() => provider.getMetadata('item-1'), (error: unknown) => error instanceof OneDriveError && error.code === 'ONEDRIVE_NETWORK_ERROR')
})

test('upload is supported with sanitized names while delete remains explicit unsupported', async () => {
  const graph = graphClient([response(200, { value: [] })])
  const originalFetch = globalThis.fetch
  const requests: Array<{ url: string; method: string; body: Uint8Array }> = []
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      body: init?.body instanceof Uint8Array ? init.body : new Uint8Array(),
    })
    return {
      ok: true,
      status: 200,
      async json() { return { ...item('uploaded-1'), name: 'report-.pdf' } },
    } as Response
  }) as typeof fetch
  try {
    const provider = createOneDriveFileProvider({ auth: authClient(), graph })
    const result = await provider.upload({
      name: '../report?.pdf',
      mime_type: 'application/pdf',
      size_bytes: 4,
      content: new Uint8Array([1, 2, 3, 4]),
      entity_type: 'report',
      entity_id: 'report-1',
      created_by: 'user-1',
      logical_path: 'reports',
      external_parent_id: 'root',
    })
    assert.equal(result.asset.provider, 'onedrive')
    assert.equal(result.asset.name, 'report-.pdf')
    assert.equal(requests.length, 1)
    assert.match(requests[0].url, /drive\/root:\/report-\.pdf:\/content$/)
    assert.equal(requests[0].method, 'PUT')
    assert.deepEqual([...requests[0].body], [1, 2, 3, 4])
    await assert.rejects(() => provider.delete('item-1'), (error: unknown) => error instanceof OneDriveError && error.code === 'ONEDRIVE_OPERATION_UNSUPPORTED')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Microsoft OAuth state, redirect, exchange and refresh failure are deterministic', async () => {
  const state = createOneDriveOAuthState()
  const authorizationUrl = createOneDriveAuthorizationUrl({ env, state })
  assert.equal(new URL(authorizationUrl).searchParams.get('state'), state)
  let exchangeBody = ''
  const fetchImpl: OneDriveFetch = async (_input, init) => {
    exchangeBody = String(init?.body ?? '')
    return response(200, { access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 })
  }
  const exchanged = await exchangeOneDriveAuthorizationCode({ env, code: 'code', expectedState: state, receivedState: state, fetchImpl })
  assert.equal(exchanged.refresh_token, 'refresh-token')
  assert.match(exchangeBody, /grant_type=authorization_code/)
  await assert.rejects(() => exchangeOneDriveAuthorizationCode({ env, code: 'code', expectedState: state, receivedState: 'wrong', fetchImpl }), (error: unknown) => error instanceof OneDriveError && error.code === 'ONEDRIVE_AUTH_FAILED')

  let refreshCalls = 0
  const refreshFetch: OneDriveFetch = async () => { refreshCalls += 1; return response(400, { error: 'invalid_grant' }) }
  const auth = createOneDriveAuthClient({ env, fetchImpl: refreshFetch, initialTokens: { refresh_token: 'refresh-token', access_token: 'expired', expires_at: 1 } })
  await assert.rejects(() => auth.getAccessToken(), (error: unknown) => error instanceof OneDriveError && error.code === 'ONEDRIVE_REAUTH_REQUIRED')
  assert.equal(refreshCalls, 1)
})

test('Google Drive and OneDrive implement the same frozen FileProvider surface', async () => {
  const googleEnv = { NODE_ENV: 'production', GOOGLE_DRIVE_AUTH_MODE: 'oauth_refresh_token', GOOGLE_DRIVE_CLIENT_ID: 'client-id', GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret', GOOGLE_DRIVE_REFRESH_TOKEN: 'refresh-token', GOOGLE_DRIVE_ROOT_FOLDER_ID: 'root' }
  const google = createGoogleDriveFileProvider({ env: googleEnv, retryDelayMs: 0, drive: { files: {
    async list() { return { data: { files: [{ id: 'google-id', name: 'file', mimeType: 'text/plain', parents: ['root'] }] } } },
    async create() { return { data: { id: 'created', name: 'file', mimeType: 'text/plain', size: '0', parents: ['root'] } } },
    async get(params: { fileId: string; alt?: 'media' }) { return params.alt === 'media' ? { data: new Uint8Array() } : { data: { id: params.fileId, name: 'file', mimeType: 'text/plain', webViewLink: 'https://drive.example/file' } } },
    async update() { return { data: { id: 'google-id', trashed: true } } },
  } } })
  const one = createOneDriveFileProvider({ auth: authClient(), graph: graphClient([response(200, { value: [item()] }), response(200, item()), response(200, {}, new Uint8Array())]) })
  for (const provider of [google, one] as FileProvider[]) {
    assert.equal(typeof provider.name, 'string')
    assert.equal(typeof provider.normalizeId, 'function')
    assert.equal(typeof provider.list, 'function')
    assert.equal(typeof provider.getMetadata, 'function')
    assert.equal(typeof provider.read, 'function')
    assert.ok(Array.isArray(await provider.list()))
    assert.equal(typeof (await provider.getMetadata(provider.name === 'google_drive' ? 'google-id' : 'item-1')).id, 'string')
  }
})
