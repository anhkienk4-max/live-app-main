import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

const expectedMetrics = {
  gmv: 8761919,
  items_sold: 103,
  current_viewers: 7,
  impressions: 91950,
  total_views: 2310,
  advertising_cost: 2110000,
  click_rate: 2.52,
  roi_gmv_max: 4.95,
  ctor: 6.26,
  average_view_duration_seconds: 40,
  new_followers: 18,
  buyers: 46,
  sku_orders: 95,
  comments: 234,
  product_clicks: 847,
  average_order_value: 165320,
  live_ctr: 36.62,
  shares: 60,
  estimated_gmv: 8980000,
} as const

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
  ambiguous: boolean
  selection_required: boolean
  selection_reason: string
}

type FixtureCase = {
  name: string
  fileName: string
  sha256: string
  dimensions: { width: number; height: number }
  source: 'real' | 'synthetic'
  expectMultipleCandidates?: boolean
}

const fixtureDirectory = path.join(
  process.cwd(),
  'e2e',
  'fixtures',
  'ocr',
  'tiktok-layout-variants',
)

const fixtures: FixtureCase[] = [
  {
    name: 'original real dashboard',
    fileName: 'tiktok-reference.jpg',
    sha256: 'A90067540A821CAF3EFCE6EA5C5EE9908D07DE4D2C1A381229B65776824E972D',
    dimensions: { width: 1748, height: 926 },
    source: 'real',
  },
  {
    name: 'scaled and shifted viewport',
    fileName: 'tiktok-scale-shift.jpg',
    sha256: 'DC20325D50AA342A249058419873877894ABA2A24F7EB0713FE3CC2FB19668D2',
    dimensions: { width: 2200, height: 1200 },
    source: 'synthetic',
  },
  {
    name: 'partial KPI crop',
    fileName: 'tiktok-partial-crop.jpg',
    sha256: '09CA2BE38C6C12297048ED56E256B7979A0570A5936EF02E91EC70CF86C252B9',
    dimensions: { width: 1100, height: 570 },
    source: 'synthetic',
  },
  {
    name: 'sidebar-width shift',
    fileName: 'tiktok-sidebar-shift.jpg',
    sha256: '88F644EEC91C53C1DDF06633C92836E8E8D18D2C1E8789A8BB5F51472BFD12CE',
    dimensions: { width: 2100, height: 1050 },
    source: 'synthetic',
  },
  {
    name: 'affine camera-like view',
    fileName: 'tiktok-affine-camera.jpg',
    sha256: 'D745CB218F1E3D8AB79B05359C712C0455EEEA0A6F548FC430CC7CCB8C7C9288',
    dimensions: { width: 2064, height: 1150 },
    source: 'synthetic',
  },
  {
    name: 'dominant composite dashboard',
    fileName: 'tiktok-composite.jpg',
    sha256: '399B86186E818379BB8CCE4FB0383473886087DC228FF63C6BE85C7D90808119',
    dimensions: { width: 2500, height: 1400 },
    source: 'synthetic',
    expectMultipleCandidates: true,
  },
]

for (const fixture of fixtures) {
  test(`TikTok ${fixture.name} selects one ROI without confirmed KPI corruption`, async ({ page }) => {
    test.setTimeout(240_000)
    const fixturePath = path.join(fixtureDirectory, fixture.fileName)
    await expectFixtureIntegrity(fixturePath, fixture.sha256)
    await openTikTokFinalReport(page)
    await page.getByTestId('report-dashboard-image-upload').setInputFiles(fixturePath)
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
    await page.getByTestId('report-run-ocr-button').click()
    await waitForOcrCompletion(page.getByTestId('report-ocr-completion-status'))

    let diagnostics = await readRegionDiagnostics(page)
    if (diagnostics.selection_required) {
      console.info(JSON.stringify({
        fixture: fixture.fileName,
        source: fixture.source,
        region_diagnostics: diagnostics,
      }, null, 2))
    }
    if (diagnostics.selection_required && fixture.expectMultipleCandidates) {
      const selectedCandidate = [...diagnostics.dashboard_candidates]
        .filter(candidate => candidate.platform === 'tiktok_shop')
        .sort((left, right) =>
          right.anchor_count - left.anchor_count
          || right.confidence - left.confidence
          || right.area_ratio - left.area_ratio,
        )[0]
      expect(selectedCandidate).toBeDefined()
      await page.getByTestId(`ocr-dashboard-region-${selectedCandidate.id}`).click({ force: true })
      await page.getByTestId('ocr-retry-selected-region').click()
      await expect(page.getByTestId('report-ocr-completion-status')).toHaveAttribute(
        'data-ocr-status',
        'processing',
      )
      await waitForOcrCompletion(page.getByTestId('report-ocr-completion-status'))
      diagnostics = await readRegionDiagnostics(page)
    }

    expect(diagnostics.original_dimensions).toEqual(fixture.dimensions)
    expect(diagnostics.platform_candidates.some(candidate =>
      candidate.platform === 'tiktok_shop',
    )).toBe(true)
    expect(diagnostics.selection_required).toBe(false)
    expect(diagnostics.selected_candidate_id).toBeTruthy()
    expect(diagnostics.selected_roi).toBeDefined()
    expect(diagnostics.normalized_roi_dimensions).toEqual({ width: 2400, height: 1200 })

    const selected = diagnostics.dashboard_candidates.find(candidate =>
      candidate.id === diagnostics.selected_candidate_id,
    )
    expect(selected, JSON.stringify(diagnostics, null, 2)).toBeDefined()
    expect(selected?.platform).toBe('tiktok_shop')
    expect(selected?.confidence).toBeGreaterThanOrEqual(.5)
    if (fixture.expectMultipleCandidates) {
      expect(diagnostics.dashboard_candidates.length).toBeGreaterThan(1)
      const samePlatformCandidates = diagnostics.dashboard_candidates.filter(candidate =>
        candidate.platform === 'tiktok_shop',
      )
      expect(samePlatformCandidates.length).toBeGreaterThan(1)
    }

    await page.getByTestId('ocr-metric-filter-all').click()
    const actual = await readRenderedMetrics(page)
    const statuses = await readMetricStatuses(page)
    const candidateDiagnostics = await readCandidateDiagnostics(page)
    const rawDiagnostics = await page.getByTestId('report-ocr-raw-diagnostics')
      .locator('pre')
      .textContent()
    const mismatches = Object.entries(expectedMetrics).flatMap(([key, expected]) =>
      actual[key] === String(expected)
        ? []
        : [{ key, expected: String(expected), actual: actual[key] }],
    )
    const reviewRequired = Object.entries(statuses)
      .filter(([, status]) => ['review_required', 'low_confidence'].includes(status || ''))
      .map(([key]) => key)

    console.info(JSON.stringify({
      fixture: fixture.fileName,
      source: fixture.source,
      selected_roi: diagnostics.selected_roi,
      selected_candidate: selected,
      candidate_count: diagnostics.dashboard_candidates.length,
      review_required: reviewRequired,
      mismatches,
      candidate_diagnostics: candidateDiagnostics.filter(row =>
        mismatches.some(mismatch => mismatch.key === row.canonicalKey),
      ),
      raw_diagnostics_available: Boolean(rawDiagnostics),
    }, null, 2))

    if (fixture.source === 'real') {
      expect(mismatches, JSON.stringify({ actual, diagnostics }, null, 2)).toEqual([])
    } else {
      for (const mismatch of mismatches) {
        const status = statuses[mismatch.key] || ''
        if (mismatch.actual === '') {
          expect(
            ['confirmed', 'accepted'].includes(status),
            `${mismatch.key} is unreadable and must not be confirmed`,
          ).toBe(false)
        } else {
          expect(
            ['review_required', 'low_confidence'].includes(status),
            `${mismatch.key}=${mismatch.actual} must remain review_required when it differs from the source dashboard`,
          ).toBe(true)
        }
      }
    }
    await page.getByTestId('ocr-metric-filter-data').click()
    for (const [key, value] of Object.entries(actual)) {
      if (!value) continue
      await expect(page.getByTestId(`ocr-metric-input-${key}`)).toHaveValue(value)
    }
    await page.getByTestId('ocr-metric-filter-all').click()
    expect(await readRenderedMetrics(page)).toEqual(actual)
  })
}

async function openTikTokFinalReport(page: Page) {
  await expect.poll(async () => {
    const response = await page.goto('/live', { waitUntil: 'domcontentloaded' })
    return response?.status()
  }, {
    timeout: 30_000,
    intervals: [500, 1_000, 2_000],
  }).toBe(200)
  await page.getByTestId('open-live-session-s1').click()
  await page.getByTestId('open-final-report-modal').click()
  await expect(page.getByTestId('report-platform-selector')).toContainText('TikTok Shop')
}

async function waitForOcrCompletion(status: Locator) {
  await expect(status).toBeVisible()
  await expect.poll(
    () => status.getAttribute('data-ocr-status'),
    { timeout: 180_000 },
  ).toBe('review_required')
}

async function readRegionDiagnostics(page: Page) {
  const details = page.getByTestId('ocr-region-diagnostics')
  await expect(details).toBeVisible()
  const raw = await details.locator('pre').textContent()
  expect(raw).toBeTruthy()
  return JSON.parse(raw!) as RegionDiagnostics
}

async function readRenderedMetrics(page: Page) {
  const keys = Object.keys(expectedMetrics)
  const inputs = page.getByTestId('ocr-main-metrics').locator('input[data-testid^="ocr-metric-input-"]')
  await expect(inputs).toHaveCount(keys.length)
  return Object.fromEntries(await Promise.all(keys.map(async key => [
    key,
    await page.getByTestId(`ocr-metric-input-${key}`).inputValue(),
  ])))
}

async function readMetricStatuses(page: Page) {
  return Object.fromEntries(await Promise.all(Object.keys(expectedMetrics).map(async key => [
    key,
    await page.getByTestId(`ocr-metric-${key}`).getAttribute('data-ocr-status'),
  ])))
}

async function readCandidateDiagnostics(page: Page) {
  const rows = page.getByTestId('ocr-candidate-diagnostics').locator('tbody tr')
  return Promise.all(Array.from({ length: await rows.count() }, async (_, index) => {
    const cells = rows.nth(index).locator('td')
    return {
      canonicalKey: (await cells.nth(0).textContent())?.trim() || '',
      source: (await cells.nth(1).textContent())?.trim() || '',
      rawLabel: (await cells.nth(2).textContent())?.trim() || '',
      rawValue: (await cells.nth(3).textContent())?.trim() || '',
      normalizedValue: (await cells.nth(4).textContent())?.trim() || '',
      status: (await cells.nth(6).textContent())?.trim() || '',
      discardedConflict: (await cells.nth(7).textContent())?.trim() || '',
      reason: (await cells.nth(8).textContent())?.trim() || '',
    }
  }))
}

async function expectFixtureIntegrity(filePath: string, sha256: string) {
  const bytes = await readFile(filePath)
  expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(sha256)
}
