import 'server-only'

import { google } from 'googleapis'

import type { FileProvider, FileProviderMetadata, FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { sanitizeFileName } from '@/lib/files/fileValidation'
import { FileProviderError } from '@/lib/server/fileProviderResolver'

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const DEFAULT_RETRY_DELAY_MS = 100
const MAX_RETRIES = 2

export type GoogleDriveErrorCode =
  | 'GOOGLE_DRIVE_NOT_CONFIGURED'
  | 'GOOGLE_DRIVE_AUTH_FAILED'
  | 'GOOGLE_DRIVE_ROOT_FOLDER_INVALID'
  | 'GOOGLE_DRIVE_UPLOAD_FAILED'
  | 'GOOGLE_DRIVE_FILE_NOT_FOUND'
  | 'GOOGLE_DRIVE_DELETE_FAILED'

export class GoogleDriveError extends FileProviderError {
  constructor(public readonly code: GoogleDriveErrorCode, message: string = code) {
    super(code, message)
    this.name = 'GoogleDriveError'
  }
}

type DriveFile = {
  id?: string | null
  name?: string | null
  mimeType?: string | null
  size?: string | null
  md5Checksum?: string | null
  parents?: string[] | null
  createdTime?: string | null
  modifiedTime?: string | null
  webViewLink?: string | null
  webContentLink?: string | null
  trashed?: boolean | null
}

type DriveFilesResource = {
  list(params: { q: string; spaces: string; fields: string; pageSize?: number; orderBy?: string }): Promise<{ data: { files?: DriveFile[] | null } }>
  create(params: { requestBody: Record<string, unknown>; fields: string; media?: { mimeType: string; body: Buffer } }): Promise<{ data: DriveFile }>
  get(params: { fileId: string; fields: string }): Promise<{ data: DriveFile }>
  update(params: { fileId: string; requestBody: Record<string, unknown>; fields: string }): Promise<{ data: DriveFile }>
}

export type GoogleDriveClient = { files: DriveFilesResource }

export type GoogleDriveEnvironment = Record<string, string | undefined>

type GoogleDriveOptions = {
  env?: GoogleDriveEnvironment
  drive?: GoogleDriveClient
  retryDelayMs?: number
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { code?: unknown; status?: unknown; response?: { status?: unknown } }
  const status = value.response?.status ?? value.status ?? value.code
  const parsed = typeof status === 'number' ? status : Number(status)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isTransient(error: unknown): boolean {
  const status = statusOf(error)
  return status === 429 || (status !== undefined && status >= 500 && status <= 599)
}

function isAuthFailure(error: unknown): boolean {
  const status = statusOf(error)
  return status === 401 || status === 403
}

function errorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { message?: unknown; response?: { data?: { error?: { message?: unknown } } } }
  const nested = value.response?.data?.error?.message
  return typeof nested === 'string' ? nested : typeof value.message === 'string' ? value.message : undefined
}

function toDriveError(error: unknown, fallback: GoogleDriveErrorCode): GoogleDriveError {
  if (error instanceof GoogleDriveError) return error
  const status = statusOf(error)
  if (isAuthFailure(error)) return new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED')
  if (status === 404) return new GoogleDriveError('GOOGLE_DRIVE_FILE_NOT_FOUND')
  return new GoogleDriveError(fallback, errorMessage(error) ?? fallback)
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise(resolve => setTimeout(resolve, ms))
}

function requiredEnv(env: GoogleDriveEnvironment): { email: string; privateKey: string; rootFolderId: string } {
  const email = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim()
  const privateKey = env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  const rootFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim()
  if (!email || !privateKey || !rootFolderId) throw new GoogleDriveError('GOOGLE_DRIVE_NOT_CONFIGURED')
  if (!email.includes('@') || !privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
    throw new GoogleDriveError('GOOGLE_DRIVE_AUTH_FAILED')
  }
  return { email, privateKey, rootFolderId }
}

function queryName(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function fileId(file: DriveFile, code: GoogleDriveErrorCode): string {
  if (!file.id) throw new GoogleDriveError(code)
  return file.id
}

function toSize(value: string | null | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  const size = Number(value)
  return Number.isSafeInteger(size) ? size : undefined
}

function toMetadata(file: DriveFile): FileProviderMetadata {
  const id = fileId(file, 'GOOGLE_DRIVE_FILE_NOT_FOUND')
  return {
    id,
    name: file.name ?? id,
    mime_type: file.mimeType ?? undefined,
    size_bytes: toSize(file.size),
    provider_metadata: {
      drive_file_id: id,
      parent_ids: file.parents ?? [],
      md5_checksum: file.md5Checksum ?? undefined,
      created_time: file.createdTime ?? undefined,
      modified_time: file.modifiedTime ?? undefined,
    },
  }
}

export function createGoogleDriveFileProvider(options: GoogleDriveOptions = {}): FileProvider {
  const env = options.env ?? process.env
  const { email, privateKey, rootFolderId } = requiredEnv(env)
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const drive = options.drive ?? (google.drive({
    version: 'v3',
    auth: new google.auth.JWT({ email, key: privateKey, scopes: [DRIVE_SCOPE] }),
  }) as unknown as GoogleDriveClient)
  const folderCache = new Map<string, string>()

  async function request<T>(operation: () => Promise<T>, fallback: GoogleDriveErrorCode): Promise<T> {
    let attempt = 0
    while (true) {
      try {
        return await operation()
      } catch (error) {
        if (!isTransient(error) || attempt >= MAX_RETRIES) throw toDriveError(error, fallback)
        await wait(retryDelayMs * 2 ** attempt)
        attempt += 1
      }
    }
  }

  async function findChildFolder(parentId: string, name: string): Promise<string | undefined> {
    const response = await request(
      () => drive.files.list({
        q: `'${queryName(parentId)}' in parents and name = '${queryName(name)}' and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`,
        spaces: 'drive',
        fields: 'files(id,name,mimeType,parents)',
        pageSize: 100,
        orderBy: 'name,createdTime',
      }),
      'GOOGLE_DRIVE_UPLOAD_FAILED',
    )
    const matches = (response.data.files ?? [])
      .filter(file => file.id && file.mimeType === DRIVE_FOLDER_MIME)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    return matches[0]?.id ?? undefined
  }

  async function resolveFolderPath(logicalPath: string): Promise<string> {
    const segments = logicalPath.split('/').filter(Boolean).map(sanitizeFileName)
    if (segments.length === 0) throw new GoogleDriveError('GOOGLE_DRIVE_UPLOAD_FAILED')
    let parentId = rootFolderId
    for (const segment of segments) {
      const cacheKey = `${parentId}\u0000${segment}`
      const cached = folderCache.get(cacheKey)
      if (cached) {
        parentId = cached
        continue
      }
      const existing = await findChildFolder(parentId, segment)
      if (existing) {
        folderCache.set(cacheKey, existing)
        parentId = existing
        continue
      }
      try {
        const created = await request(
          () => drive.files.create({
            requestBody: { name: segment, mimeType: DRIVE_FOLDER_MIME, parents: [parentId] },
            fields: 'id,name,mimeType,parents',
          }),
          'GOOGLE_DRIVE_UPLOAD_FAILED',
        )
        const createdId = fileId(created.data, 'GOOGLE_DRIVE_UPLOAD_FAILED')
        folderCache.set(cacheKey, createdId)
        parentId = createdId
      } catch (error) {
        const raced = await findChildFolder(parentId, segment)
        if (!raced) throw toDriveError(error, 'GOOGLE_DRIVE_UPLOAD_FAILED')
        folderCache.set(cacheKey, raced)
        parentId = raced
      }
    }
    return parentId
  }

  async function driveFile(externalFileId: string, fields: string): Promise<DriveFile> {
    if (!externalFileId.trim()) throw new GoogleDriveError('GOOGLE_DRIVE_FILE_NOT_FOUND')
    const response = await request(
      () => drive.files.get({ fileId: externalFileId, fields }),
      'GOOGLE_DRIVE_FILE_NOT_FOUND',
    )
    return response.data
  }

  async function contentBuffer(content: FileUploadInput['content']): Promise<Buffer> {
    if (content instanceof Uint8Array) return Buffer.from(content)
    if (content instanceof ArrayBuffer) return Buffer.from(new Uint8Array(content))
    if (typeof Blob !== 'undefined' && content instanceof Blob) return Buffer.from(await content.arrayBuffer())
    throw new GoogleDriveError('GOOGLE_DRIVE_UPLOAD_FAILED')
  }

  const provider: FileProvider = {
    name: 'google_drive',
    async upload(input): Promise<FileUploadResult> {
      const content = await contentBuffer(input.content)
      if (content.byteLength !== input.size_bytes) throw new GoogleDriveError('GOOGLE_DRIVE_UPLOAD_FAILED', 'File content size does not match metadata.')
      const parentId = await resolveFolderPath(input.logical_path)
      const response = await request(
        () => drive.files.create({
          requestBody: { name: sanitizeFileName(input.name), parents: [parentId] },
          media: { mimeType: input.mime_type, body: content },
          fields: 'id,name,mimeType,size,md5Checksum,parents,createdTime,modifiedTime,webViewLink,webContentLink',
        }),
        'GOOGLE_DRIVE_UPLOAD_FAILED',
      )
      const file = response.data
      const id = fileId(file, 'GOOGLE_DRIVE_UPLOAD_FAILED')
      return {
        asset: {
          id,
          provider: 'google_drive',
          external_file_id: id,
          external_parent_id: file.parents?.[0] ?? parentId,
          name: file.name ?? sanitizeFileName(input.name),
          mime_type: file.mimeType ?? input.mime_type,
          size_bytes: toSize(file.size) ?? input.size_bytes,
          checksum_sha256: input.checksum_sha256,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          status: 'active',
          created_by: input.created_by,
          created_at: file.createdTime ?? new Date().toISOString(),
          provider_metadata: {
            drive_file_id: id,
            md5_checksum: file.md5Checksum ?? undefined,
            logical_path: input.logical_path,
            created_time: file.createdTime ?? undefined,
            modified_time: file.modifiedTime ?? undefined,
          },
        },
      }
    },
    async getMetadata(externalFileId) {
      return toMetadata(await driveFile(externalFileId, 'id,name,mimeType,size,md5Checksum,parents,createdTime,modifiedTime'))
    },
    async getViewUrl(externalFileId) {
      const file = await driveFile(externalFileId, 'id,webViewLink')
      const id = fileId(file, 'GOOGLE_DRIVE_FILE_NOT_FOUND')
      return file.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(id)}`
    },
    async getDownloadUrl(externalFileId) {
      const file = await driveFile(externalFileId, 'id')
      const id = fileId(file, 'GOOGLE_DRIVE_FILE_NOT_FOUND')
      return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`
    },
    async delete(externalFileId) {
      try {
        await request(
          () => drive.files.update({ fileId: externalFileId, requestBody: { trashed: true }, fields: 'id,trashed' }),
          'GOOGLE_DRIVE_DELETE_FAILED',
        )
      } catch (error) {
        if (error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_FILE_NOT_FOUND') {
          throw new GoogleDriveError('GOOGLE_DRIVE_DELETE_FAILED')
        }
        throw error
      }
    },
    async healthCheck() {
      let file: DriveFile
      try {
        file = await driveFile(rootFolderId, 'id,name,mimeType,trashed')
      } catch (error) {
        if (error instanceof GoogleDriveError && error.code === 'GOOGLE_DRIVE_FILE_NOT_FOUND') {
          throw new GoogleDriveError('GOOGLE_DRIVE_ROOT_FOLDER_INVALID')
        }
        throw error
      }
      if (file.mimeType !== DRIVE_FOLDER_MIME || file.trashed) throw new GoogleDriveError('GOOGLE_DRIVE_ROOT_FOLDER_INVALID')
      return { ok: true, provider: 'google_drive' }
    },
  }
  return provider
}
