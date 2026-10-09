import assert from 'node:assert/strict'
import test from 'node:test'
import type { Brand, Platform, ScheduleImportRow } from '@/lib/types/database.types'
import type { ImportPreviewRow } from '@/lib/utils/excelUtils'
import { planScheduleImportArchive, persistScheduleArchive } from '@/lib/utils/scheduleImportArchive'

const brands = [
  { id: 'brand-a', name: 'Alpha Beauty' },
  { id: 'brand-b', name: 'Beta Snacks' },
] as Brand[]
const platforms = [
  { id: 'platform-a', name: 'TikTok Shop' },
  { id: 'platform-b', name: 'Shopee Live' },
] as Platform[]

function preview(number: number, brand: string, platform: string, date = '2026-10-09', source = 'internal'): ImportPreviewRow {
  return { row: {
    row_number: number, brand_name: brand, platform_name: platform, date,
    start_time: '09:00', end_time: '11:00',
    execution_source: source, title: 'Live shift ' + number,
    required_host_count: 1, required_support_count: 1, required_technical_count: 1,
    notes: 'Only this brand should receive the row',
    errors: [], warnings: [],
  } as ScheduleImportRow }
}

const original = () => new File(['original excel bytes'], 'All_Brands.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})

test('multi-brand schedules are partitioned and never store a shared original in a brand folder', async () => {
  const plan = planScheduleImportArchive({
    batchId: 'batch-1',
    previews: [preview(2, 'Alpha Beauty', 'Shopee Live'), preview(3, 'Beta Snacks', 'Shopee Live')],
    brands, platforms, sourceFile: original(), sourceType: 'excel', maxFileBytes: 1024 * 1024,
  })
  assert.equal(plan.originalSourceArchived, false)
  assert.equal(plan.files.length, 2)
  assert.deepEqual(plan.unresolvedRowNumbers, [])
  const seen = new Set()
  for (const item of plan.files) {
    assert.equal(item.kind, 'normalized_preview')
    assert.equal(item.file.type, 'application/json')
    const json = JSON.parse(await item.file.text()) as {
      rows: Array<{ row_number: number; brand_name: string }>;
      brand_id: string; platform_id: string
    }
    assert.equal(json.brand_id, item.scope.brand_id)
    assert.equal(json.platform_id, item.scope.platform_id)
    assert.equal(json.rows.length, 1)
    assert.equal(json.rows[0].brand_name, item.scope.brand_id === 'brand-a' ? 'Alpha Beauty' : 'Beta Snacks')
    seen.add(json.brand_id)
  }
  assert.deepEqual([...seen].sort(), ['brand-a', 'brand-b'])
})

test('single-brand reviewed schedule preserves original Excel as a separate artifact', async () => {
  const plan = planScheduleImportArchive({
    batchId: 'batch-2',
    previews: [preview(2, 'Alpha Beauty', 'TikTok Shop'), preview(3, 'Alpha Beauty', 'TikTok Shop', '2026-10-10')],
    brands, platforms, sourceType: 'excel', sourceFile: original(), maxFileBytes: 1024 * 1024,
  })
  assert.equal(plan.files.length, 2)
  assert.equal(plan.originalSourceArchived, true)
  assert.ok(plan.files.some(item => item.kind === 'original_source' && item.file.name === 'All_Brands.xlsx'))
  assert.ok(plan.files.every(item => item.scope.brand_id === 'brand-a'))
})

test('ambiguous or unknown brand rows are not archived into any arbitrary brand', async () => {
  const plan = planScheduleImportArchive({
    batchId: 'batch-3',
    previews: [preview(2, 'Alpha Beauty', 'TikTok Shop'), preview(3, 'Unknown Brand', 'TikTok Shop')],
    brands, platforms, sourceType: 'excel', sourceFile: original(), maxFileBytes: 1024 * 1024,
  })
  assert.deepEqual(plan.unresolvedRowNumbers, [3])
  assert.equal(plan.files.length, 1)
  assert.equal(plan.originalSourceArchived, false)
  const json = JSON.parse(await plan.files[0].file.text()) as { rows: Array<{ row_number: number }> }
  assert.deepEqual(json.rows.map(row => row.row_number), [2])
})

test('different execution sources and months use distinct archive scopes', () => {
  const plan = planScheduleImportArchive({
    batchId: 'batch-4',
    previews: [
      preview(2, 'Alpha Beauty', 'Shopee Live', '2026-10-30', 'internal'),
      preview(3, 'Alpha Beauty', 'Shopee Live', '2026-11-01', 'internal'),
      preview(4, 'Alpha Beauty', 'Shopee Live', '2026-10-31', 'agency'),
    ],
    brands, platforms, sourceType: 'google_sheets', maxFileBytes: 1024 * 1024,
  })
  assert.equal(plan.files.length, 3)
  assert.equal(plan.originalSourceArchived, false)
  assert.equal(new Set(plan.files.map(item => [item.scope.period_date.slice(0, 7), item.scope.execution_source].join(':'))).size, 3)
})

test('archive persistence enforces provider response and safely retries same scope artifacts', async () => {
  const plan = planScheduleImportArchive({
    batchId: 'batch-5', previews: [preview(2, 'Alpha Beauty', 'Shopee Live')],
    brands, platforms, sourceType: 'google_sheets', maxFileBytes: 1024 * 1024,
  })
  const sent: Array<{ category: unknown; brand: unknown; file: File | null }> = []
  const send = async (body: FormData): Promise<Response> => {
    sent.push({
      category: body.get('category'), brand: body.get('brand_id'),
      file: body.get('file') as File | null,
    })
    return Response.json({ ok: true, reused: sent.length > 1 })
  }
  const first = await persistScheduleArchive(plan, send)
  const second = await persistScheduleArchive(plan, send)
  assert.deepEqual(first, { archived: 1, reused: 0, unresolved: 0, originalSourceArchived: false })
  assert.equal(second.reused, 1)
  assert.equal(sent[0].category, 'schedule_source')
  assert.equal(sent[0].brand, 'brand-a')
  assert.equal(sent[0].file?.type, 'application/json')

  await assert.rejects(() => persistScheduleArchive(plan, async () =>
    Response.json({ ok: false, error: { code: 'STORAGE_ROUTE_NOT_CONFIGURED' } }, { status: 409 }),
  ), /STORAGE_ROUTE_NOT_CONFIGURED/u)
})
