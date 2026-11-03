import type {
  LiveReportImage,
  LiveReportImageCategory,
} from '@/lib/types/database.types'

export const liveReportImageCategories: readonly LiveReportImageCategory[] = [
  'key_visual',
  'live_session',
  'other',
]

export const liveReportPhotoGroups = [
  'key_visual_before',
  'key_visual_after',
  'dashboard_summary',
  'dashboard_periodic',
  'live_session',
  'other',
] as const

export type LiveReportPhotoGroup = (typeof liveReportPhotoGroups)[number]

export interface LiveReportPhotoGroupMetadata {
  readonly id: LiveReportPhotoGroup
  readonly code: string
  readonly labelVi: string
  readonly labelEn: string
  readonly descriptionVi: string
  readonly descriptionEn: string
  readonly dbCategory: LiveReportImageCategory
  readonly defaultTitlePrefix?: string
  readonly requiresTimestamp?: boolean
  readonly order: number
}

export const LIVE_REPORT_PHOTO_GROUPS: readonly LiveReportPhotoGroupMetadata[] = [
  {
    id: 'key_visual_before',
    code: 'KV_BEFORE',
    labelVi: '1. Key Visual trước ca',
    labelEn: '1. Pre-session Key Visual',
    descriptionVi: 'Ảnh Key Visual / poster chuẩn bị trước ca live',
    descriptionEn: 'Key visual / poster prepared before live broadcast',
    dbCategory: 'key_visual',
    defaultTitlePrefix: '[KV Trước ca]',
    order: 1,
  },
  {
    id: 'key_visual_after',
    code: 'KV_AFTER',
    labelVi: '2. Key Visual sau ca',
    labelEn: '2. Post-session Key Visual',
    descriptionVi: 'Ảnh Key Visual tổng kết / cảm ơn sau ca live',
    descriptionEn: 'Summary or thank-you key visual after live broadcast',
    dbCategory: 'key_visual',
    defaultTitlePrefix: '[KV Sau ca]',
    order: 2,
  },
  {
    id: 'dashboard_summary',
    code: 'DASHBOARD_SUMMARY',
    labelVi: '3. Dashboard tổng hợp',
    labelEn: '3. Summary Dashboard',
    descriptionVi: 'Ảnh chụp màn hình Dashboard số liệu toàn phiên live',
    descriptionEn: 'Full-session overview dashboard screenshot',
    dbCategory: 'other',
    defaultTitlePrefix: '[Dashboard Tổng hợp]',
    order: 3,
  },
  {
    id: 'dashboard_periodic',
    code: 'DASHBOARD_PERIODIC',
    labelVi: '4. Dashboard chu kỳ 30 phút (có timestamp)',
    labelEn: '4. 30-Minute Interval Dashboard (timestamped)',
    descriptionVi: 'Ảnh chụp màn hình số liệu theo từng mốc 30 phút, ghi rõ thời gian',
    descriptionEn: 'Metrics screenshot at 30-minute intervals with timestamp',
    dbCategory: 'other',
    defaultTitlePrefix: '[Dashboard 30m]',
    requiresTimestamp: true,
    order: 4,
  },
  {
    id: 'live_session',
    code: 'LIVE_SESSION',
    labelVi: '5. Hình ảnh trong phiên livestream',
    labelEn: '5. In-Stream Photos',
    descriptionVi: 'Hình ảnh hậu trường, Host/Trợ live hoặc sản phẩm trong luồng phát',
    descriptionEn: 'Behind-the-scenes, host/support, or in-stream product shots',
    dbCategory: 'live_session',
    order: 5,
  },
  {
    id: 'other',
    code: 'OTHER',
    labelVi: '6. Hình ảnh khác',
    labelEn: '6. Other Photos',
    descriptionVi: 'Tài liệu, sự cố kỹ thuật hoặc hình ảnh bổ trợ khác',
    descriptionEn: 'Documentation, technical issues, or other supporting photos',
    dbCategory: 'other',
    order: 6,
  },
]

export function resolveLiveReportPhotoGroup(
  image: Pick<LiveReportImage, 'category'> & Partial<Pick<LiveReportImage, 'title' | 'description' | 'captured_at'>>,
): LiveReportPhotoGroup {
  const title = (image.title || '').trim().toLowerCase()
  if (image.category === 'key_visual') {
    if (title.includes('sau ca') || title.includes('kv sau') || title.includes('[kv sau ca]') || title.includes('post-session')) {
      return 'key_visual_after'
    }
    return 'key_visual_before'
  }
  if (image.category === 'live_session') {
    return 'live_session'
  }
  if (title.includes('tổng hợp') || title.includes('tong hop') || title.includes('summary') || title.includes('[dashboard tổng hợp]')) {
    return 'dashboard_summary'
  }
  if (title.includes('30') || title.includes('chu kỳ') || title.includes('chu ky') || title.includes('periodic') || title.includes('[dashboard 30m]') || Boolean(image.captured_at)) {
    return 'dashboard_periodic'
  }
  return 'other'
}

export function photoGroupToCategoryAndTitle(
  group: LiveReportPhotoGroup,
  currentTitle?: string,
): {
  category: LiveReportImageCategory
  title?: string
} {
  const meta = LIVE_REPORT_PHOTO_GROUPS.find(g => g.id === group)
  if (!meta) return { category: 'other', title: currentTitle }

  const cleanTitle = (currentTitle || '')
    .replace(/^\[KV Trước ca\]\s*/i, '')
    .replace(/^\[KV Sau ca\]\s*/i, '')
    .replace(/^\[Dashboard Tổng hợp\]\s*/i, '')
    .replace(/^\[Dashboard 30m\]\s*/i, '')
    .trim()

  const prefix = meta.defaultTitlePrefix
  const nextTitle = prefix ? (cleanTitle ? `${prefix} ${cleanTitle}` : prefix) : cleanTitle || undefined

  return {
    category: meta.dbCategory,
    title: nextTitle,
  }
}

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
  category = 'live_session',
  photoGroup,
  uploadedBy,
  createObjectUrl = file => URL.createObjectURL(file),
  createId = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
}: {
  files: readonly File[]
  currentImages: readonly LiveReportImage[]
  category?: LiveReportImageCategory
  photoGroup?: LiveReportPhotoGroup
  uploadedBy?: string
  createObjectUrl?: (file: File) => string
  createId?: () => string
  now?: () => string
}) {
  const images: LiveReportImage[] = []
  const errors: LiveReportImageValidationError[] = []

  const mapped = photoGroup ? photoGroupToCategoryAndTitle(photoGroup) : null
  const effectiveCategory = mapped?.category ?? category
  const defaultTitle = mapped?.title

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
      category: effectiveCategory,
      title: defaultTitle,
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

export function filterLiveReportImagesByCategories(
  images: readonly LiveReportImage[],
  categories: readonly string[],
) {
  if (categories.length === 0) return [...images]
  return images.filter(image =>
    categories.includes(image.category) ||
    categories.includes(resolveLiveReportPhotoGroup(image)),
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
