import 'server-only'

import { google } from 'googleapis'

import { FileProviderError } from '@/lib/server/fileProviderResolver'

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

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
