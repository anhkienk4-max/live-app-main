import { FileProvider } from '@/lib/files/fileProvider'
import { CloudFolderRef } from './types'

export interface FolderCapableFileProvider extends FileProvider {
  ensureFolder(parentId: string, name: string): Promise<CloudFolderRef>
}
