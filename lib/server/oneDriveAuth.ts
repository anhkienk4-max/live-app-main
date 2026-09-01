import 'server-only'

import { randomBytes, timingSafeEqual } from 'node:crypto'

import { FileProviderError } from '@/lib/server/fileProviderResolver'

const GRAPH_SCOPE = 'Files.Read.All User.Read offline_access'
const DEFAULT_TENANT = 'common'
const DEFAULT_LOCAL_REDIRECT_URI = 'http://127.0.0.1:53683/oauth2callback'

export type OneDriveErrorCode =
  | 'ONEDRIVE_NOT_CONFIGURED'
  | 'ONEDRIVE_AUTH_REQUIRED'
  | 'ONEDRIVE_AUTH_FAILED'
  | 'ONEDRIVE_REAUTH_REQUIRED'
  | 'ONEDRIVE_PERMISSION_DENIED'
  | 'ONEDRIVE_ITEM_NOT_FOUND'
  | 'ONEDRIVE_FOLDER_NOT_FOUND'
  | 'ONEDRIVE_FILE_ID_INVALID'
  | 'ONEDRIVE_SHARE_LINK_REMOTE_REQUIRED'
  | 'ONEDRIVE_RATE_LIMITED'
  | 'ONEDRIVE_NETWORK_ERROR'
  | 'ONEDRIVE_PROVIDER_UNAVAILABLE'
  | 'ONEDRIVE_RESPONSE_INVALID'
  | 'ONEDRIVE_OPERATION_UNSUPPORTED'

export class OneDriveError extends FileProviderError {
  constructor(public readonly code: OneDriveErrorCode, message: string = code, public readonly retryAfterSeconds?: number) {
    super(code, message)
    this.name = 'OneDriveError'
  }
}

export type OneDriveEnvironment = Record<string, string | undefined>

export type OneDriveOAuthTokenSet = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  scope?: string
  token_type?: string
}

export type OneDriveHttpResponse = {
  status: number
  headers?: { get(name: string): string | null }
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}

export type OneDriveFetch = (input: string, init?: RequestInit) => Promise<OneDriveHttpResponse>

export type OneDriveAuthClient = {
  getAccessToken(): Promise<string>
  refreshAccessToken(): Promise<string>
  connectionStatus(): 'connected' | 'authorization_required'
}

export type OneDriveAuthClientOptions = {
  env?: OneDriveEnvironment
  fetchImpl?: OneDriveFetch
  initialTokens?: OneDriveOAuthTokenSet
  onTokensRefreshed?: (tokens: OneDriveOAuthTokenSet) => Promise<void> | void
}

function required(env: OneDriveEnvironment, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new OneDriveError('ONEDRIVE_NOT_CONFIGURED', `Missing ${name}.`)
  return value
}

function tenant(env: OneDriveEnvironment): string {
  const value = env.ONEDRIVE_TENANT_ID?.trim() || DEFAULT_TENANT
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Invalid Microsoft tenant identifier.')
  return value
}

function redirectUri(value: string, env: OneDriveEnvironment): string {
  let uri: URL
  try {
    uri = new URL(value)
  } catch {
    throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Invalid Microsoft OAuth redirect URI.')
  }
  if (!['http:', 'https:'].includes(uri.protocol) || uri.username || uri.password || uri.hash || uri.search) {
    throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Invalid Microsoft OAuth redirect URI.')
  }
  if (env.NODE_ENV === 'production' && uri.protocol !== 'https:') {
    throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Production Microsoft OAuth redirects must use HTTPS.')
  }
  if (env.NODE_ENV !== 'production' && uri.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname)) {
    throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'HTTP Microsoft OAuth redirects are limited to loopback hosts.')
  }
  return value
}

export function resolveOneDriveOAuthRedirectUri(env: OneDriveEnvironment = process.env): string {
  const configured = env.ONEDRIVE_REDIRECT_URI?.trim()
  if (!configured) {
    if (env.NODE_ENV === 'production') throw new OneDriveError('ONEDRIVE_NOT_CONFIGURED', 'Missing ONEDRIVE_REDIRECT_URI.')
    return DEFAULT_LOCAL_REDIRECT_URI
  }
  return redirectUri(configured, env)
}

export function createOneDriveOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

export function validateOneDriveOAuthState(received: string | null | undefined, expected: string): void {
  const actualBuffer = Buffer.from(received ?? '')
  const expectedBuffer = Buffer.from(expected)
  if (!expectedBuffer.length || actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Microsoft OAuth state validation failed.')
  }
}

export function createOneDriveAuthorizationUrl(options: { env?: OneDriveEnvironment; state: string; redirectUri?: string }): string {
  const env = options.env ?? process.env
  const clientId = required(env, 'ONEDRIVE_CLIENT_ID')
  if (!options.state.trim()) throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Microsoft OAuth state is required.')
  const uri = options.redirectUri ?? resolveOneDriveOAuthRedirectUri(env)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(uri, env),
    response_mode: 'query',
    scope: GRAPH_SCOPE,
    state: options.state,
  })
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant(env))}/oauth2/v2.0/authorize?${params.toString()}`
}

export async function exchangeOneDriveAuthorizationCode(options: {
  env?: OneDriveEnvironment
  code: string
  expectedState?: string
  receivedState?: string | null
  redirectUri?: string
  fetchImpl?: OneDriveFetch
}): Promise<OneDriveOAuthTokenSet> {
  const env = options.env ?? process.env
  if (options.expectedState !== undefined) validateOneDriveOAuthState(options.receivedState, options.expectedState)
  if (!options.code.trim()) throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Microsoft OAuth authorization code is required.')
  const clientId = required(env, 'ONEDRIVE_CLIENT_ID')
  const clientSecret = required(env, 'ONEDRIVE_CLIENT_SECRET')
  const uri = redirectUri(options.redirectUri ?? resolveOneDriveOAuthRedirectUri(env), env)
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as OneDriveFetch)
  try {
    const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenant(env))}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: options.code.trim(), redirect_uri: uri, scope: GRAPH_SCOPE }).toString(),
    })
    const body = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown }
    if (response.status < 200 || response.status >= 300) {
      if (body.error === 'invalid_grant') throw new OneDriveError('ONEDRIVE_REAUTH_REQUIRED', 'Microsoft OAuth authorization was rejected or revoked.')
      throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Microsoft OAuth token exchange failed.')
    }
    if (typeof body.refresh_token !== 'string' || !body.refresh_token || typeof body.access_token !== 'string' || !body.access_token) {
      throw new OneDriveError('ONEDRIVE_RESPONSE_INVALID', 'Microsoft OAuth token response was incomplete.')
    }
    return { access_token: body.access_token, refresh_token: body.refresh_token, expires_in: typeof body.expires_in === 'number' ? body.expires_in : undefined }
  } catch (error) {
    if (error instanceof OneDriveError) throw error
    throw new OneDriveError('ONEDRIVE_NETWORK_ERROR', 'Microsoft OAuth token exchange failed.')
  }
}

export function createOneDriveAuthClient(options: OneDriveAuthClientOptions = {}): OneDriveAuthClient {
  const env = options.env ?? process.env
  const clientId = required(env, 'ONEDRIVE_CLIENT_ID')
  const clientSecret = required(env, 'ONEDRIVE_CLIENT_SECRET')
  const tenantId = tenant(env)
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as OneDriveFetch)
  let tokens: OneDriveOAuthTokenSet = { refresh_token: env.ONEDRIVE_REFRESH_TOKEN?.trim() || undefined, ...options.initialTokens }
  let refreshPromise: Promise<string> | undefined

  const refresh = async (): Promise<string> => {
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      if (!tokens.refresh_token) throw new OneDriveError('ONEDRIVE_AUTH_REQUIRED', 'Microsoft authorization is required.')
      try {
        const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, scope: GRAPH_SCOPE }).toString(),
        })
        const body = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown }
        if (response.status < 200 || response.status >= 300) {
          if (body.error === 'invalid_grant') throw new OneDriveError('ONEDRIVE_REAUTH_REQUIRED', 'Microsoft refresh authorization was rejected or revoked.')
          throw new OneDriveError('ONEDRIVE_AUTH_FAILED', 'Microsoft token refresh failed.')
        }
        if (typeof body.access_token !== 'string' || !body.access_token) throw new OneDriveError('ONEDRIVE_RESPONSE_INVALID', 'Microsoft refresh response was incomplete.')
        tokens = { ...tokens, access_token: body.access_token, refresh_token: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : tokens.refresh_token, expires_in: typeof body.expires_in === 'number' ? body.expires_in : undefined, expires_at: typeof body.expires_in === 'number' ? Math.floor(Date.now() / 1000) + body.expires_in : undefined }
        await options.onTokensRefreshed?.(tokens)
        return body.access_token
      } catch (error) {
        if (error instanceof OneDriveError) throw error
        throw new OneDriveError('ONEDRIVE_NETWORK_ERROR', 'Microsoft token refresh failed.')
      } finally {
        refreshPromise = undefined
      }
    })()
    return refreshPromise
  }

  return {
    async getAccessToken() {
      const expiresAt = tokens.expires_at ?? (tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : undefined)
      if (tokens.access_token && (!expiresAt || expiresAt > Math.floor(Date.now() / 1000) + 60)) return tokens.access_token
      return refresh()
    },
    refreshAccessToken: refresh,
    connectionStatus() { return tokens.access_token || tokens.refresh_token ? 'connected' : 'authorization_required' },
  }
}
