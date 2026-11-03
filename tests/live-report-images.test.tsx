import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'

import {
  LiveReportImageEditor,
  LiveReportImageGallery,
} from '../components/features/reports/LiveReportImageGallery.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import type { LiveReportImage } from '../lib/types/database.types.ts'
import {
  createLiveReportImageDrafts,
  filterLiveReportImagesByCategories,
  liveReportImageCategories,
  maximumLiveReportImageBytes,
  maximumLiveReportImages,
  moveLiveReportImage,
  removeLiveReportImage,
  resolveLiveReportImagePermissions,
  revokeLiveReportImageObjectUrl,
  setLiveReportCover,
  updateLiveReportImageMetadata,
  validateLiveReportImageFile,
} from '../lib/utils/liveReportImages.ts'

const { createElement } = React
;(globalThis as typeof globalThis & { React: typeof React }).React = React

const makeImage = (
  id: string,
  sortOrder: number,
  patch: Partial<LiveReportImage> = {},
): LiveReportImage => ({
  id,
  report_id: 'report-gallery-test',
  category: 'live_session',
  file_url: `https://example.test/${id}.jpg`,
  file_name: `${id}.jpg`,
  mime_type: 'image/jpeg',
  size_bytes: 512,
  sort_order: sortOrder,
  is_cover: sortOrder === 0,
  uploaded_by: 'member-1',
  created_at: '2026-07-26T10:00:00.000Z',
  ...patch,
})

test('live image category filters use OR within the selected category dimension', () => {
  const images = [
    makeImage('session', 0, { category: 'live_session' }),
    makeImage('visual', 1, { category: 'key_visual' }),
    makeImage('other', 2, { category: 'other' }),
  ]

  assert.deepEqual(filterLiveReportImagesByCategories(images, ['live_session', 'key_visual'])
    .map(image => image.id), ['session', 'visual'])
  assert.deepEqual(filterLiveReportImagesByCategories(images, []).map(image => image.id), [
    'session', 'visual', 'other',
  ])
})

test('multiple valid images become typed drafts in the selected category', () => {
  assert.deepEqual(liveReportImageCategories, ['key_visual', 'live_session', 'other'])
  let id = 0
  const result = createLiveReportImageDrafts({
    files: [
      new File(['first'], 'first.jpg', { type: 'image/jpeg' }),
      new File(['second'], 'second.webp', { type: 'image/webp' }),
    ],
    currentImages: [],
    category: 'key_visual',
    uploadedBy: 'member-1',
    createObjectUrl: file => `blob:test/${file.name}`,
    createId: () => `draft-${++id}`,
    now: () => '2026-07-26T10:00:00.000Z',
  })

  assert.equal(result.errors.length, 0)
  assert.equal(result.images.length, 2)
  assert.deepEqual(result.images.map(image => image.category), [
    'key_visual',
    'key_visual',
  ])
  assert.equal(result.images[0].is_cover, true)
  assert.equal(result.images[1].is_cover, false)
})

test('category and optional metadata can be edited without changing file data', () => {
  const original = makeImage('metadata', 0)
  const result = updateLiveReportImageMetadata([original], original.id, {
    category: 'other',
    title: '  Stream interruption  ',
    description: '  Network recovered after two minutes.  ',
    captured_at: '2026-07-26T20:15',
  })

  assert.equal(result.error, null)
  assert.equal(result.images[0].category, 'other')
  assert.equal(result.images[0].title, 'Stream interruption')
  assert.equal(result.images[0].description, 'Network recovered after two minutes.')
  assert.equal(result.images[0].file_url, original.file_url)
})

test('selecting a cover always leaves exactly one cover', () => {
  const images = [makeImage('first', 0), makeImage('second', 1)]
  const next = setLiveReportCover(images, 'second')
  assert.equal(next.filter(image => image.is_cover).length, 1)
  assert.equal(next.find(image => image.is_cover)?.id, 'second')
})

test('deleting the cover promotes the first remaining image', () => {
  const result = removeLiveReportImage([
    makeImage('cover', 0),
    makeImage('remaining', 1),
  ], 'cover')
  assert.equal(result.removed?.id, 'cover')
  assert.deepEqual(result.images.map(image => image.id), ['remaining'])
  assert.equal(result.images[0].is_cover, true)
  assert.equal(result.images[0].sort_order, 0)
})

test('reordering updates stable sort order and preserves the cover flag', () => {
  const next = moveLiveReportImage([
    makeImage('cover', 0),
    makeImage('middle', 1),
    makeImage('last', 2),
  ], 'last', -1)
  assert.deepEqual(next.map(image => image.id), ['cover', 'last', 'middle'])
  assert.deepEqual(next.map(image => image.sort_order), [0, 1, 2])
  assert.equal(next.find(image => image.id === 'cover')?.is_cover, true)
})

test('invalid MIME, oversized files, and maximum image count are rejected', () => {
  assert.equal(
    validateLiveReportImageFile(
      new File(['text'], 'not-an-image.txt', { type: 'text/plain' }),
      0,
    )?.code,
    'invalid_mime',
  )
  assert.equal(
    validateLiveReportImageFile(
      new File(['image'], 'mismatched.png', { type: 'image/jpeg' }),
      0,
    )?.code,
    'invalid_extension',
  )
  assert.equal(
    validateLiveReportImageFile(
      { name: 'large.png', type: 'image/png', size: maximumLiveReportImageBytes + 1 },
      0,
    )?.code,
    'file_too_large',
  )
  assert.equal(
    validateLiveReportImageFile(
      new File(['image'], 'overflow.png', { type: 'image/png' }),
      maximumLiveReportImages,
    )?.code,
    'maximum_count',
  )
})

test('report detail gallery renders the cover and category metadata', () => {
  const markup = renderToStaticMarkup(createElement(
    LanguageProvider,
    { defaultLanguage: 'en' },
    createElement(LiveReportImageGallery, {
      images: [
        makeImage('session', 0, {
          is_cover: false,
          title: 'During the stream',
        }),
        makeImage('visual', 1, {
          category: 'key_visual',
          is_cover: true,
          title: 'Campaign key visual',
          description: 'Primary report cover',
          captured_at: '2026-07-26T19:30:00.000Z',
        }),
      ],
    }),
  ))

  assert.match(markup, /data-testid="live-report-cover"/)
  assert.match(markup, /Campaign key visual/)
  assert.match(markup, /Live session key visual/)
  assert.match(markup, /data-testid="gallery-image-session"/)
})

test('Final Report renders the image section after metrics and before notes', () => {
  const source = readFileSync(
    new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url),
    'utf8',
  )
  const metricsPosition = source.indexOf('data-testid="ocr-main-metrics"')
  const galleryPosition = source.indexOf('<LiveReportImageEditor')
  const notesPosition = source.indexOf('data-testid="final-report-notes-section"')
  assert.ok(metricsPosition >= 0)
  assert.ok(galleryPosition > metricsPosition)
  assert.ok(notesPosition > galleryPosition)
  assert.match(source, /platformSpecificMetrics/)
})

test('empty editor remains visible and hides all actions in read-only mode', () => {
  const noop = () => undefined
  const editableMarkup = renderToStaticMarkup(createElement(
    LanguageProvider,
    { defaultLanguage: 'en' },
    createElement(LiveReportImageEditor, {
      images: [],
      editable: true,
      canDelete: true,
      canReorderAndSetCover: true,
      onAdd: noop,
      onUpdate: noop,
      onDelete: noop,
      onMove: noop,
      onSetCover: noop,
    }),
  ))
  assert.match(editableMarkup, /data-testid="live-report-image-editor"/)
  assert.match(editableMarkup, /No images have been added to this report\./)
  assert.match(editableMarkup, /data-testid="live-report-image-upload"/)
  assert.match(editableMarkup, />Add images</)

  const readOnlyMarkup = renderToStaticMarkup(createElement(
    LanguageProvider,
    { defaultLanguage: 'en' },
    createElement(LiveReportImageEditor, {
      images: [],
      editable: false,
      canDelete: false,
      canReorderAndSetCover: false,
      onAdd: noop,
      onUpdate: noop,
      onDelete: noop,
      onMove: noop,
      onSetCover: noop,
    }),
  ))
  assert.match(readOnlyMarkup, /data-testid="live-report-image-editor"/)
  assert.doesNotMatch(readOnlyMarkup, /data-testid="live-report-image-upload"/)

  const readOnlyGalleryMarkup = renderToStaticMarkup(createElement(
    LanguageProvider,
    { defaultLanguage: 'en' },
    createElement(LiveReportImageGallery, { images: [] }),
  ))
  assert.match(readOnlyGalleryMarkup, /Live session images/)
  assert.match(readOnlyGalleryMarkup, /No images have been added to this report\./)
})

test('approved reports are read-only until Leader or Admin reopens them', () => {
  assert.deepEqual(resolveLiveReportImagePermissions({
    reportConfirmed: true,
    isSubmitter: true,
    canReview: false,
  }), {
    canEdit: false,
    canDelete: false,
    canReorderAndSetCover: false,
  })
  assert.deepEqual(resolveLiveReportImagePermissions({
    reportConfirmed: true,
    isSubmitter: false,
    canReview: true,
  }), {
    canEdit: false,
    canDelete: false,
    canReorderAndSetCover: false,
  })
  assert.deepEqual(resolveLiveReportImagePermissions({
    reportConfirmed: false,
    isSubmitter: false,
    canReview: true,
  }), {
    canEdit: true,
    canDelete: true,
    canReorderAndSetCover: true,
  })
  assert.deepEqual(resolveLiveReportImagePermissions({
    reportConfirmed: false,
    isSubmitter: true,
    canReview: false,
  }), {
    canEdit: true,
    canDelete: true,
    canReorderAndSetCover: true,
  })
})

test('blob object URLs are revoked while remote storage URLs are preserved', () => {
  const revoked: string[] = []
  revokeLiveReportImageObjectUrl(
    { file_url: 'blob:test/local-image' },
    url => revoked.push(url),
  )
  revokeLiveReportImageObjectUrl(
    { file_url: 'https://example.test/remote-image.jpg' },
    url => revoked.push(url),
  )
  assert.deepEqual(revoked, ['blob:test/local-image'])
})


test('live gallery renders the original filename and never the provider storage filename', () => {
  const providerName = `20260914_live-session_${'A'.repeat(64)}_original.png`
  const image = makeImage('display', 0, {
    file_name: 'original.png', storage_file_name: providerName,
    storage_idempotency_key: `live_session:${'a'.repeat(64)}`,
  })
  const markup = renderToStaticMarkup(createElement(LanguageProvider, null,
    createElement(LiveReportImageGallery, { images: [image] })))
  assert.match(markup, /original\.png/u)
  assert.doesNotMatch(markup, /20260914_live-session/u)
})

test('Issue #164: supports all 6 Owner photo groups in exact order with receipt status', async () => {
  const {
    LIVE_REPORT_PHOTO_GROUPS,
    resolveLiveReportPhotoGroup,
    photoGroupToCategoryAndTitle,
    createLiveReportImageDrafts,
  } = await import('../lib/utils/liveReportImages.ts')

  // 1. Verify exact 6 groups and order
  assert.equal(LIVE_REPORT_PHOTO_GROUPS.length, 6)
  assert.deepEqual(LIVE_REPORT_PHOTO_GROUPS.map(g => g.id), [
    'key_visual_before',
    'key_visual_after',
    'dashboard_summary',
    'dashboard_periodic',
    'live_session',
    'other',
  ])
  assert.deepEqual(LIVE_REPORT_PHOTO_GROUPS.map(g => g.order), [1, 2, 3, 4, 5, 6])
  assert.equal(LIVE_REPORT_PHOTO_GROUPS[3].requiresTimestamp, true)

  // 2. Resolution logic
  assert.equal(resolveLiveReportPhotoGroup({ category: 'key_visual', title: '[KV Trước ca] Poster' }), 'key_visual_before')
  assert.equal(resolveLiveReportPhotoGroup({ category: 'key_visual', title: '[KV Sau ca] Cam on' }), 'key_visual_after')
  assert.equal(resolveLiveReportPhotoGroup({ category: 'other', title: '[Dashboard Tổng hợp] All metrics' }), 'dashboard_summary')
  assert.equal(resolveLiveReportPhotoGroup({ category: 'other', title: '[Dashboard 30m]', captured_at: '2026-09-01T10:30' }), 'dashboard_periodic')
  assert.equal(resolveLiveReportPhotoGroup({ category: 'live_session', title: 'Host live' }), 'live_session')
  assert.equal(resolveLiveReportPhotoGroup({ category: 'other', title: 'Bang ghi chu' }), 'other')

  // 3. Mapping photoGroup to DB category and title
  assert.deepEqual(photoGroupToCategoryAndTitle('key_visual_before', 'Poster'), {
    category: 'key_visual',
    title: '[KV Trước ca] Poster',
  })
  assert.deepEqual(photoGroupToCategoryAndTitle('dashboard_summary', 'Toan ca'), {
    category: 'other',
    title: '[Dashboard Tổng hợp] Toan ca',
  })

  // 4. Draft creation with photoGroup
  const draftResult = createLiveReportImageDrafts({
    files: [new File(['data'], 'interval-1.png', { type: 'image/png' })],
    currentImages: [],
    photoGroup: 'dashboard_periodic',
    createObjectUrl: () => 'blob:test/interval-1.png',
    createId: () => 'draft-30m-1',
  })
  assert.equal(draftResult.images.length, 1)
  assert.equal(draftResult.images[0].category, 'other')
  assert.equal(draftResult.images[0].title, '[Dashboard 30m]')

  // 4. Receipt badges rendering
  const pendingImage = makeImage('draft-card', 0, {
    file_url: 'blob:test/card.png',
    report_id: undefined,
  })
  const persistedImage = makeImage('persisted-card', 1, {
    file_url: 'https://example.test/persisted.png',
    report_id: 'report-123',
    storage_file_name: 'drive-storage-123',
  })

  const editorMarkup = renderToStaticMarkup(createElement(
    LanguageProvider,
    { defaultLanguage: 'vi' },
    createElement(LiveReportImageEditor, {
      images: [pendingImage, persistedImage],
      editable: false,
      canDelete: false,
      canReorderAndSetCover: false,
      onAdd: () => undefined,
      onUpdate: () => undefined,
      onDelete: () => undefined,
      onMove: () => undefined,
      onSetCover: () => undefined,
    }),
  ))

  assert.match(editorMarkup, /data-testid="image-status-draft"/)
  assert.match(editorMarkup, /Chờ lưu \(Bản nháp\)/)
  assert.match(editorMarkup, /data-testid="image-status-persisted"/)
  assert.match(editorMarkup, /Đã lưu trên hệ thống/)
})

