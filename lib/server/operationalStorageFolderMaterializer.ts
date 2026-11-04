import 'server-only'

import type { OperationalStoragePlacement } from '@/lib/files/operationalStoragePlacementResolver'
import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'
import type { FileProviderMetadata } from '@/lib/files/fileProvider'
import type { CloudFolderRef } from '@/lib/storage/types'

type EnsureFolder = (parentId: string, name: string, provider: OperationalStoragePlacement['provider']) => Promise<CloudFolderRef>
type GetMetadata = (id: string, provider: OperationalStoragePlacement['provider']) => Promise<FileProviderMetadata>
type OnFolderMaterialized = (folder: { id: string; parentId: string; name: string; logicalPath: string; isLeaf: boolean }) => Promise<void>

const folderEnsuresInFlight = new Map<string, Promise<CloudFolderRef>>()

function ensureFolderOnce(ensureFolder: EnsureFolder, parentId: string, name: string, provider: OperationalStoragePlacement['provider']) {
  const key = JSON.stringify([provider, parentId, name])
  const pending = folderEnsuresInFlight.get(key)
  if (pending) return pending

  const request = Promise.resolve().then(() => ensureFolder(parentId, name, provider))
  folderEnsuresInFlight.set(key, request)
  void request.finally(() => {
    if (folderEnsuresInFlight.get(key) === request) folderEnsuresInFlight.delete(key)
  }).catch(() => undefined)
  return request
}

/** Resolves only planned folder segments; the filename is never a folder input. */
export function createOperationalStorageFolderMaterializer(
  ensureFolder: EnsureFolder,
  getMetadata?: GetMetadata,
  cacheVerifiedMetadata = false,
) {
  const metadataCache = cacheVerifiedMetadata ? new Map<string, FileProviderMetadata>() : undefined

  const readMetadata = async (id: string, provider: OperationalStoragePlacement['provider']) => {
    const key = JSON.stringify([provider, id])
    const cached = metadataCache?.get(key)
    if (cached) return cached
    if (!getMetadata) throw new Error('GOOGLE_DRIVE_FOLDER_NOT_WRITABLE')
    const metadata = await getMetadata(id, provider)
    metadataCache?.set(key, metadata)
    return metadata
  }

  return async (placement: OperationalStoragePlacement, onFolderMaterialized?: OnFolderMaterialized): Promise<string> => {
    const verifyWritable = async (folderId: string, expectedParentId?: string) => {
      if (placement.provider !== 'google_drive' || !placement.expectedBaseParentId) return
      const folder = await readMetadata(folderId, placement.provider)
      if (folder.id !== folderId || folder.kind !== 'folder' || folder.trashed === true
        || (expectedParentId && !folder.parent_ids?.includes(expectedParentId))
        || folder.capabilities?.canAddChildren !== true) {
        throw new Error('GOOGLE_DRIVE_FOLDER_NOT_WRITABLE')
      }
    }
    if (placement.expectedBaseParentId) {
      if (!getMetadata) throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
      const folder = await readMetadata(placement.baseFolderId, placement.provider)
      if (folder.id !== placement.baseFolderId || folder.kind !== 'folder' || folder.trashed === true
        || !folder.parent_ids?.includes(placement.expectedBaseParentId)) {
        throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
      }
    }
    let parentId = placement.baseFolderId
    const logicalSegments: string[] = []
    for (const [index, segment] of placement.folderSegments.entries()) {
      await verifyWritable(parentId)
      // shortcut: concurrent creation is coalesced within this Node process; a durable lock is needed across server instances.
      const child = await ensureFolderOnce(ensureFolder, parentId, segment, placement.provider)
      await verifyWritable(child.id, parentId)
      logicalSegments.push(segment)
      await onFolderMaterialized?.({
        id: child.id,
        parentId,
        name: segment,
        logicalPath: logicalSegments.join('/'),
        isLeaf: index === placement.folderSegments.length - 1,
      })
      parentId = child.id
    }
    if (!placement.folderSegments.length) await verifyWritable(parentId, placement.expectedBaseParentId)
    return parentId
  }
}
