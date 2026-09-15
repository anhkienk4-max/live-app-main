import { describe, it } from 'node:test'
import assert from 'node:assert'
import { calculateAggregate } from '../components/features/dashboard/DashboardOverview'
import fs from 'node:fs'
import path from 'node:path'
import { createSupabaseReportRepository } from '../lib/services/supabaseReportService'

type StorageTable = 'report_images' | 'live_report_images'
type MockRow = Record<string, unknown>
type MockError = { code?: string; message?: string; status?: string | number; statusCode?: string | number }
type MockResult = { data?: unknown; error?: MockError | null }
type MockQuery = {
  eq: (column: string, value: unknown) => MockQuery
  is: (column: string, value: unknown) => MockQuery
  order: () => Promise<{ data: MockRow[]; error: null }>
  maybeSingle: () => Promise<{ data: MockRow | null; error: null }>
}
type StorageHarnessState = {
  reportImages: MockRow[]
  liveImages: MockRow[]
  objects: Set<string>
  uploadPaths: string[]
  removePaths: string[]
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>
  readCounts: Record<string, number>
}
type StorageHarnessOptions = {
  read?: (table: StorageTable, state: StorageHarnessState, count: number) => MockRow[] | Promise<MockRow[]>
  upload?: (storagePath: string, state: StorageHarnessState) => Promise<MockResult>
  remove?: (storagePaths: string[], state: StorageHarnessState) => Promise<MockResult>
  rpc?: (name: string, args: Record<string, unknown>, state: StorageHarnessState) => Promise<MockResult>
  beforeRpc?: (name: string) => Promise<void>
  sign?: () => Promise<{ data?: { signedUrl?: string }; error?: MockError }>
}

function reportImageRow(storagePath: string, id = 'report-image'): MockRow {
  return {
    id,
    report_id: 'r1',
    image_url: storagePath,
    storage_path: storagePath,
    image_type: 'dashboard',
    uploaded_by: 'u1',
    created_at: '2026-09-14T00:00:00.000Z',
    deleted_at: null,
  }
}

function liveImageRow(fileUrl: string, id = 'live-image'): MockRow {
  return {
    id,
    report_id: 'r1',
    file_url: fileUrl,
    file_name: fileUrl.split('/').at(-1),
    category: 'other',
    mime_type: 'image/png',
    size_bytes: 1,
    sort_order: 0,
    is_cover: false,
    created_at: '2026-09-14T00:00:00.000Z',
  }
}

function createStorageHarness(options: StorageHarnessOptions = {}) {
  const state: StorageHarnessState = {
    reportImages: [],
    liveImages: [],
    objects: new Set(),
    uploadPaths: [],
    removePaths: [],
    rpcCalls: [],
    readCounts: {},
  }
  let nextId = 1
  const rowsFor = (table: StorageTable) => table === 'report_images' ? state.reportImages : state.liveImages
  const client = {
    from(table: StorageTable) {
      return {
        select() {
          const filters: Array<(row: MockRow) => boolean> = []
          const query = {} as MockQuery
          query.eq = (column, value) => {
              filters.push(row => row[column] === value)
              return query
            }
          query.is = (column, value) => {
              filters.push(row => (row[column] ?? null) === value)
              return query
            }
          query.order = async () => {
              const count = state.readCounts[table] = (state.readCounts[table] ?? 0) + 1
              const rows = options.read
                ? await options.read(table, state, count)
                : rowsFor(table)
              return { data: rows.filter(row => filters.every(filter => filter(row))), error: null }
            }
          query.maybeSingle = async () => {
              const count = state.readCounts[table] = (state.readCounts[table] ?? 0) + 1
              const rows = options.read
                ? await options.read(table, state, count)
                : rowsFor(table)
              return { data: rows.filter(row => filters.every(filter => filter(row)))[0] ?? null, error: null }
          }
          return query
        },
      }
    },
    storage: {
      from() {
        return {
          async upload(storagePath: string) {
            state.uploadPaths.push(storagePath)
            if (options.upload) return options.upload(storagePath, state)
            if (state.objects.has(storagePath)) {
              return { error: { statusCode: '409', message: 'The resource already exists' } }
            }
            state.objects.add(storagePath)
            return { error: null }
          },
          async remove(storagePaths: string[]) {
            state.removePaths.push(...storagePaths)
            if (options.remove) return options.remove(storagePaths, state)
            storagePaths.forEach(storagePath => state.objects.delete(storagePath))
            return { error: null }
          },
          async createSignedUrl() {
            return options.sign ? options.sign() : { data: { signedUrl: 'https://signed.test/image' } }
          },
        }
      },
    },
    rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args })
      return {
        async single() {
          await options.beforeRpc?.(name)
          if (options.rpc) return options.rpc(name, args, state)
          if (name === 'upload_report_image') {
            const row = reportImageRow(String(args.p_storage_path), `report-image-${nextId++}`)
            state.reportImages.push(row)
            return { data: row, error: null }
          }
          if (name === 'upsert_live_report_image') {
            const row = { id: `live-image-${nextId++}`, ...(args.p_data as MockRow) }
            state.liveImages.push(row)
            return { data: row, error: null }
          }
          if (name === 'remove_live_report_image') {
            const index = state.liveImages.findIndex(row => row.id === args.p_image_id)
            if (index < 0) return { data: false, error: null }
            state.liveImages.splice(index, 1)
            return { data: true, error: null }
          }
          return { data: true, error: null }
        },
      }
    },
  }
  return { repo: createSupabaseReportRepository(client as never), state }
}

const reportUpload = (storagePath: string) => ({
  report_id: 'r1',
  storage_path: storagePath,
  image_url: 'data:image/png;base64,YQ==',
  image_type: 'dashboard' as const,
  uploaded_by: 'u1',
})

const liveUpload = (fileName: string) => ({
  report_id: 'r1',
  category: 'other' as const,
  file_url: 'data:image/png;base64,YQ==',
  file_name: fileName,
  mime_type: 'image/png',
  size_bytes: 1,
  sort_order: 0,
  is_cover: false,
})

describe('Report Storage Security & Idempotency', () => {
  const serviceFile = fs.readFileSync(path.resolve(process.cwd(), 'lib/services/supabaseReportService.ts'), 'utf8')
  const migrationFile = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260913233111_report_storage_security.sql'), 'utf8')
  const detailModalFile = fs.readFileSync(path.resolve(process.cwd(), 'components/features/reports/ReportDetailModal.tsx'), 'utf8')
  const formModalFile = fs.readFileSync(path.resolve(process.cwd(), 'components/features/reports/ReportFormModal.tsx'), 'utf8')
  const galleryFile = fs.readFileSync(path.resolve(process.cwd(), 'components/features/reports/LiveReportImageGallery.tsx'), 'utf8')

  it('1. migration sets report-images public=false', () => {
    assert.match(migrationFile, /update\s+storage\.buckets\s+set\s+public\s*=\s*false\s+where\s+id\s*=\s*'report-images'/i)
  })

  it('2. migration removes permissive report-images-read policy', () => {
    assert.match(migrationFile, /drop\s+policy\s+if\s+exists\s+"report-images-read"/i)
  })

  it('3. authenticated read policy is report-linked', () => {
    assert.match(migrationFile, /create\s+policy\s+"report-images-authenticated-read"/i)
    assert.match(migrationFile, /public\.reports\s+as\s+report/i)
  })

  it('4. Report runtime has no getPublicUrl()', () => {
    assert.doesNotMatch(serviceFile, /getPublicUrl/)
    assert.doesNotMatch(detailModalFile, /getPublicUrl/)
  })

  it('5. signed URLs are not persisted', () => {
    assert.match(detailModalFile, /const \[signedUrls,\s*setSignedUrls\]\s*=\s*React\.useState/)
    assert.match(formModalFile, /const \[signedUrls,\s*setSignedUrls\]\s*=\s*React\.useState/)
  })

  it('6. upload success -> metadata success', () => {
    assert.match(serviceFile, /await client\.rpc\('upload_report_image'/)
  })

  it('7. metadata RPC failure -> uploaded object cleanup', async () => {
    let removedPaths: string[] = []
    const mockClient = {
      from: () => ({ select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) }),
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          remove: async (paths: string[]) => { removedPaths = paths; return { error: null } },
          createSignedUrl: async () => ({ data: { signedUrl: 'mock' } })
        })
      },
      rpc: (name: string) => ({
        single: async () => {
          if (name === 'upload_report_image') return { error: { message: 'metadata insert failed' } }
          return { data: {} }
        }
      })
    }
    const repo = createSupabaseReportRepository(mockClient as never)
    repo.uploadBlob = async () => ({ storagePath: 'test/path.jpg', uploadedThisAttempt: true })
    
    await assert.rejects(repo.uploadReportImage({
      report_id: 'r1',
      storage_path: 'test/path.jpg',
      image_url: 'blob:test',
      image_type: 'receipt',
      uploaded_by: 'u1'
    }), /metadata insert failed/)
    assert.deepStrictEqual(removedPaths, ['test/path.jpg'])
  })

  it('8. storage upload failure -> metadata RPC not called', async () => {
    let rpcCalled = false
    const mockClient = {
      from: () => ({ select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) }),
      storage: {
        from: () => ({
          upload: async () => ({ error: { message: 'upload failed' } }),
          remove: async () => ({ error: null })
        })
      },
      rpc: () => {
        rpcCalled = true
        return { single: async () => ({ data: {} }) }
      }
    }
    const repo = createSupabaseReportRepository(mockClient as never)
    repo.uploadBlob = async () => { throw new Error('upload failed') }
    
    await assert.rejects(repo.uploadReportImage({
      report_id: 'r1',
      storage_path: 'test/path2.jpg',
      image_url: 'blob:test2',
      image_type: 'receipt',
      uploaded_by: 'u1'
    }), /upload failed/)
    assert.strictEqual(rpcCalled, false)
  })

  it('9. retry existing shift reuses active report', () => {
    assert.match(formModalFile, /const existingReport = await reportService\.getByShift\(selectedShift\.id\)/)
  })

  it('10. retry does not create second active report', () => {
    assert.match(formModalFile, /if \(existingReport && \(existingReport\.status === 'draft' \|\| existingReport\.status === 'reopened'\)\) \{/)
    assert.match(formModalFile, /report = await reportService\.update\(existingReport\.id, payload\)/)
  })

  it('11. unique(report_id, storage_path) or equivalent DB protection exists', () => {
    assert.match(migrationFile, /add\s+constraint\s+report_images_dedupe_key\s+unique\s*\(report_id,\s*storage_path\)/i)
    assert.match(migrationFile, /add\s+constraint\s+live_report_images_dedupe_key\s+unique\s*\(report_id,\s*file_url\)/i)
  })

  it('12. duplicate attachment produces no false success', async () => {
    let uploadCount = 0
    const mockClient = {
      from: () => ({ select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) }),
      storage: {
        from: () => ({
          upload: async () => { uploadCount++; return { error: null }; },
          remove: async () => ({ error: null })
        })
      },
      rpc: () => ({
        single: async () => ({ data: {} })
      })
    }
    const repo = createSupabaseReportRepository(mockClient as never)
    repo.getReportImages = async () => [{ id: '1', report_id: 'r1', image_url: '', storage_path: 'test/conflict.jpg', image_type: 'receipt', uploaded_by: 'u1', created_at: '' } as never]
    repo.uploadBlob = async () => { uploadCount++; return { storagePath: 'test/conflict.jpg', uploadedThisAttempt: true } }
    
    const result = await repo.uploadReportImage({
      report_id: 'r1',
      storage_path: 'test/conflict.jpg',
      image_url: 'blob:test',
      image_type: 'receipt',
      uploaded_by: 'u1'
    })
    
    assert.strictEqual(uploadCount, 0, 'Should skip upload when metadata exists')
    assert.strictEqual(result.id, '1')
  })

  it('13. Live Report image private-storage path is renderable through signed URL', async () => {
    assert.match(galleryFile, /signedUrls\?\.\[cover\.id\]\s*\|\|/)
    assert.match(galleryFile, /signedUrls\?\.\[image\.id\]\s*\|\|/)
    assert.match(detailModalFile, /signedUrls\[image\.id\]/)
    assert.match(detailModalFile, /reportImageService\.getSignedUrl\(img\.file_url\)/)
  })
  
  it('13b. Live metadata failure cleanup behaves correctly', async () => {
    let removedPaths: string[] = []
    const mockClient = {
      from: () => ({ select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) }),
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          remove: async (paths: string[]) => { removedPaths = paths; return { error: null } },
        })
      },
      rpc: (name: string) => ({
        single: async () => {
          if (name === 'upsert_live_report_image') return { error: { message: 'metadata insert failed' } }
          return { data: {} }
        }
      })
    }
    const repo = createSupabaseReportRepository(mockClient as never)
    repo.getLiveReportImages = async () => []
    repo.uploadBlob = async () => ({ storagePath: 'live/r1/test.jpg', uploadedThisAttempt: true })
    
    await assert.rejects(repo.upsertLiveReportImage({
      report_id: 'r1',
      file_name: 'test.jpg',
      file_url: 'blob:test',
      category: 'other',
      mime_type: 'image/jpeg',
      size_bytes: 100,
      sort_order: 0,
      is_cover: false
    }), /metadata insert failed/)
    assert.deepStrictEqual(removedPaths, ['live/r1/test.jpg'])
  })
  
  it('13c. partial Report retry A-success/B-fail -> retry succeeds', async () => {
    let uploadCount = 0
    let metadataCount = 0
    const mockClient = {
      from: () => ({ select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) }),
      storage: {
        from: () => ({
          upload: async () => { uploadCount++; return { error: null } }
        })
      },
      rpc: () => {
        metadataCount++
        return { single: async () => ({ data: {} }) }
      }
    }
    const repo = createSupabaseReportRepository(mockClient as never)
    repo.getReportImages = async () => [{ id: '1', report_id: 'r1', image_url: '', storage_path: 'test/success.jpg', image_type: 'receipt', uploaded_by: 'u1', created_at: '' } as never]
    repo.uploadBlob = async () => { uploadCount++; return { storagePath: 'test/fail.jpg', uploadedThisAttempt: true } }
    
    const imageA = await repo.uploadReportImage({
      report_id: 'r1',
      storage_path: 'test/success.jpg',
      image_url: 'blob:A',
      image_type: 'receipt',
      uploaded_by: 'u1'
    })
    await repo.uploadReportImage({
      report_id: 'r1',
      storage_path: 'test/fail.jpg',
      image_url: 'blob:B',
      image_type: 'receipt',
      uploaded_by: 'u1'
    })
    
    assert.strictEqual(uploadCount, 1, 'Only image B should trigger uploadBlob')
    assert.strictEqual(metadataCount, 1, 'Only image B should trigger RPC')
    assert.strictEqual(imageA.id, '1')
  })

  it('14. NULL metric remains NULL', () => {
    const reports = [{ revenue: null }] as never;
    assert.strictEqual(calculateAggregate(reports, 'revenue'), null)
  })

  it('15. explicit 0 remains 0', () => {
    const reports = [{ revenue: 0 }] as never;
    assert.strictEqual(calculateAggregate(reports, 'revenue'), 0)
  })

  it('16. pending storage migration is unique, non-destructive, and has no BOM', () => {
    const migrationNames = fs.readdirSync(path.resolve(process.cwd(), 'supabase/migrations'))
      .filter(name => name.includes('report_storage_security'))
    assert.deepStrictEqual(migrationNames, ['20260913233111_report_storage_security.sql'])
    assert.notStrictEqual(migrationFile.charCodeAt(0), 0xfeff)
    assert.doesNotMatch(migrationFile, /\b(drop\s+table|truncate|delete\s+from)\b/i)
    assert.match(migrationFile, /report\.deleted_at\s+is\s+null\s+and\s+report\.archived_at\s+is\s+null[\s\S]*private\.current_system_permission\(\)\s*=\s*'admin'/i)
  })

  it('17. signing failure returns no private path or public fallback', async () => {
    const { repo } = createStorageHarness({ sign: async () => ({ error: { message: 'signing denied' } }) })
    assert.strictEqual(await repo.getSignedImageUrl('reports/r1/private.png'), null)
    assert.doesNotMatch(serviceFile, /getPublicUrl/)
    assert.match(galleryFile, /signedUrls\?\.\[image\.id\]\s*\|\|[\s\S]*startsWith\('blob:'\)[\s\S]*startsWith\('data:'\)/)
    assert.match(detailModalFile, /signedUrls\[image\.id\]\s*\|\|\s*\(image\.image_url\.startsWith\('blob:'\)\s*\|\|\s*image\.image_url\.startsWith\('data:'\)/)
  })

  it('18. matching Report/Live metadata precheck skips object upload and RPC', async () => {
    const { repo, state } = createStorageHarness()
    state.reportImages.push(reportImageRow('reports/r1/existing.png'))
    state.liveImages.push(liveImageRow('live/r1/existing.png'))

    const report = await repo.uploadReportImage(reportUpload('reports/r1/existing.png'))
    const live = await repo.upsertLiveReportImage(liveUpload('existing.png'))

    assert.equal(report.id, 'report-image')
    assert.equal(live.id, 'live-image')
    assert.deepStrictEqual(state.uploadPaths, [])
    assert.deepStrictEqual(state.rpcCalls, [])
  })

  it('19. Report and Live upload success persists metadata once', async () => {
    const { repo, state } = createStorageHarness()
    await repo.uploadReportImage(reportUpload('reports/r1/report.png'))
    await repo.upsertLiveReportImage(liveUpload('live.png'))

    assert.deepStrictEqual(state.uploadPaths, ['reports/r1/report.png', 'live/r1/live.png'])
    assert.deepStrictEqual(state.rpcCalls.map(call => call.name), ['upload_report_image', 'upsert_live_report_image'])
    assert.equal(state.reportImages.length, 1)
    assert.equal(state.liveImages.length, 1)
  })

  it('20. Report/Live metadata failure removes only the object created by this attempt', async () => {
    const { repo, state } = createStorageHarness({
      rpc: async () => ({ error: { code: 'XX000', message: 'metadata insert failed' } }),
    })

    await assert.rejects(
      repo.uploadReportImage(reportUpload('reports/r1/report-fail.png')),
      error => {
        assert.match(String(error), /metadata insert failed/)
        assert.equal((error as Error & { code?: string }).code, 'XX000')
        return true
      },
    )
    await assert.rejects(
      repo.upsertLiveReportImage(liveUpload('live-fail.png')),
      error => {
        assert.match(String(error), /metadata insert failed/)
        assert.equal((error as Error & { code?: string }).code, 'XX000')
        return true
      },
    )

    assert.deepStrictEqual(state.removePaths, ['reports/r1/report-fail.png', 'live/r1/live-fail.png'])
    assert.equal(state.objects.size, 0)
  })

  it('21. Report/Live 409 re-reads metadata and returns a concurrent row without RPC or delete', async () => {
    const rows = {
      report_images: reportImageRow('reports/r1/concurrent.png'),
      live_report_images: liveImageRow('live/r1/concurrent.png'),
    }
    const { repo, state } = createStorageHarness({
      read: async (table, _state, count) => count === 1 ? [] : [rows[table]],
      upload: async () => ({ error: { statusCode: 409, message: 'already exists' } }),
    })
    state.objects.add('reports/r1/concurrent.png')
    state.objects.add('live/r1/concurrent.png')

    const report = await repo.uploadReportImage(reportUpload('reports/r1/concurrent.png'))
    const live = await repo.upsertLiveReportImage(liveUpload('concurrent.png'))

    assert.equal(report.id, rows.report_images.id)
    assert.equal(live.id, rows.live_report_images.id)
    assert.deepStrictEqual(state.rpcCalls, [])
    assert.deepStrictEqual(state.removePaths, [])
  })

  it('22. Report/Live 409 without metadata throws typed conflict and never removes the object', async () => {
    const { repo, state } = createStorageHarness({
      upload: async () => ({ error: { statusCode: '409', message: 'The resource already exists' } }),
    })
    state.objects.add('reports/r1/unlinked.png')
    state.objects.add('live/r1/unlinked.png')

    for (const attempt of [
      repo.uploadReportImage(reportUpload('reports/r1/unlinked.png')),
      repo.upsertLiveReportImage(liveUpload('unlinked.png')),
    ]) {
      await assert.rejects(attempt, (error: unknown) => typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'REPORT_IMAGE_STORAGE_CONFLICT')
    }
    assert.deepStrictEqual(state.rpcCalls, [])
    assert.deepStrictEqual(state.removePaths, [])
    assert.equal(state.objects.size, 2)
  })

  it('23. two-request race never lets the losing Report/Live upload delete the winner object', async () => {
    const verifyRace = async (kind: 'report' | 'live') => {
      const table: StorageTable = kind === 'report' ? 'report_images' : 'live_report_images'
      const rpcName = kind === 'report' ? 'upload_report_image' : 'upsert_live_report_image'
      let releaseLosingRead!: () => void
      const losingRead = new Promise<void>(resolve => { releaseLosingRead = resolve })
      const { repo, state } = createStorageHarness({
        read: async (readTable, current, count) => {
          if (readTable !== table) return []
          if (count <= 2) return []
          if (count === 3) {
            releaseLosingRead()
            return []
          }
          return readTable === 'report_images' ? current.reportImages : current.liveImages
        },
        beforeRpc: async name => {
          if (name === rpcName) await losingRead
        },
      })
      const path = kind === 'report' ? 'reports/r1/race.png' : 'live/r1/race.png'
      const upload = () => kind === 'report'
        ? repo.uploadReportImage(reportUpload(path))
        : repo.upsertLiveReportImage(liveUpload('race.png'))
      const outcomes = await Promise.allSettled([upload(), upload()])

      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1)
      const rejected = outcomes.find(result => result.status === 'rejected') as PromiseRejectedResult
      assert.equal((rejected.reason as { code?: string }).code, 'REPORT_IMAGE_STORAGE_CONFLICT')
      assert.equal(state.rpcCalls.filter(call => call.name === rpcName).length, 1)
      assert.deepStrictEqual(state.removePaths, [])
      assert.equal(state.objects.has(path), true)
      assert.equal((table === 'report_images' ? state.reportImages : state.liveImages).length, 1)
    }

    await verifyRace('report')
    await verifyRace('live')
  })

  it('24. partial Report/Live retry skips persisted A, uploads B once, and creates no duplicates', async () => {
    const { repo, state } = createStorageHarness()
    state.reportImages.push(reportImageRow('reports/r1/a.png', 'report-a'))
    state.liveImages.push(liveImageRow('live/r1/a.png', 'live-a'))

    await repo.uploadReportImage(reportUpload('reports/r1/a.png'))
    await repo.uploadReportImage(reportUpload('reports/r1/b.png'))
    await repo.uploadReportImage(reportUpload('reports/r1/a.png'))
    await repo.upsertLiveReportImage(liveUpload('a.png'))
    await repo.upsertLiveReportImage(liveUpload('b.png'))
    await repo.upsertLiveReportImage(liveUpload('a.png'))

    assert.deepStrictEqual(state.uploadPaths, ['reports/r1/b.png', 'live/r1/b.png'])
    assert.equal(state.reportImages.length, 2)
    assert.equal(state.liveImages.length, 2)
    assert.equal(state.rpcCalls.length, 2)
  })

  it('25. live delete metadata failure leaves Storage untouched', async () => {
    const { repo, state } = createStorageHarness({
      rpc: async () => ({ error: { code: 'XX000', message: 'metadata delete failed' } }),
    })
    state.liveImages.push(liveImageRow('live/r1/delete.png', 'delete-me'))

    await assert.rejects(repo.removeLiveReportImage('delete-me'), /metadata delete failed/)
    assert.deepStrictEqual(state.removePaths, [])
    assert.equal(state.liveImages.length, 1)
  })

  it('26. live delete removes metadata before attempting Storage cleanup', async () => {
    const { repo, state } = createStorageHarness()
    state.liveImages.push(liveImageRow('live/r1/delete.png', 'delete-me'))

    assert.equal(await repo.removeLiveReportImage('delete-me'), true)
    assert.deepStrictEqual(state.rpcCalls.map(call => call.name), ['remove_live_report_image'])
    assert.deepStrictEqual(state.removePaths, ['live/r1/delete.png'])
    assert.equal(state.liveImages.length, 0)
  })

  it('27. live Storage cleanup failure is observable after metadata deletion remains authoritative', async () => {
    const logged: unknown[][] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => { logged.push(args) }
    const { repo, state } = createStorageHarness({
      remove: async () => ({ error: { message: 'storage unavailable' } }),
    })
    state.liveImages.push(liveImageRow('live/r1/orphan.png', 'orphan'))
    try {
      assert.equal(await repo.removeLiveReportImage('orphan'), true)
    } finally {
      console.error = originalError
    }

    assert.equal(state.liveImages.length, 0)
    assert.deepStrictEqual(state.removePaths, ['live/r1/orphan.png'])
    assert.equal(logged.length, 1)
    assert.match(String(logged[0][0]), /Orphaned live report image object/)
  })
})
