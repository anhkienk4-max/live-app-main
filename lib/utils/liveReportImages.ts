import type {
  LiveReportImage,
  LiveReportImageCategory,
} from '@/lib/types/database.types'

export const liveReportImageCategories: readonly LiveReportImageCategory[] = [
  'key_visual',
  'live_session',
  'other',
]

export const maximumLiveReportImages = 30
export const maximumLiveReportImageBytes = 10 * 1024 * 1024
export const maximumLiveReportImageTitleLength = 120
export const maximumLiveReportImageDescriptionLength = 1_000

const supportedMimeExtensions: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
}

export type LiveReportImageValidationCode =
  | 'maximum_count'
  | 'invalid_mime'
  | 'invalid_extension'
  | 'file_too_large'
  | 'empty_file'
  | 'title_too_long'
  | 'description_too_long'

export type LiveReportImageValidationError = {
  code: LiveReportImageValidationCode
  fileName?: string
}

export function validateLiveReportImageFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  currentCount: number,
): LiveReportImageValidationError | null {
  if (currentCount >= maximumLiveReportImages) {
    return { code: 'maximum_count', fileName: sanitizeLiveReportImageFileName(file.name) }
  }
  if (!supportedMimeExtensions[file.type]) {
    return { code: 'invalid_mime', fileName: sanitizeLiveReportImageFileName(file.name) }
  }
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (!supportedMimeExtensions[file.type].includes(extension)) {
    return { code: 'invalid_extension', fileName: sanitizeLiveReportImageFileName(file.name) }
  }
  if (file.size <= 0) {
    return { code: 'empty_file', fileName: sanitizeLiveReportImageFileName(file.name) }
  }
  if (file.size > maximumLiveReportImageBytes) {
    return { code: 'file_too_large', fileName: sanitizeLiveReportImageFileName(file.name) }
  }
  return null
}

export function validateLiveReportImageMetadata(input: {
  title?: string
  description?: string
}): LiveReportImageValidationError | null {
  if ((input.title || '').trim().length > maximumLiveReportImageTitleLength) {
    return { code: 'title_too_long' }
  }
  if ((input.description || '').trim().length > maximumLiveReportImageDescriptionLength) {
    return { code: 'description_too_long' }
  }
  return null
}

export function createLiveReportImageDrafts({
  files,
  currentImages,
  category,
  uploadedBy,
  createObjectUrl = file => URL.createObjectURL(file),
  createId = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
}: {
  files: readonly File[]
  currentImages: readonly LiveReportImage[]
  category: LiveReportImageCategory
  uploadedBy?: string
  createObjectUrl?: (file: File) => string
  createId?: () => string
  now?: () => string
}) {
  const images: LiveReportImage[] = []
  const errors: LiveReportImageValidationError[] = []

  for (const file of files) {
    const validationError = validateLiveReportImageFile(
      file,
      currentImages.length + images.length,
    )
    if (validationError) {
      errors.push(validationError)
      continue
    }
    const id = createId()
    images.push({
      id,
      category,
      file_url: createObjectUrl(file),
      file_name: sanitizeLiveReportImageFileName(file.name),
      mime_type: file.type,
      size_bytes: file.size,
      sort_order: currentImages.length + images.length,
      is_cover: currentImages.length === 0 && images.length === 0,
      uploaded_by: uploadedBy,
      created_at: now(),
    })
  }

  return { images, errors }
}

export function updateLiveReportImageMetadata(
  images: readonly LiveReportImage[],
  id: string,
  patch: Pick<
    LiveReportImage,
    'category' | 'title' | 'description' | 'captured_at'
  >,
) {
  const error = validateLiveReportImageMetadata(patch)
  if (error) return { images: [...images], error }
  return {
    images: images.map(image => image.id === id
      ? {
          ...image,
          category: patch.category,
          title: patch.title?.trim() || undefined,
          description: patch.description?.trim() || undefined,
          captured_at: patch.captured_at || undefined,
        }
      : image),
    error: null,
  }
}

export function setLiveReportCover(
  images: readonly LiveReportImage[],
  id: string,
) {
  return images.map(image => ({
    ...image,
    is_cover: image.id === id,
  }))
}

export function moveLiveReportImage(
  images: readonly LiveReportImage[],
  id: string,
  direction: -1 | 1,
) {
  const ordered = [...images].sort((left, right) => left.sort_order - right.sort_order)
  const index = ordered.findIndex(image => image.id === id)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return ordered
  const [image] = ordered.splice(index, 1)
  ordered.splice(nextIndex, 0, image)
  return ordered.map((candidate, sortOrder) => ({
    ...candidate,
    sort_order: sortOrder,
  }))
}

export function removeLiveReportImage(
  images: readonly LiveReportImage[],
  id: string,
) {
  const removed = images.find(image => image.id === id)
  const remaining = images
    .filter(image => image.id !== id)
    .map((image, sortOrder) => ({ ...image, sort_order: sortOrder }))
  if (removed?.is_cover && remaining.length > 0) {
    remaining[0] = { ...remaining[0], is_cover: true }
  }
  return { removed, images: remaining }
}

export function sortedLiveReportImages(images: readonly LiveReportImage[]) {
  return [...images].sort((left, right) =>
    Number(right.is_cover) - Number(left.is_cover)
    || left.sort_order - right.sort_order,
  )
}

export function revokeLiveReportImageObjectUrl(
  image: Pick<LiveReportImage, 'file_url'>,
  revokeObjectUrl = (url: string) => URL.revokeObjectURL(url),
) {
  if (image.file_url.startsWith('blob:')) revokeObjectUrl(image.file_url)
}

export function sanitizeLiveReportImageFileName(value: string) {
  const baseName = value.split(/[\\/]/).pop() || 'image'
  return baseName
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
    || 'image'
}

export function resolveLiveReportImagePermissions({
  reportConfirmed,
  isSubmitter,
  canReview,
}: {
  reportConfirmed: boolean
  isSubmitter: boolean
  canReview: boolean
}) {
  const canEdit = !reportConfirmed && (isSubmitter || canReview)
  return {
    canEdit,
    canDelete: canEdit,
    canReorderAndSetCover: canEdit,
  }
}
