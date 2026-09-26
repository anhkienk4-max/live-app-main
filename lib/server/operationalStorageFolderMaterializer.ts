import 'server-only'

import type { OperationalStoragePlacement } from '@/lib/files/operationalStoragePlacementResolver'
import type { CloudFolderRef } from '@/lib/storage/types'

type EnsureFolder = (parentId: string, name: string, provider: OperationalStoragePlacement['provider']) => Promise<CloudFolderRef>

/** Resolves only planned folder segments; the filename is never a folder input. */
export function createOperationalStorageFolderMaterializer(ensureFolder: EnsureFolder) {
  return async (placement: OperationalStoragePlacement): Promise<string> => {
    let parentId = placement.baseFolderId
    for (const segment of placement.folderSegments) {
      parentId = (await ensureFolder(parentId, segment, placement.provider)).id
    }
    return parentId
  }
}
