import 'server-only'

import { randomBytes, timingSafeEqual } from 'node:crypto'

import { google } from 'googleapis'

import { FileProviderError } from '@/lib/server/fileProviderResolver'

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const DEFAULT_LOCAL_REDIRECT_URI = 'http://127.0.0.1:53682/oauth2callback'

export type GoogleDriveErrorCode =
  | 'GOOGLE_DRIVE_NOT_CONFIGURED'
  | 'GOOGLE_DRIVE_AUTH_FAILED'
  | 'GOOGLE_DRIVE_ROOT_FOLDER_INVALID'
  | 'GOOGLE_DRIVE_FOLDER_URL_INVALID'
  | 'GOOGLE_DRIVE_FOLDER_NOT_FOUND'
  | 'GOOGLE_DRIVE_FOLDER_INVALID'
  | 'GOOGLE_DRIVE_FOLDER_NOT_WRITABLE'
  | 'GOOGLE_DRIVE_UPLOAD_FAILED'
  | 'GOOGLE_DRIVE_FILE_NOT_FOUND'
  | 'GOOGLE_DRIVE_DELETE_FAILED'
  | 'GOOGLE_DRIVE_REAUTH_REQUIRED'
  | 'GOOGLE_DRIVE_PERMISSION_DENIED'
  | 'GOOGLE_DRIVE_RATE_LIMITED'
  | 'GOOGLE_DRIVE_NETWORK_ERROR'
  | 'GOOGLE_DRIVE_PROVIDER_UNAVAILABLE'
  | 'GOOGLE_DRIVE_FILE_ID_INVALID'
  | 'GOOGLE_DRIVE_RESPONSE_INVALID'
  | 'GOOGLE_DRIVE_OAUTH_STATE_INVALID'

export class GoogleDriveError extends FileProviderError {
  constructor(public readonly code: GoogleDriveErrorCode, message: string = code) {
    super(code, message)
    this.name = 'GoogleDriveError'
  }
}

export type GoogleDriveAuthMode = 'oauth_refresh_token' | 'service_account'
export type GoogleDriveEnvironment = Record<string, string | undefined>

export type GoogleDriveAuthResult = {
  auth: unknown
  mode: GoogleDriveAuthMode
}

export type GoogleDriveOAuthTokenSet = {
  access_token?: string
  refresh_token?: string
  expiry_date?: number
  scope?: string
  token_type?: string
}

export type GoogleDriveOAuthClientLike = {
  generateAuthUrl(options: { access_type: 'offline'; prompt: 'consent'; scope: string[]; state: string }): string
  getToken(code: string): Promise<{ tokens: GoogleDriveOAuthTokenSet }>
}

function required(env: GoogleDriveEnvironment, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new GoogleDriveError('GOOGLE_DRIVE_NOT_CONFIGURED', `Missing ${name}.`)
  return value
}

function privateKey(env: GoogleDriveEnvironment): string {
  const value = required(env, 'GOOGLE_DRIVE_PRIVATE_KEY').replace(/\\n/g, '\n')
  if (!value.includes('BEGIN PRIVATE KEY') || !value.includes('END PRIVATE KEY')) {
    throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'Invalid Google service-account private key.')
  }
  return value
}

export function resolveGoogleDriveAuthMode(env: GoogleDriveEnvironment = process.env): GoogleDriveAuthMode {
  const configured = env.GOOGLE_DRIVE_AUTH_MODE?.trim().toLowerCase()
  if (!configured) return 'oauth_refresh_token'
  if (configured === 'oauth_refresh_token' || configured === 'service_account') return configured
  throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'Unsupported Google Drive auth mode.')
}

export function createGoogleDriveAuth(env: GoogleDriveEnvironment = process.env): GoogleDriveAuthResult {
  const mode = resolveGoogleDriveAuthMode(env)
  if (mode === 'oauth_refresh_token') {
    const clientId = required(env, 'GOOGLE_DRIVE_CLIENT_ID')
    const clientSecret = required(env, 'GOOGLE_DRIVE_CLIENT_SECRET')
    const refreshToken = required(env, 'GOOGLE_DRIVE_REFRESH_TOKEN')
    const auth = new google.auth.OAuth2(clientId, clientSecret)
    auth.setCredentials({ refresh_token: refreshToken })
    return { auth, mode }
  }

  const email = required(env, 'GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL')
  if (!email.includes('@')) throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'Invalid service-account email.')
  const auth = new google.auth.JWT({ email, key: privateKey(env), scopes: [GOOGLE_DRIVE_SCOPE] })
  return { auth, mode }
}

function validRedirectUri(value: string, env: GoogleDriveEnvironment): string {
  let uri: URL
  try {
    uri = new URL(value)
  } catch {
    throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'Invalid Google OAuth redirect URI.')
  }
  if (!['http:', 'https:'].includes(uri.protocol) || uri.username || uri.password || uri.hash || uri.search) {
    throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'Invalid Google OAuth redirect URI.')
  }
  if (env.NODE_ENV === 'production' && uri.protocol !== 'https:') {
    throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'Production Google OAuth redirects must use HTTPS.')
  }
  if (env.NODE_ENV !== 'production' && uri.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname)) {
    throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'HTTP Google OAuth redirects are limited to loopback hosts.')
  }
  return value
}

export function resolveGoogleDriveOAuthRedirectUri(env: GoogleDriveEnvironment = process.env): string {
  const configured = env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI?.trim()
  if (!configured) {
    if (env.NODE_ENV === 'production') throw new GoogleDriveError('GOOGLE_DRIVE_NOT_CONFIGURED', 'Missing GOOGLE_DRIVE_OAUTH_REDIRECT_URI.')
    return DEFAULT_LOCAL_REDIRECT_URI
  }
  return validRedirectUri(configured, env)
}

export function createGoogleDriveOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

export function validateGoogleDriveOAuthState(received: string | null | undefined, expected: string): void {
  const actualBuffer = Buffer.from(received ?? '')
  const expectedBuffer = Buffer.from(expected)
  if (!expectedBuffer.length || actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new GoogleDriveError('GOOGLE_DRIVE_OAUTH_STATE_INVALID', 'Google OAuth state validation failed.')
  }
}

export function createGoogleDriveOAuthClient(env: GoogleDriveEnvironment = process.env, redirectUri = resolveGoogleDriveOAuthRedirectUri(env)) {
  const clientId = required(env, 'GOOGLE_DRIVE_CLIENT_ID')
  const clientSecret = required(env, 'GOOGLE_DRIVE_CLIENT_SECRET')
  return new google.auth.OAuth2(clientId, clientSecret, validRedirectUri(redirectUri, env))
}

export function createGoogleDriveAuthorizationUrl(options: { env?: GoogleDriveEnvironment; state: string; redirectUri?: string; oauthClient?: GoogleDriveOAuthClientLike }): string {
  const env = options.env ?? process.env
  if (!options.state.trim()) throw new GoogleDriveError('GOOGLE_DRIVE_OAUTH_STATE_INVALID', 'Google OAuth state is required.')
  const client = options.oauthClient ?? createGoogleDriveOAuthClient(env, options.redirectUri ?? resolveGoogleDriveOAuthRedirectUri(env))
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [GOOGLE_DRIVE_SCOPE], state: options.state })
}

export async function exchangeGoogleDriveAuthorizationCode(options: {
  env?: GoogleDriveEnvironment
  code: string
  expectedState?: string
  receivedState?: string | null
  redirectUri?: string
  oauthClient?: GoogleDriveOAuthClientLike
}): Promise<GoogleDriveOAuthTokenSet> {
  const env = options.env ?? process.env
  if (options.expectedState !== undefined) validateGoogleDriveOAuthState(options.receivedState, options.expectedState)
  if (!options.code.trim()) throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'Google OAuth authorization code is required.')
  try {
    const client = options.oauthClient ?? createGoogleDriveOAuthClient(env, options.redirectUri ?? resolveGoogleDriveOAuthRedirectUri(env))
    const response = await client.getToken(options.code.trim())
    if (!response.tokens.refresh_token) throw new GoogleDriveError('GOOGLE_DRIVE_REAUTH_REQUIRED', 'Google OAuth did not return a refresh token.')
    return response.tokens as GoogleDriveOAuthTokenSet
  } catch (error) {
    if (error instanceof GoogleDriveError) throw error
    const response = (error as { response?: { status?: unknown; data?: { error?: unknown } } } | null)?.response
    if (Number(response?.status) === 400 && String(response?.data?.error ?? '').toLowerCase() === 'invalid_grant') {
      throw new GoogleDriveError('GOOGLE_DRIVE_REAUTH_REQUIRED', 'Google OAuth authorization was rejected or revoked.')
    }
    throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED', 'Google OAuth token exchange failed.')
  }
}
