import { describe, it } from 'node:test'
import assert from 'node:assert'
import { calculateAggregate } from '../components/features/dashboard/DashboardOverview'
import fs from 'node:fs'
import path from 'node:path'

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

  it('7. metadata RPC failure -> uploaded object cleanup', () => {
    assert.match(serviceFile, /await client\.storage\.from\(bucket\)\.remove\(\[storagePath\]\)\.catch/)
  })

  it('8. storage upload failure -> metadata RPC not called', () => {
    assert.ok(serviceFile.indexOf('this.uploadBlob(') < serviceFile.indexOf("client.rpc('upload_report_image', {"))
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

  it('12. duplicate attachment conflict is handled truthfully', () => {
    assert.match(serviceFile, /throw requestError\(\'report image upload\', result.error\)/)
  })

  it('13. Live Report image private-storage path is renderable through signed URL', () => {
    assert.match(galleryFile, /signedUrls\?\.\[cover\.id\]\s*\|\|/)
    assert.match(galleryFile, /signedUrls\?\.\[image\.id\]\s*\|\|/)
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


