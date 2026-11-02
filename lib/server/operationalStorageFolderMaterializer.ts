import 'server-only'

import type { OperationalStoragePlacement } from '@/lib/files/operationalStoragePlacementResolver'
import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'
import type { FileProviderMetadata } from '@/lib/files/fileProvider'
import type { CloudFolderRef } from '@/lib/storage/types'

type EnsureFolder = (parentId: string, name: string, provider: OperationalStoragePlacement['provider']) => Promise<CloudFolderRef>
type GetMetadata = (id: string, provider: OperationalStoragePlacement['provider']) => Promise<FileProviderMetadata>

/** Resolves only planned folder segments; the filename is never a folder input. */
export function createOperationalStorageFolderMaterializer(ensureFolder: EnsureFolder, getMetadata?: GetMetadata) {
  return async (placement: OperationalStoragePlacement): Promise<string> => {
    const verifyWritable = async (folderId: string, expectedParentId?: string) => {
      if (placement.provider !== 'google_drive' || !placement.expectedBaseParentId) return
      if (!getMetadata) throw new Error('GOOGLE_DRIVE_FOLDER_NOT_WRITABLE')
      const folder = await getMetadata(folderId, placement.provider)
      if (folder.id !== folderId || folder.kind !== 'folder' || folder.trashed === true
        || (expectedParentId && !folder.parent_ids?.includes(expectedParentId))
        || folder.capabilities?.canAddChildren !== true) {
        throw new Error('GOOGLE_DRIVE_FOLDER_NOT_WRITABLE')
      }
    }
    if (placement.expectedBaseParentId) {
      if (!getMetadata) throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
      const folder = await getMetadata(placement.baseFolderId, placement.provider)
      if (folder.id !== placement.baseFolderId || folder.kind !== 'folder' || folder.trashed === true
        || !folder.parent_ids?.includes(placement.expectedBaseParentId)) {
        throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
      }
    }
    let parentId = placement.baseFolderId
    for (const segment of placement.folderSegments) {
      await verifyWritable(parentId)
      const child = await ensureFolder(parentId, segment, placement.provider)
      await verifyWritable(child.id, parentId)
      parentId = child.id
    }
    if (!placement.folderSegments.length) await verifyWritable(parentId, placement.expectedBaseParentId)
    return parentId
  }
}
