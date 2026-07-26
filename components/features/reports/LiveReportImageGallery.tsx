'use client'

import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Images,
  Save,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'

import type {
  LiveReportImage,
  LiveReportImageCategory,
} from '@/lib/types/database.types'
import {
  createLiveReportImageDrafts,
  liveReportImageCategories,
  maximumLiveReportImageDescriptionLength,
  maximumLiveReportImages,
  maximumLiveReportImageTitleLength,
  revokeLiveReportImageObjectUrl,
  sortedLiveReportImages,
  type LiveReportImageValidationCode,
} from '@/lib/utils/liveReportImages'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export const liveReportImageCategoryTranslationKeys: Record<LiveReportImageCategory, TranslationKey> = {
  key_visual: 'liveImageCategoryKeyVisual',
  live_session: 'liveImageCategorySession',
  other: 'liveImageCategoryOther',
}

const validationTranslationKeys: Record<LiveReportImageValidationCode, TranslationKey> = {
  maximum_count: 'liveImageMaximumCountError',
  invalid_mime: 'liveImageInvalidMimeError',
  invalid_extension: 'liveImageInvalidExtensionError',
  file_too_large: 'liveImageTooLargeError',
  empty_file: 'liveImageEmptyFileError',
  title_too_long: 'liveImageTitleTooLongError',
  description_too_long: 'liveImageDescriptionTooLongError',
}

export function LiveReportImageEditor({
  images,
  uploadedBy,
  editable,
  canReorderAndSetCover,
  canDelete,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
  onSetCover,
}: {
  images: LiveReportImage[]
  uploadedBy?: string
  editable: boolean
  canReorderAndSetCover: boolean
  canDelete: boolean
  onAdd: (images: LiveReportImage[]) => void | Promise<void>
  onUpdate: (
    image: LiveReportImage,
    patch: Pick<LiveReportImage, 'category' | 'title' | 'description' | 'captured_at'>,
  ) => void | Promise<void>
  onDelete: (image: LiveReportImage) => void | Promise<void>
  onMove: (image: LiveReportImage, direction: -1 | 1) => void | Promise<void>
  onSetCover: (image: LiveReportImage) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploadCategory, setUploadCategory] = React.useState<LiveReportImageCategory>('live_session')
  const [dragging, setDragging] = React.useState(false)
  const [validationErrors, setValidationErrors] = React.useState<Array<{
    code: LiveReportImageValidationCode
    fileName?: string
  }>>([])

  const addFiles = async (files: readonly File[]) => {
    if (!editable || files.length === 0) return
    const result = createLiveReportImageDrafts({
      files,
      currentImages: images,
      category: uploadCategory,
      uploadedBy,
    })
    setValidationErrors(result.errors)
    if (result.images.length === 0) return
    try {
      await onAdd(result.images)
    } catch {
      result.images.forEach(image => revokeLiveReportImageObjectUrl(image))
    }
  }

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    void addFiles(files)
    event.target.value = ''
  }

  return (
    <section className="space-y-4 rounded-lg border p-4" data-testid="live-report-image-editor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t('liveSessionImages')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('liveSessionImagesHelp')}</p>
        </div>
        <Badge variant="outline" data-testid="live-report-image-count">
          {t('liveImageCount', { count: images.length, maximum: maximumLiveReportImages })}
        </Badge>
      </div>
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t('liveImageMockStorageNotice')}
      </p>

      {editable && (
        <div className="space-y-3">
          <div className="max-w-xs">
            <Select value={uploadCategory} onValueChange={value => setUploadCategory(value as LiveReportImageCategory)}>
              <SelectTrigger data-testid="live-image-upload-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {liveReportImageCategories.map(category => (
                  <SelectItem value={category} key={category}>{t(liveReportImageCategoryTranslationKeys[category])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div
            className={`flex min-h-28 flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}`}
            data-testid="live-image-drop-zone"
            onDragEnter={event => { event.preventDefault(); setDragging(true) }}
            onDragOver={event => { event.preventDefault(); setDragging(true) }}
            onDragLeave={event => { event.preventDefault(); setDragging(false) }}
            onDrop={event => {
              event.preventDefault()
              setDragging(false)
              void addFiles(Array.from(event.dataTransfer.files))
            }}
          >
            <Images className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">{t('dropLiveImagesHere')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('liveImageUploadLimits')}</p>
            <Button className="mt-3" type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />{t('chooseImages')}
            </Button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleInput}
              data-testid="live-report-image-upload"
            />
          </div>
          {validationErrors.length > 0 && (
            <div className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-700" data-testid="live-image-validation-errors">
              {validationErrors.map((error, index) => (
                <p key={`${error.code}-${error.fileName || index}`}>
                  {error.fileName ? `${error.fileName}: ` : ''}{t(validationTranslationKeys[error.code])}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {images.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t('noLiveSessionImages')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...images].sort((left, right) => left.sort_order - right.sort_order).map((image, index) => (
            <LiveReportImageEditorCard
              key={image.id}
              image={image}
              index={index}
              total={images.length}
              editable={editable}
              canDelete={canDelete}
              canReorderAndSetCover={canReorderAndSetCover}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMove={onMove}
              onSetCover={onSetCover}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function LiveReportImageEditorCard({
  image,
  index,
  total,
  editable,
  canDelete,
  canReorderAndSetCover,
  onUpdate,
  onDelete,
  onMove,
  onSetCover,
}: {
  image: LiveReportImage
  index: number
  total: number
  editable: boolean
  canDelete: boolean
  canReorderAndSetCover: boolean
  onUpdate: (
    image: LiveReportImage,
    patch: Pick<LiveReportImage, 'category' | 'title' | 'description' | 'captured_at'>,
  ) => void | Promise<void>
  onDelete: (image: LiveReportImage) => void | Promise<void>
  onMove: (image: LiveReportImage, direction: -1 | 1) => void | Promise<void>
  onSetCover: (image: LiveReportImage) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [metadata, setMetadata] = React.useState({
    category: image.category,
    title: image.title || '',
    description: image.description || '',
    captured_at: image.captured_at || '',
  })

  React.useEffect(() => {
    setMetadata({
      category: image.category,
      title: image.title || '',
      description: image.description || '',
      captured_at: image.captured_at || '',
    })
  }, [image])

  return (
    <article className="space-y-3 rounded-lg border p-3" data-testid={`live-image-card-${image.id}`}>
      <div className="relative">
        <img
          src={image.thumbnail_url || image.file_url}
          alt={image.title || image.file_name}
          className="aspect-video w-full rounded-md border object-cover"
        />
        {image.is_cover && (
          <Badge className="absolute left-2 top-2 bg-amber-500 text-white" data-testid="live-image-cover-badge">
            <Star className="mr-1 h-3 w-3 fill-current" />{t('reportCover')}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">{t(liveReportImageCategoryTranslationKeys[image.category])}</Badge>
        <p className="text-xs text-muted-foreground">{formatImageSize(image.size_bytes)}</p>
      </div>
      <p className="truncate text-xs text-muted-foreground" title={image.file_name}>{image.file_name}</p>
      {editable ? (
        <>
          <Select value={metadata.category} onValueChange={value => setMetadata(current => ({ ...current, category: value as LiveReportImageCategory }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {liveReportImageCategories.map(category => (
                <SelectItem value={category} key={category}>{t(liveReportImageCategoryTranslationKeys[category])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={metadata.title}
            maxLength={maximumLiveReportImageTitleLength}
            placeholder={t('imageTitleOptional')}
            onChange={event => setMetadata(current => ({ ...current, title: event.target.value }))}
          />
          <Textarea
            value={metadata.description}
            maxLength={maximumLiveReportImageDescriptionLength}
            placeholder={t('imageDescriptionOptional')}
            onChange={event => setMetadata(current => ({ ...current, description: event.target.value }))}
          />
          <label className="text-xs font-medium">{t('capturedAtOptional')}
            <Input
              className="mt-1"
              type="datetime-local"
              value={metadata.captured_at}
              onChange={event => setMetadata(current => ({ ...current, captured_at: event.target.value }))}
            />
          </label>
          <Button type="button" size="sm" variant="outline" onClick={() => void onUpdate(image, metadata)}>
            <Save className="mr-1 h-4 w-4" />{t('saveMetadata')}
          </Button>
        </>
      ) : (
        <LiveReportImageMetadata image={image} />
      )}
      <div className="flex flex-wrap gap-2">
        {canReorderAndSetCover && (
          <>
            <Button type="button" size="icon-sm" variant="outline" disabled={index === 0} aria-label={t('moveImageEarlier')} onClick={() => void onMove(image, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" size="icon-sm" variant="outline" disabled={index === total - 1} aria-label={t('moveImageLater')} onClick={() => void onMove(image, 1)}><ArrowDown className="h-4 w-4" /></Button>
            {!image.is_cover && <Button type="button" size="sm" variant="outline" onClick={() => void onSetCover(image)}><Star className="mr-1 h-4 w-4" />{t('setAsReportCover')}</Button>}
          </>
        )}
        {canDelete && <Button type="button" size="sm" variant="ghost" onClick={() => void onDelete(image)}><Trash2 className="mr-1 h-4 w-4 text-red-600" />{t('deleteImage')}</Button>}
      </div>
    </article>
  )
}

export function LiveReportImageGallery({
  images,
}: {
  images: LiveReportImage[]
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = React.useState<'all' | LiveReportImageCategory>('all')
  const [viewerId, setViewerId] = React.useState<string | null>(null)
  const ordered = sortedLiveReportImages(images)
  const filtered = filter === 'all'
    ? ordered
    : ordered.filter(image => image.category === filter)
  const cover = ordered.find(image => image.is_cover)
  const viewerIndex = filtered.findIndex(image => image.id === viewerId)
  const viewerImage = viewerIndex >= 0 ? filtered[viewerIndex] : null

  React.useEffect(() => {
    if (viewerId && !filtered.some(image => image.id === viewerId)) setViewerId(null)
  }, [filtered, viewerId])

  return (
    <section className="space-y-4" data-testid="live-report-image-gallery">
      {cover && (
        <button
          type="button"
          className="group relative block w-full overflow-hidden rounded-xl border text-left"
          onClick={() => setViewerId(cover.id)}
          data-testid="live-report-cover"
        >
          <img src={cover.file_url} alt={cover.title || cover.file_name} className="max-h-[420px] w-full object-cover transition-transform group-hover:scale-[1.01]" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12 text-white">
            <Badge className="mb-2 bg-amber-500 text-white"><Star className="mr-1 h-3 w-3 fill-current" />{t('reportCover')}</Badge>
            <p className="font-semibold">{cover.title || cover.file_name}</p>
            {cover.description && <p className="mt-1 line-clamp-2 text-sm text-white/85">{cover.description}</p>}
          </div>
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{t('liveSessionImages')}</h3>
        {images.length > 0 && (
          <Select value={filter} onValueChange={value => setFilter(value as 'all' | LiveReportImageCategory)}>
            <SelectTrigger className="w-64" data-testid="live-image-category-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allImageCategories')}</SelectItem>
              {liveReportImageCategories.map(category => (
                <SelectItem value={category} key={category}>{t(liveReportImageCategoryTranslationKeys[category])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {images.length === 0
        ? <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t('noLiveSessionImages')}</p>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(image => (
              <button
                type="button"
                className="overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md"
                key={image.id}
                onClick={() => setViewerId(image.id)}
                data-testid={`gallery-image-${image.id}`}
              >
                <img src={image.thumbnail_url || image.file_url} alt={image.title || image.file_name} className="aspect-video w-full object-cover" />
                <div className="space-y-2 p-3">
                  <Badge variant="outline">{t(liveReportImageCategoryTranslationKeys[image.category])}</Badge>
                  <LiveReportImageMetadata image={image} />
                </div>
              </button>
            ))}
          </div>}

      <Dialog open={Boolean(viewerImage)} onOpenChange={open => !open && setViewerId(null)}>
        <DialogContent size="full" className="h-[calc(100vh-1rem)] overflow-y-auto bg-black/95 text-white">
          <DialogHeader><DialogTitle className="text-white">{viewerImage?.title || viewerImage?.file_name}</DialogTitle></DialogHeader>
          {viewerImage && (
            <div className="relative flex min-h-[70vh] items-center justify-center">
              <img src={viewerImage.file_url} alt={viewerImage.title || viewerImage.file_name} className="max-h-[78vh] max-w-full object-contain" />
              <Button className="absolute left-2" type="button" size="icon" variant="secondary" disabled={viewerIndex <= 0} aria-label={t('previousImage')} onClick={() => setViewerId(filtered[viewerIndex - 1]?.id || null)}><ChevronLeft className="h-5 w-5" /></Button>
              <Button className="absolute right-2" type="button" size="icon" variant="secondary" disabled={viewerIndex >= filtered.length - 1} aria-label={t('nextImage')} onClick={() => setViewerId(filtered[viewerIndex + 1]?.id || null)}><ChevronRight className="h-5 w-5" /></Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function LiveReportImageMetadata({ image }: { image: LiveReportImage }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <p className="font-medium">{image.title || image.file_name}</p>
      {image.description && <p className="text-sm text-muted-foreground">{image.description}</p>}
      {image.captured_at && <p className="text-xs text-muted-foreground">{t('capturedAt')}: {new Date(image.captured_at).toLocaleString()}</p>}
    </div>
  )
}

function formatImageSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
