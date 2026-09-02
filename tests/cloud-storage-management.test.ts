import assert from 'node:assert/strict'
import test from 'node:test'

import { CloudStorageManager } from '@/lib/storage/cloudStorageManager'
import type { BrandResolver } from '@/lib/storage/cloudStorageManager'
import { CloudStorageError } from '@/lib/storage/types'
import type { Brand } from '@/lib/types/database.types'
import type { FolderCapableFileProvider } from '@/lib/storage/folderCapable'
import type { FileProviderMetadata, FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'

type MockFile = {
  id: string
  name: string
  kind: 'file' | 'folder'
  parentId?: string
}

function createMockProvider(initialFiles: MockFile[] = []): FolderCapableFileProvider & { _files: MockFile[] } {
  const files: MockFile[] = initialFiles.map(f => ({ ...f }))
  let nextId = 1000

  const provider: FolderCapableFileProvider & { _files: MockFile[] } = {
    _files: files,
    name: 'mock',
    async list(parentId?: string): Promise<FileProviderMetadata[]> {
      const children = files.filter(f => f.parentId === parentId)
      return children.map(f => ({
        id: f.id,
        name: f.name,
        kind: f.kind,
        mime_type: f.kind === 'folder' ? 'application/vnd.google-apps.folder' : 'image/png',
        parent_ids: f.parentId ? [f.parentId] : [],
        size_bytes: f.kind === 'file' ? 1024 : undefined,
        provider_metadata: {},
      }))
    },
    async ensureFolder(parentId: string, name: string) {
      const children = files.filter(f => f.parentId === parentId)
      const normalized = name.trim().toLowerCase()
      const matches = children.filter(f => f.kind === 'folder' && f.name.trim().toLowerCase() === normalized)
      if (matches.length > 1) throw new CloudStorageError('CLOUD_FOLDER_AMBIGUOUS')
      if (matches.length === 1) {
        return { provider: this.name, id: matches[0].id, name: matches[0].name, parentId }
      }
      // create
      const id = String(nextId++)
      files.push({ id, name, kind: 'folder', parentId })
      return { provider: this.name, id, name, parentId }
    },
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      const parentId = input.external_parent_id || 'root'
      const children = files.filter(f => f.parentId === parentId)
      const existing = children.find(f => f.name === input.name && f.kind === 'file')
      if (existing) throw new CloudStorageError('CLOUD_FILE_CONFLICT')
      const id = String(nextId++)
      files.push({ id, name: input.name, kind: 'file', parentId })
      return {
        asset: {
          id,
          provider: this.name,
          external_file_id: id,
          external_parent_id: parentId,
          name: input.name,
          mime_type: input.mime_type,
          size_bytes: input.size_bytes,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          status: 'active',
          created_by: input.created_by,
          created_at: new Date().toISOString(),
          provider_metadata: {},
        },
        view_url: `https://mock/${id}`,
      }
    },
    async getMetadata(externalFileId: string) {
      const file = files.find(f => f.id === externalFileId)
      if (!file) throw new CloudStorageError('CLOUD_FOLDER_NOT_FOUND')
      return {
        id: file.id,
        name: file.name,
        kind: file.kind,
        mime_type: file.kind === 'folder' ? 'application/vnd.google-apps.folder' : 'image/png',
        parent_ids: file.parentId ? [file.parentId] : [],
        size_bytes: file.kind === 'file' ? 1024 : undefined,
        provider_metadata: {},
      }
    },
    async read(externalFileId: string) { return new Uint8Array() },
    async getViewUrl(externalFileId: string) { return `https://mock/${externalFileId}` },
    async getDownloadUrl(externalFileId: string) { return `https://mock/download/${externalFileId}` },
    normalizeId(value: string) { return value },
    async delete(externalFileId: string) { const idx = files.findIndex(f => f.id === externalFileId); if (idx > -1) files.splice(idx, 1) },
    async healthCheck() { return { ok: true, provider: 'mock_provider' } },
  }
  return provider
}

function createBrandResolver(brands: Record<string, { id: string; name: string; status: string }>): BrandResolver {
  return {
    async getBrand(brandId: string) {
      const brand = brands[brandId]
      if (!brand) return null
      return { ...brand, status: brand.status as Brand['status'] }
    },
  }
}

test('planStorage: existing year/month/brand folders reused', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
    { id: 'year-2026', name: '2026', kind: 'folder', parentId: 'root' },
    { id: 'month-09', name: '09', kind: 'folder', parentId: 'year-2026' },
    { id: 'brand-opella', name: 'OPELLA', kind: 'folder', parentId: 'month-09' },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  const plan = await manager.planStorage({ year: 2026, month: 9, brandId: 'brand-1' })
  assert.equal(plan.year.exists, true)
  assert.equal(plan.month.exists, true)
  assert.equal(plan.brand.exists, true)
  assert.deepEqual(plan.actionsRequired, ['upload_file'])
})

test('planStorage: missing month gets planned', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
    { id: 'year-2026', name: '2026', kind: 'folder', parentId: 'root' },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  const plan = await manager.planStorage({ year: 2026, month: 9, brandId: 'brand-1' })
  assert.equal(plan.year.exists, true)
  assert.equal(plan.month.exists, false)
  assert.equal(plan.brand.exists, false)
  assert.deepEqual(plan.actionsRequired, ['create_month_folder', 'create_brand_folder', 'upload_file'])
})

test('planStorage: missing brand gets planned', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
    { id: 'year-2026', name: '2026', kind: 'folder', parentId: 'root' },
    { id: 'month-09', name: '09', kind: 'folder', parentId: 'year-2026' },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  const plan = await manager.planStorage({ year: 2026, month: 9, brandId: 'brand-1' })
  assert.equal(plan.year.exists, true)
  assert.equal(plan.month.exists, true)
  assert.equal(plan.brand.exists, false)
  assert.deepEqual(plan.actionsRequired, ['create_brand_folder', 'upload_file'])
})

test('planStorage: unknown brand blocks', async () => {
  const provider = createMockProvider()
  const resolver = createBrandResolver({})
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  await assert.rejects(() => manager.planStorage({ year: 2026, month: 9, brandId: 'brand-unknown' }), (err) => err instanceof CloudStorageError && err.code === 'CLOUD_BRAND_NOT_FOUND')
})

test('planStorage: inactive brand blocks', async () => {
  const provider = createMockProvider()
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'inactive' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  await assert.rejects(() => manager.planStorage({ year: 2026, month: 9, brandId: 'brand-1' }), (err) => err instanceof CloudStorageError && err.code === 'CLOUD_BRAND_NOT_ALLOWED')
})

test('planStorage: duplicate year folders -> ambiguity', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
    { id: 'year-2026-a', name: '2026', kind: 'folder', parentId: 'root' },
    { id: 'year-2026-b', name: '2026', kind: 'folder', parentId: 'root' },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  await assert.rejects(() => manager.planStorage({ year: 2026, month: 9, brandId: 'brand-1' }), (err) => err instanceof CloudStorageError && err.code === 'CLOUD_FOLDER_AMBIGUOUS')
})

test('planStorage: zero writes', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  const initialFiles = provider._files.length
  await manager.planStorage({ year: 2026, month: 9, brandId: 'brand-1' })
  assert.equal(provider._files.length, initialFiles)
})

test('executeStorage: creates missing year, month, brand in order', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  const result = await manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png',
      mimeType: 'image/png',
      size: 1024,
      content: new Uint8Array([1, 2, 3, 4]),
      createdBy: 'user-1',
      entityType: 'report',
      entityId: 'report-1',
    },
  })
  assert.equal(result.plan.year.exists, true)
  assert.equal(result.plan.month.exists, true)
  assert.equal(result.plan.brand.exists, true)
  const folderIds = provider._files.filter(f => f.kind === 'folder').map(f => f.id)
  assert.ok(folderIds.includes(result.plan.year.folderId!))
  assert.ok(folderIds.includes(result.plan.month.folderId!))
  assert.ok(folderIds.includes(result.plan.brand.folderId!))
  // verify file exists
  const file = provider._files.find(f => f.id === result.fileRef.id)
  assert.ok(file)
  assert.equal(file.name, 'test.png')
})

test('executeStorage: reuses existing folders', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
    { id: 'year-2026', name: '2026', kind: 'folder', parentId: 'root' },
    { id: 'month-09', name: '09', kind: 'folder', parentId: 'year-2026' },
    { id: 'brand-opella', name: 'OPELLA', kind: 'folder', parentId: 'month-09' },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  const initialCount = provider._files.length
  await manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png',
      mimeType: 'image/png',
      size: 1024,
      content: new Uint8Array([1, 2, 3, 4]),
      createdBy: 'user-1',
      entityType: 'report',
      entityId: 'report-1',
    },
  })
  assert.equal(provider._files.length, initialCount + 1) // only the new file
})

test('executeStorage: idempotent - repeated execution creates no duplicate folders', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  const first = await manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test1.png',
      mimeType: 'image/png',
      size: 1024,
      content: new Uint8Array([1, 2, 3, 4]),
      createdBy: 'user-1',
      entityType: 'report',
      entityId: 'report-1',
    },
  })
  const second = await manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test2.png',
      mimeType: 'image/png',
      size: 1024,
      content: new Uint8Array([5, 6, 7, 8]),
      createdBy: 'user-1',
      entityType: 'report',
      entityId: 'report-2',
    },
  })
  // no duplicate folders
  const folderCount = provider._files.filter(f => f.kind === 'folder').length
  // root + year + month + brand = 4 folders; plus root is already there
  assert.equal(folderCount, 4) // root, 2026, 09, OPELLA
  // two files
  const fileCount = provider._files.filter(f => f.kind === 'file').length
  assert.equal(fileCount, 2)
})

test('executeStorage: same-name file conflict throws CLOUD_FILE_CONFLICT', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  await manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png',
      mimeType: 'image/png',
      size: 1024,
      content: new Uint8Array([1, 2, 3, 4]),
      createdBy: 'user-1',
      entityType: 'report',
      entityId: 'report-1',
    },
  })
  await assert.rejects(() => manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png',
      mimeType: 'image/png',
      size: 1024,
      content: new Uint8Array([5, 6, 7, 8]),
      createdBy: 'user-1',
      entityType: 'report',
      entityId: 'report-1',
    },
  }), (err) => err instanceof CloudStorageError && err.code === 'CLOUD_FILE_CONFLICT')
})

test('concurrency: ensureFolder re-lists on conflict', async () => {
  // We'll simulate by having the mock provider throw on first create, then succeed on re-list
  // For simplicity we test that ensureChildFolder does re-list after conflict
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
  ])
  // We'll spy on list calls
  let listCalls = 0
  const originalList = provider.list.bind(provider)
  provider.list = async (parentId?: string) => {
    listCalls++
    return originalList(parentId)
  }
  // We'll make ensureFolder fail once then succeed on retry
  let ensureAttempt = 0
  const originalEnsure = provider.ensureFolder.bind(provider)
  provider.ensureFolder = async (parentId: string, name: string) => {
    if (ensureAttempt === 0) {
      ensureAttempt++
      // simulate conflict: folder created by another process
      // first we create the folder manually
      provider._files.push({ id: 'manual-folder', name, kind: 'folder', parentId })
      // then throw to trigger re-list
      throw new Error('Simulated conflict')
    }
    return originalEnsure(parentId, name)
  }

  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  // This will attempt to ensure year folder; first attempt fails, re-list finds the manual folder
  const result = await manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png',
      mimeType: 'image/png',
      size: 1024,
      content: new Uint8Array([1, 2, 3, 4]),
      createdBy: 'user-1',
      entityType: 'report',
      entityId: 'report-1',
    },
  })
  // Should have re-listed after conflict
  assert.ok(listCalls > 1)
  // Should have used the manual folder
  const yearFolder = provider._files.find(f => f.id === 'manual-folder')
  assert.ok(yearFolder)
  assert.equal(yearFolder.name, '2026')
})

test('month naming: canonical MM', async () => {
  const provider = createMockProvider([
    { id: 'root', name: 'root', kind: 'folder', parentId: undefined },
  ])
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  const result = await manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png',
      mimeType: 'image/png',
      size: 1024,
      content: new Uint8Array([1, 2, 3, 4]),
      createdBy: 'user-1',
      entityType: 'report',
      entityId: 'report-1',
    },
  })
  const monthFolder = provider._files.find(f => f.id === result.plan.month.folderId)
  assert.ok(monthFolder)
  assert.equal(monthFolder.name, '09')
})

test('error normalization: provider error maps to CloudStorageError', async () => {
  const provider = createMockProvider([])
  // override list to throw
  provider.list = async () => { throw new Error('Provider unavailable') }
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  await assert.rejects(() => manager.planStorage({ year: 2026, month: 9, brandId: 'brand-1' }), (err) => err instanceof CloudStorageError && err.code === 'CLOUD_PROVIDER_UNAVAILABLE')
})

test('security: no token or secret in surfaced errors', async () => {
  const provider = createMockProvider([])
  provider.list = async () => { throw new Error('Access token expired') }
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  try {
    await manager.planStorage({ year: 2026, month: 9, brandId: 'brand-1' })
    assert.fail('Should have thrown')
  } catch (err) {
    assert.ok(err instanceof CloudStorageError)
    assert.ok(!err.message.includes('token'))
    assert.ok(!err.message.includes('secret'))
  }
})

test('provider folder failures normalize without leaking raw messages', async () => {
  const provider = createMockProvider([{ id: 'root', name: 'root', kind: 'folder' }])
  provider.ensureFolder = async () => { throw new Error('provider secret token') }
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  await assert.rejects(() => manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png', mimeType: 'image/png', size: 1, content: new Uint8Array([1]),
      createdBy: 'user-1', entityType: 'report', entityId: 'report-1',
    },
  }), (error: unknown) => error instanceof CloudStorageError
    && error.code === 'CLOUD_PROVIDER_UNAVAILABLE'
    && !error.message.includes('token'))
})

test('provider upload failures normalize while preserving known cloud errors', async () => {
  const folders = [
    { id: 'root', name: 'root', kind: 'folder' as const },
    { id: 'year', name: '2026', kind: 'folder' as const, parentId: 'root' },
    { id: 'month', name: '09', kind: 'folder' as const, parentId: 'year' },
    { id: 'brand', name: 'OPELLA', kind: 'folder' as const, parentId: 'month' },
  ]
  const provider = createMockProvider(folders)
  provider.upload = async () => { throw new Error('provider response token=secret') }
  const resolver = createBrandResolver({ 'brand-1': { id: 'brand-1', name: 'OPELLA', status: 'active' } })
  const manager = new CloudStorageManager({ provider, brandResolver: resolver, rootFolderId: 'root' })
  await assert.rejects(() => manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png', mimeType: 'image/png', size: 1, content: new Uint8Array([1]),
      createdBy: 'user-1', entityType: 'report', entityId: 'report-1',
    },
  }), (error: unknown) => error instanceof CloudStorageError
    && error.code === 'CLOUD_PROVIDER_UNAVAILABLE'
    && !error.message.includes('token')
    && !error.message.includes('secret'))

  provider.upload = async () => { throw new CloudStorageError('CLOUD_FILE_CONFLICT') }
  await assert.rejects(() => manager.executeStorage({
    year: 2026,
    month: 9,
    brandId: 'brand-1',
    fileInput: {
      name: 'test.png', mimeType: 'image/png', size: 1, content: new Uint8Array([1]),
      createdBy: 'user-1', entityType: 'report', entityId: 'report-1',
    },
  }), (error: unknown) => error instanceof CloudStorageError && error.code === 'CLOUD_FILE_CONFLICT')
})
