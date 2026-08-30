import 'server-only'

import type { FileDestination } from '@/lib/files/fileProvider'
import { GoogleDriveError } from '@/lib/server/googleDriveAuth'

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

export type GoogleDriveFolder = {
  id?: string | null
  name?: string | null
  mimeType?: string | null
  trashed?: boolean | null
  driveId?: string | null
  capabilities?: {
    canAddChildren?: boolean | null
    canEdit?: boolean | null
  } | null
}

export type GoogleDriveFolderClient = {
  files: {
    get(params: { fileId: string; fields: string; supportsAllDrives?: boolean }): Promise<{ data: GoogleDriveFolder }>
  }
}

export type ResolvedGoogleDriveDestination = {
  folderId: string
  custom: boolean
}

function validFolderId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value)
}

function invalidUrl(): never {
  throw new GoogleDriveError('GOOGLE_DRIVE_FOLDER_URL_INVALID', 'Invalid Google Drive folder URL.')
}

/** Extract a folder ID from supported Google Drive folder links only. */
export function parseGoogleDriveFolderUrl(value: string): string {
  const raw = String(value ?? '').trim()
  if (!raw) return invalidUrl()

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return invalidUrl()
  }

  const host = url.hostname.toLowerCase()
  if (host !== 'drive.google.com' && host !== 'www.drive.google.com') return invalidUrl()

  const segments = url.pathname.split('/').filter(Boolean).map(segment => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
  let id: string | undefined
  if (segments.length === 3 && segments[0] === 'drive' && segments[1] === 'folders') {
    id = segments[2]
  } else if (segments.length === 5 && segments[0] === 'drive' && segments[1] === 'u' && segments[2] === '0' && segments[3] === 'folders') {
    id = segments[4]
  } else if (segments.length === 1 && segments[0] === 'open') {
    id = url.searchParams.get('id') ?? undefined
  }

  if (!id || !validFolderId(id)) return invalidUrl()
  return id
}

function externalFolderId(value: string): string {
  const id = String(value ?? '').trim()
  if (!id || !validFolderId(id)) return invalidUrl()
  return id
}

/** Resolve a custom destination, or retain the configured logical-path root. */
export function resolveGoogleDriveDestination(destination: FileDestination | undefined, rootFolderId: string): ResolvedGoogleDriveDestination {
  if (!destination) return { folderId: rootFolderId, custom: false }
  if (destination.provider !== 'google_drive') return invalidUrl()
  const hasId = destination.external_folder_id !== undefined
  const hasUrl = destination.folder_url !== undefined
  if (hasId === hasUrl) return invalidUrl()
  return {
    folderId: hasId ? externalFolderId(destination.external_folder_id ?? '') : parseGoogleDriveFolderUrl(destination.folder_url ?? ''),
    custom: true,
  }
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { code?: unknown; status?: unknown; response?: { status?: unknown } }
  const status = value.response?.status ?? value.status ?? value.code
  const parsed = typeof status === 'number' ? status : Number(status)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Validate folder ownership/access without changing ACLs or falling back to root. */
export async function validateGoogleDriveFolder(client: GoogleDriveFolderClient, folderId: string): Promise<GoogleDriveFolder> {
  try {
    const response = await client.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType,trashed,driveId,capabilities(canAddChildren,canEdit)',
      supportsAllDrives: true,
    })
    const folder = response.data
    if (folder.mimeType !== DRIVE_FOLDER_MIME || folder.trashed === true) {
      throw new GoogleDriveError('GOOGLE_DRIVE_FOLDER_INVALID', 'Google Drive destination is not an active folder.')
    }
    if (folder.capabilities?.canAddChildren !== true) {
      throw new GoogleDriveError('GOOGLE_DRIVE_FOLDER_NOT_WRITABLE', 'Google Drive destination is not writable.')
    }
    return folder
  } catch (error) {
    if (error instanceof GoogleDriveError) throw error
    if (statusOf(error) === 404) throw new GoogleDriveError('GOOGLE_DRIVE_FOLDER_NOT_FOUND', 'Google Drive folder was not found or is not shared with the system account.')
    if (statusOf(error) === 403) throw new GoogleDriveError('GOOGLE_DRIVE_FOLDER_NOT_WRITABLE', 'Google Drive destination is not writable by the system account.')
    throw error
  }
}
