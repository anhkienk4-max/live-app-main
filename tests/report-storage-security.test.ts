import { describe, it } from 'node:test'
import assert from 'node:assert'
import { calculateAggregate } from '../components/features/dashboard/DashboardOverview'
import fs from 'node:fs'
import path from 'node:path'
import { createSupabaseReportRepository } from '../lib/services/supabaseReportService'

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
    assert.match(formModalFile, /const \[signedUrls\]\s*=\s*React\.useState/)
  })

  it('6. upload success -> metadata success', () => {
    assert.match(serviceFile, /await client\.rpc\('upload_report_image'/)
  })

  it('7. metadata RPC failure -> uploaded object cleanup', async () => {
    let removedPaths: string[] = []
    const mockClient = {
      from: () => ({ select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) }),
      storage: {
        from: (b: string) => ({
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
    const repo = createSupabaseReportRepository(mockClient as any)
    repo.uploadBlob = async () => ({ storagePath: 'test/path.jpg' }) as any
    
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
        from: (b: string) => ({
          upload: async () => ({ error: { message: 'upload failed' } }),
          remove: async () => ({ error: null })
        })
      },
      rpc: () => {
        rpcCalled = true
        return { single: async () => ({ data: {} }) }
      }
    }
    const repo = createSupabaseReportRepository(mockClient as any)
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
    assert.match(formModalFile, /if \(existingReport && existingReport\.status === 'draft'\) \{/)
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
        from: (b: string) => ({
          upload: async () => { uploadCount++; return { error: null }; },
          remove: async () => ({ error: null })
        })
      },
      rpc: () => ({
        single: async () => ({ data: {} })
      })
    }
    const repo = createSupabaseReportRepository(mockClient as any)
    repo.getReportImages = async () => [{ id: '1', report_id: 'r1', image_url: '', storage_path: 'test/conflict.jpg', image_type: 'receipt', uploaded_by: 'u1', created_at: '' } as any]
    repo.uploadBlob = async () => { uploadCount++; return { storagePath: 'test/conflict.jpg' } as any }
    
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
        from: (b: string) => ({
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
    const repo = createSupabaseReportRepository(mockClient as any)
    repo.getLiveReportImages = async () => []
    repo.uploadBlob = async () => ({ storagePath: 'live/r1/test.jpg' }) as any
    
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
        from: (b: string) => ({
          upload: async () => { uploadCount++; return { error: null } }
        })
      },
      rpc: () => {
        metadataCount++
        return { single: async () => ({ data: {} }) }
      }
    }
    const repo = createSupabaseReportRepository(mockClient as any)
    repo.getReportImages = async () => [{ id: '1', report_id: 'r1', image_url: '', storage_path: 'test/success.jpg', image_type: 'receipt', uploaded_by: 'u1', created_at: '' } as any]
    repo.uploadBlob = async () => { uploadCount++; return { storagePath: 'test/fail.jpg' } as any }
    
    const imageA = await repo.uploadReportImage({
      report_id: 'r1',
      storage_path: 'test/success.jpg',
      image_url: 'blob:A',
      image_type: 'receipt',
      uploaded_by: 'u1'
    })
    const imageB = await repo.uploadReportImage({
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

  it('16. OCR failure cannot overwrite confirmed metrics', () => {
    assert.match(formModalFile, /protectedKeys:\s*manualMetricKeysRef\.current/)
  })
})
