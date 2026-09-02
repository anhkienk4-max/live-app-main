import { CloudStoragePlan, CloudStorageExecutionResult, CloudStorageError, CloudFolderRef, CloudFileRef, normalizeCloudStorageError } from './types'
import { FolderCapableFileProvider } from './folderCapable'
import { Brand } from '@/lib/types/database.types'
import { sanitizeFileName } from '@/lib/files/fileValidation'
import type { FileEntityType, FileProviderMetadata, FileProviderName } from '@/lib/files/fileProvider'

export interface BrandResolver {
  getBrand(brandId: string): Promise<Brand | null>
}

export interface CloudStorageManagerOptions {
  provider: FolderCapableFileProvider
  brandResolver: BrandResolver
  rootFolderId: string
  monthPolicy?: 'MM' | 'MMM' // default 'MM'
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function findUniqueFolder(folders: CloudFolderRef[], normalizedName: string): CloudFolderRef | null {
  const matches = folders.filter(f => normalizeName(f.name) === normalizedName)
  if (matches.length === 0) return null
  if (matches.length > 1) throw new CloudStorageError('CLOUD_FOLDER_AMBIGUOUS')
  return matches[0]
}

async function findChildFolder(provider: FolderCapableFileProvider, parentId: string, name: string): Promise<CloudFolderRef | null> {
  let children: FileProviderMetadata[]
  try {
    children = await provider.list(parentId)
  } catch (error) {
    throw normalizeCloudStorageError(error)
  }
  const refs: CloudFolderRef[] = children.map(c => ({
    provider: provider.name as FileProviderName,
    id: c.id,
    name: c.name,
    parentId
  }))
  return findUniqueFolder(refs, normalizeName(name))
}

async function ensureChildFolder(provider: FolderCapableFileProvider, parentId: string, name: string): Promise<CloudFolderRef> {
  const existing = await findChildFolder(provider, parentId, name)
  if (existing) return existing
  // attempt create
  try {
    return await provider.ensureFolder(parentId, name)
  } catch (err) {
    // if conflict, re-list
    let after: CloudFolderRef | null
    try {
      after = await findChildFolder(provider, parentId, name)
    } catch (relistError) {
      if (err instanceof CloudStorageError) throw err
      throw relistError
    }
    if (after) return after
    throw normalizeCloudStorageError(err)
  }
}

export class CloudStorageManager {
  constructor(private options: CloudStorageManagerOptions) {}

  private get provider(): FolderCapableFileProvider {
    return this.options.provider
  }

  private get brandResolver(): BrandResolver {
    return this.options.brandResolver
  }

  private get rootFolderId(): string {
    return this.options.rootFolderId
  }

  private get monthPolicy(): 'MM' | 'MMM' {
    return this.options.monthPolicy || 'MM'
  }

  private monthLabel(month: number): string {
    if (this.monthPolicy === 'MM') return String(month).padStart(2, '0')
    // MMM not implemented; default to MM
    return String(month).padStart(2, '0')
  }

  async planStorage(params: {
    year: number
    month: number
    brandId: string
  }): Promise<CloudStoragePlan> {
    const { year, month, brandId } = params
    // resolve brand
    const brand = await this.brandResolver.getBrand(brandId)
    if (!brand) throw new CloudStorageError('CLOUD_BRAND_NOT_FOUND')
    if (brand.status !== 'active') throw new CloudStorageError('CLOUD_BRAND_NOT_ALLOWED')

    const root = this.rootFolderId
    // resolve year
    const yearLabel = String(year)
    const yearFolder = await findChildFolder(this.provider, root, yearLabel)
    const yearExists = !!yearFolder
    // resolve month
    const monthLabel = this.monthLabel(month)
    let monthFolder: CloudFolderRef | null = null
    let monthExists = false
    if (yearFolder) {
      monthFolder = await findChildFolder(this.provider, yearFolder.id, monthLabel)
      monthExists = !!monthFolder
    }
    // resolve brand
    const brandLabel = brand.name
    let brandFolder: CloudFolderRef | null = null
    let brandExists = false
    if (monthFolder) {
      brandFolder = await findChildFolder(this.provider, monthFolder.id, brandLabel)
      brandExists = !!brandFolder
    }

    const actionsRequired: Array<'create_year_folder' | 'create_month_folder' | 'create_brand_folder' | 'upload_file'> = []
    if (!yearFolder) actionsRequired.push('create_year_folder')
    if (!monthFolder) actionsRequired.push('create_month_folder')
    if (!brandFolder) actionsRequired.push('create_brand_folder')
    actionsRequired.push('upload_file')

    return {
      provider: this.provider.name as FileProviderName,
      rootFolderId: root,
      year: {
        label: yearLabel,
        exists: yearExists,
        folderId: yearFolder?.id
      },
      month: {
        label: monthLabel,
        exists: monthExists,
        folderId: monthFolder?.id
      },
      brand: {
        brandId: brandId,
        label: brandLabel,
        exists: brandExists,
        folderId: brandFolder?.id
      },
      actionsRequired
    }
  }

  async executeStorage(params: {
    year: number
    month: number
    brandId: string
    fileInput: {
      name: string
      mimeType: string
      size: number
      content: Buffer | Uint8Array | Blob
      createdBy: string
      entityType: string
      entityId: string
    }
  }): Promise<CloudStorageExecutionResult> {
    const { year, month, brandId, fileInput } = params
    const uploadName = sanitizeFileName(fileInput.name)
    // revalidate plan
    const plan = await this.planStorage({ year, month, brandId })
    // ensure each missing level idempotently
    let parentId = this.rootFolderId
    // year
    if (!plan.year.exists) {
      const yearRef = await ensureChildFolder(this.provider, parentId, plan.year.label)
      plan.year.exists = true
      plan.year.folderId = yearRef.id
    }
    parentId = plan.year.folderId!
    // month
    if (!plan.month.exists) {
      const monthRef = await ensureChildFolder(this.provider, parentId, plan.month.label)
      plan.month.exists = true
      plan.month.folderId = monthRef.id
    }
    parentId = plan.month.folderId!
    // brand
    if (!plan.brand.exists) {
      const brandRef = await ensureChildFolder(this.provider, parentId, plan.brand.label)
      plan.brand.exists = true
      plan.brand.folderId = brandRef.id
    }
    parentId = plan.brand.folderId!

    // upload file
    const uploadInput = {
      name: uploadName,
      mime_type: fileInput.mimeType,
      size_bytes: fileInput.size,
      content: fileInput.content,
      entity_type: fileInput.entityType as FileEntityType,
      entity_id: fileInput.entityId,
      created_by: fileInput.createdBy,
      logical_path: `${plan.year.label}/${plan.month.label}/${plan.brand.label}`,
      external_parent_id: parentId,
      destination: {
        provider: this.provider.name as FileProviderName,
        external_folder_id: parentId
      }
    }
    let result
    try {
      result = await this.provider.upload(uploadInput)
    } catch (err) {
      // detect conflict: re-list and check if same-name file exists
      let children: FileProviderMetadata[]
      try {
        children = await this.provider.list(parentId)
      } catch (listError) {
        if (err instanceof CloudStorageError) throw err
        throw normalizeCloudStorageError(listError)
      }
      const existing = children.find(c => c.name === uploadName && c.kind === 'file')
      if (existing) {
        throw new CloudStorageError('CLOUD_FILE_CONFLICT')
      }
      throw normalizeCloudStorageError(err)
    }
    const fileRef: CloudFileRef = {
      provider: result.asset.provider as FileProviderName,
      id: result.asset.external_file_id,
      name: result.asset.name,
      mimeType: result.asset.mime_type,
      size: result.asset.size_bytes,
      parentId: result.asset.external_parent_id,
      viewUrl: result.view_url
    }
    return { plan, fileRef }
  }
}
