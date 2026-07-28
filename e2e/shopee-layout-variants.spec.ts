import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

type ExpectedMetrics = Record<string, number>

type RegionDiagnostics = {
  original_dimensions: { width: number; height: number }
  platform_candidates: Array<{
    platform: string
    anchor_count: number
    confidence: number
  }>
  dashboard_candidates: Array<{
    id: string
    platform: string
    bounding_box: { x: number; y: number; width: number; height: number }
    confidence: number
    anchor_count: number
    anchors: string[]
    area_ratio: number
    aspect_ratio: number
    ocr_readability: number
    source_method: string
    perspective_correction_applied: boolean
  }>
  selected_candidate_id?: string
  selected_roi?: { left: number; top: number; width: number; height: number }
  normalized_roi_dimensions?: { width: number; height: number }
  perspective_correction_applied: boolean
  selection_reason: string
  fallback_usage?: string
}

type FixtureCase = {
  name: string
  fileName: string
  sha256: string
  dimensions: { width: number; height: number }
  expected: ExpectedMetrics
  expectedTransformations: readonly Transformation[]
  expectMultipleCandidates: boolean
}

type Transformation = 'similarity' | 'affine' | 'homography/perspective' | 'none'

const fixtureDirectory = path.join(
  process.cwd(),
  'e2e',
  'fixtures',
  'ocr',
  'shopee-layout-variants',
)

const fixtureCases: FixtureCase[] = [
  {
    name: 'camera perspective',
    fileName: 'shopee-camera-perspective.jpg',
    sha256: '92A0CE6E6FF5A55EBD633E78353987F1237F1FEDCF14A2A767E032F1040D2D3D',
    dimensions: { width: 2560, height: 1184 },
    expectedTransformations: ['homography/perspective', 'affine', 'similarity', 'none'],
    expectMultipleCandidates: false,
    expected: {
      sales: 13416434,
      engaged_viewers: 87,
      comments: 4,
      add_to_cart: 251,
      total_views: 2345,
      average_view_duration_seconds: 36,
      comment_rate: 0.2,
      gpm: 5721293.82,
      orders: 67,
      average_basket_size: 200245.28,
      total_viewers: 1164,
      pcu: 9,
      ctr: 14.9,
      click_to_order_rate: 19.1,
      buyers: 60,
      items_sold: 94,
    },
  },
  {
    name: 'fullscreen layout',
    fileName: 'shopee-fullscreen-layout.jpg',
    sha256: '7D117DEA42AB286EC8BAFE4AADF817FCE0DB7F7C780E7BD8D928796FF89FA344',
    dimensions: { width: 1920, height: 1080 },
    expectedTransformations: ['similarity', 'affine', 'none'],
    expectMultipleCandidates: false,
    expected: {
      sales: 18523744,
      engaged_viewers: 115,
      comments: 30,
      add_to_cart: 381,
      total_views: 1602,
      average_view_duration_seconds: 67,
      comment_rate: 1.9,
      gpm: 11562886.39,
      orders: 95,
      average_basket_size: 194986.78,
      total_viewers: 919,
      pcu: 15,
      ctr: 43.8,
      click_to_order_rate: 13.5,
      buyers: 83,
      items_sold: 118,
    },
  },
  {
    name: 'cropped layout',
    fileName: 'shopee-cropped-layout.jpg',
    sha256: 'B04BC29D7053956A6F79D45239B84C625ACB6193D742F448123590746E68782B',
    dimensions: { width: 1919, height: 1079 },
    expectedTransformations: ['similarity', 'affine', 'none'],
    expectMultipleCandidates: false,
    expected: {
      sales: 7905227,
      engaged_viewers: 74,
      comments: 3,
      add_to_cart: 180,
      total_views: 2079,
      average_view_duration_seconds: 47,
      comment_rate: 0.1,
      gpm: 3802417.99,
      orders: 37,
      average_basket_size: 213654.78,
      total_viewers: 1168,
      pcu: 11,
      ctr: 15.5,
      click_to_order_rate: 11.5,
      buyers: 33,
      items_sold: 47,
    },
  },
  {
    name: 'composite layout',
    fileName: 'shopee-composite-layout.jpg',
    sha256: 'DEE0C8D4653D4A0547C9DC7232658E688F48CDF45697427A25587D43EA7A6187',
    dimensions: { width: 3000, height: 1920 },
    expectedTransformations: ['similarity', 'affine', 'none'],
    expectMultipleCandidates: true,
    expected: {
      sales: 12072516,
      engaged_viewers: 103,
      comments: 29,
      add_to_cart: 114,
      total_views: 2387,
      average_view_duration_seconds: 39,
      comment_rate: 1.2,
      gpm: 5057610.39,
      orders: 22,
      average_basket_size: 548750.73,
      total_viewers: 1319,
      pcu: 9,
      ctr: 9.5,
      click_to_order_rate: 9.7,
      buyers: 21,
      items_sold: 76,
    },
  },
]

for (const fixture of fixtureCases) {
  test(`Shopee ${fixture.name} selects one dashboard and maps exact KPI values`, async ({ page }) => {
    test.setTimeout(240_000)
    const fixturePath = path.join(fixtureDirectory, fixture.fileName)
    await expectFixtureIntegrity(fixturePath, fixture.sha256)
    await openFinalReport(page)
    await page.getByTestId('report-dashboard-image-upload').setInputFiles(fixturePath)
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
    await page.getByTestId('report-run-ocr-button').click()
    await waitForOcrCompletion(page.getByTestId('report-ocr-completion-status'))

    const diagnostics = await readRegionDiagnostics(page)
    console.info(JSON.stringify({
      fixture: fixture.fileName,
      initial_region_diagnostics: diagnostics,
    }, null, 2))
    expect(diagnostics.original_dimensions).toEqual(fixture.dimensions)
    expect.soft(
      diagnostics.platform_candidates.some(candidate => candidate.platform === 'shopee_live'),
      JSON.stringify(diagnostics, null, 2),
    ).toBe(true)
    expect.soft(diagnostics.dashboard_candidates.length).toBeGreaterThan(0)
    expect.soft(diagnostics.selected_candidate_id).toBeTruthy()
    expect.soft(diagnostics.selected_roi).toBeDefined()
    if (diagnostics.selected_roi) expectNormalizedRoi(diagnostics.selected_roi)
    expect.soft(diagnostics.normalized_roi_dimensions?.width).toBeGreaterThan(0)
    expect.soft(diagnostics.normalized_roi_dimensions?.height).toBeGreaterThan(0)

    const selected = diagnostics.dashboard_candidates.find(
      candidate => candidate.id === diagnostics.selected_candidate_id,
    )
    expect.soft(selected, JSON.stringify(diagnostics, null, 2)).toBeDefined()
    expect.soft(selected?.platform).toBe('shopee_live')
    expect.soft(selected?.confidence).toBeGreaterThanOrEqual(0.6)
    expect.soft(selected?.anchor_count).toBeGreaterThanOrEqual(0)
    if (selected) expect.soft(fixture.expectedTransformations).toContain(transformationOf(selected))

    if (fixture.expectMultipleCandidates) {
      expect.soft(diagnostics.dashboard_candidates.length).toBeGreaterThan(1)
      const largestArea = Math.max(...diagnostics.dashboard_candidates.map(candidate => candidate.area_ratio))
      expect.soft(selected?.area_ratio).toBe(largestArea)
    }

    await expect(page.getByTestId('ocr-metric-filter-all')).toBeVisible()
    await page.getByTestId('ocr-metric-filter-all').click()
    const actual = await readRenderedMetrics(page, Object.keys(fixture.expected))
    const statuses = await readMetricStatuses(page, Object.keys(fixture.expected))
    const correctedText = await page.getByTestId('report-ocr-corrected-text').inputValue()
    const candidateDiagnostics = await readCandidateDiagnostics(page)
    const rawDiagnosticText = await readRawDiagnostics(page)
    const reviewRequired = Object.entries(statuses)
      .filter(([, status]) => status === 'review_required' || status === 'low_confidence')
      .map(([key]) => key)
    const incorrect = Object.entries(fixture.expected).flatMap(([key, expected]) =>
      actual[key] === String(expected)
        ? []
        : [{ key, expected: String(expected), actual: actual[key] }],
    )

    console.info(JSON.stringify({
      fixture: fixture.fileName,
      selected_roi: diagnostics.selected_roi,
      selected_candidate_score: selected?.confidence,
      transformation: selected ? transformationOf(selected) : 'none',
      normalized_roi_dimensions: diagnostics.normalized_roi_dimensions,
      candidate_count: diagnostics.dashboard_candidates.length,
      review_required: reviewRequired,
      incorrect,
      actual,
      corrected_text: correctedText,
      selected_metric_diagnostics: candidateDiagnostics.filter(row =>
        Object.keys(fixture.expected).includes(row[0] || ''),
      ),
      raw_diagnostic_length: rawDiagnosticText.length,
    }, null, 2))

    expect(incorrect, `Exact pixel OCR output:\n${JSON.stringify(actual, null, 2)}`).toEqual([])
    expectCrossDashboardIsolation(fixture, actual)
  })
}

async function openFinalReport(page: Page) {
  await expect.poll(async () => {
    const response = await page.goto('/reports', { waitUntil: 'domcontentloaded' })
    return response?.status()
  }, {
    timeout: 30_000,
    intervals: [500, 1_000, 2_000],
  }).toBe(200)
  await expect(page.getByTestId('open-final-report-modal')).toBeVisible()
  await page.getByTestId('open-final-report-modal').click()
  await expect(page.getByTestId('report-platform-selector')).toContainText('Shopee Live')
}

async function waitForOcrCompletion(status: Locator) {
  await expect(status).toBeVisible()
  await expect.poll(
    () => status.getAttribute('data-ocr-status'),
    { timeout: 180_000, message: 'OCR did not reach review_required state' },
  ).toBe('review_required')
}

async function readRegionDiagnostics(page: Page) {
  const details = page.getByTestId('ocr-region-diagnostics')
  await expect(details).toBeVisible()
  const raw = await details.locator('pre').textContent()
  expect(raw).toBeTruthy()
  return JSON.parse(raw!) as RegionDiagnostics
}

async function readRenderedMetrics(page: Page, keys: string[]) {
  const inputs = page.getByTestId('ocr-main-metrics').locator('input[data-testid^="ocr-metric-input-"]')
  await expect(inputs).toHaveCount(keys.length)
  return Object.fromEntries(await Promise.all(keys.map(async key => [
    key,
    await page.getByTestId(`ocr-metric-input-${key}`).inputValue(),
  ])))
}

async function readMetricStatuses(page: Page, keys: string[]) {
  return Object.fromEntries(await Promise.all(keys.map(async key => [
    key,
    await page.getByTestId(`ocr-metric-${key}`).getAttribute('data-ocr-status'),
  ])))
}

async function readCandidateDiagnostics(page: Page) {
  const diagnostics = page.getByTestId('ocr-candidate-diagnostics')
  if (await diagnostics.count() === 0) return []
  return diagnostics.locator('tbody tr').evaluateAll(rows => rows.map(row =>
    Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || ''),
  ))
}

async function readRawDiagnostics(page: Page) {
  const diagnostics = page.getByTestId('report-ocr-raw-diagnostics')
  if (await diagnostics.count() === 0) return ''
  return await diagnostics.locator('pre').textContent() || ''
}

async function expectFixtureIntegrity(filePath: string, sha256: string) {
  const bytes = await readFile(filePath)
  expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(sha256)
}

function expectNormalizedRoi(roi: { left: number; top: number; width: number; height: number }) {
  expect(roi.left).toBeGreaterThanOrEqual(0)
  expect(roi.top).toBeGreaterThanOrEqual(0)
  expect(roi.width).toBeGreaterThan(0)
  expect(roi.height).toBeGreaterThan(0)
  expect(roi.left + roi.width).toBeLessThanOrEqual(1.001)
  expect(roi.top + roi.height).toBeLessThanOrEqual(1.001)
}

function transformationOf(candidate: RegionDiagnostics['dashboard_candidates'][number]): Transformation {
  if (candidate.perspective_correction_applied || candidate.source_method === 'anchor_homography') {
    return 'homography/perspective'
  }
  if (candidate.source_method === 'anchor_affine') return 'affine'
  if (candidate.source_method === 'anchor_similarity' || candidate.source_method === 'anchor_and_color') {
    return 'similarity'
  }
  return 'none'
}

function expectCrossDashboardIsolation(fixture: FixtureCase, actual: Record<string, string>) {
  if (fixture.fileName !== 'shopee-composite-layout.jpg') return
  expect(actual.engaged_viewers).not.toBe('1')
  expect(actual.comments).not.toBe('0')
  expect(actual.add_to_cart).not.toBe('0')
}
