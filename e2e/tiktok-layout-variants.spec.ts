import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({
  viewport: { width: 1366, height: 768 },
  deviceScaleFactor: 1,
})

const referenceExpectedMetrics = {
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
    layout_family?: string
  }>
  selected_candidate_id?: string
  selected_roi?: { left: number; top: number; width: number; height: number }
  normalized_roi_dimensions?: { width: number; height: number }
  perspective_correction_applied: boolean
  ambiguous: boolean
  selection_required: boolean
  selection_reason: string
}

type OcrDiagnosticDownload = {
  schema_version: '1'
  runtime?: {
    runtime_id: string
    browser: {
      name: string
      version: string
      operating_system: string
      device_pixel_ratio: number
      viewport: { width: number; height: number }
    }
    image: {
      decoded_width: number
      decoded_height: number
      canvas_width: number
      canvas_height: number
    }
    tesseract: {
      package_version: string
      core_version: string
      language: string
      language_data_version: string
      language_data_source: string
      worker_path: string
      core_path: string
      cache_method: string
    }
    preprocessing_pipeline: string[]
    selected_roi?: RegionDiagnostics['selected_roi']
    normalized_roi_dimensions?: { width: number; height: number }
  }
  raw_ocr_text: string
  words: unknown[]
  card_diagnostics: Record<string, unknown[]>
  candidates: Array<{
    canonical_key: string
    metric: {
      value: string | number
      raw_value?: string
      strategy?: string
      preprocessing_pass?: string
      evidence_source_family?: string
      evidence_group?: string
      status?: string
      rejection_reason?: string
      strategy_candidates?: Array<{
        raw_text: string
        value_candidate: string | number
        strategy: string
        preprocessing_pass?: string
        evidence_source_family?: string
        evidence_group?: string
        rejection_reason?: string
      }>
    }
  }>
}

type FixtureCase = {
  name: string
  fileName: string
  sha256: string
  dimensions: { width: number; height: number }
  source: 'real' | 'synthetic' | 'diagnostic'
  expected?: Record<string, number>
  expectMultipleCandidates?: boolean
  minimumExactMetrics?: number
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
    expected: referenceExpectedMetrics,
  },
  {
    name: 'independent real dashboard',
    fileName: 'tiktok-real-2026-07-10.png',
    sha256: 'B509434B7B33108C0B0B1B69075C31D647A9DA8122CC6EA9F99A8CA37D45472E',
    dimensions: { width: 1399, height: 942 },
    source: 'real',
    expected: {
      gmv: 12203520,
      items_sold: 128,
      current_viewers: 1230,
      impressions: 88740,
      total_views: 1680,
      advertising_cost: 2340000,
      click_rate: 1.89,
      roi_gmv_max: 6.49,
      ctor: 9.65,
      average_view_duration_seconds: 39,
      new_followers: 8,
      buyers: 54,
      sku_orders: 120,
      comments: 46,
      product_clicks: 850,
      average_order_value: 148820,
      live_ctr: 50.72,
      shares: 10,
      estimated_gmv: 10610000,
    },
  },
  {
    name: 'June 26 evening real dashboard',
    fileName: 'tiktok-real-2026-06-26-evening.png',
    sha256: '4370D08FAFFBEDC43390C96D8E3ED4570E2DDC310444717325082094F2C210DB',
    dimensions: { width: 1393, height: 920 },
    source: 'diagnostic',
    minimumExactMetrics: 18,
    expected: {
      gmv: 13566119,
      items_sold: 140,
      current_viewers: 1820,
      impressions: 119520,
      total_views: 2410,
      advertising_cost: 3060000,
      click_rate: 2.02,
      roi_gmv_max: 5.23,
      ctor: 7.48,
      average_view_duration_seconds: 39,
      new_followers: 13,
      buyers: 62,
      sku_orders: 124,
      comments: 114,
      product_clicks: 1030,
      average_order_value: 176180,
      live_ctr: 42.74,
      shares: 8,
      estimated_gmv: 12130000,
    },
  },
  {
    name: 'June 26 morning real dashboard',
    fileName: 'tiktok-real-2026-06-26-morning.png',
    sha256: '1A2B2E4D268379B22B59240A96F75DFA57604298BA91D27AB5DDED496513A7AA',
    dimensions: { width: 1393, height: 998 },
    source: 'diagnostic',
    minimumExactMetrics: 16,
    expected: {
      gmv: 12887813,
      items_sold: 142,
      current_viewers: 1340,
      impressions: 72940,
      total_views: 1860,
      advertising_cost: 2730000,
      click_rate: 2.55,
      roi_gmv_max: 5.62,
      ctor: 9.58,
      average_view_duration_seconds: 77,
      new_followers: 12,
      buyers: 58,
      sku_orders: 130,
      comments: 233,
      product_clicks: 877,
      average_order_value: 153430,
      live_ctr: 47.1,
      shares: 58,
      estimated_gmv: 12070000,
    },
  },
  {
    name: 'June 25 evening real dashboard',
    fileName: 'tiktok-real-2026-06-25-evening.png',
    sha256: 'B1F3C981BD2024EDEFD2209111C3C373947121E68414AEC99FDFB59F95274126',
    dimensions: { width: 1393, height: 987 },
    source: 'diagnostic',
    minimumExactMetrics: 16,
    expected: {
      gmv: 16475613,
      items_sold: 169,
      current_viewers: 1470,
      impressions: 76840,
      total_views: 2010,
      advertising_cost: 3030000,
      click_rate: 2.61,
      roi_gmv_max: 6.6,
      ctor: 8.17,
      average_view_duration_seconds: 81,
      new_followers: 12,
      buyers: 51,
      sku_orders: 132,
      comments: 162,
      product_clicks: 1040,
      average_order_value: 193830,
      live_ctr: 51.87,
      shares: 15,
      estimated_gmv: 12130000,
    },
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
    const ocrAssetRequests: string[] = []
    if (fixture.fileName === 'tiktok-reference.jpg') {
      page.on('request', request => {
        if (/tesseract|traineddata|jsdelivr/i.test(request.url())) {
          ocrAssetRequests.push(request.url())
        }
      })
    }
    const fixturePath = path.join(fixtureDirectory, fixture.fileName)
    await expectFixtureIntegrity(fixturePath, fixture.sha256)
    await openTikTokFinalReport(page)
    await page.getByTestId('report-dashboard-image-upload').setInputFiles(fixturePath)
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
    await expect(page.getByTestId('ocr-crop-selection')).toBeVisible()
    await expect(page.getByTestId('ocr-crop-handle-se')).toBeVisible()
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
    const expectedMetrics = fixture.expected || referenceExpectedMetrics
    const actual = await readRenderedMetrics(page, expectedMetrics)
    const statuses = await readMetricStatuses(page, expectedMetrics)
    const candidateDiagnostics = await readCandidateDiagnostics(page)
    const rawDiagnostics = await page.getByTestId('report-ocr-raw-diagnostics')
      .locator('pre')
      .textContent()
    const mismatches = Object.entries(expectedMetrics).flatMap(([key, expected]) =>
      actual[key] === String(expected)
        ? []
        : [{ key, expected: String(expected), actual: actual[key] }],
    )
    const mismatchCandidates = candidateDiagnostics
      .filter(row => mismatches.some(mismatch => mismatch.key === row.canonicalKey))
      .map(row => ({
        canonicalKey: row.canonicalKey,
        selected: row.normalizedValue,
        rawValue: row.rawValue,
        source: row.source,
        status: row.status,
        discardedConflict: row.discardedConflict,
        reason: row.reason,
        candidates: row.evidenceGroups,
      }))
    const reviewRequired = Object.entries(statuses)
      .filter(([, status]) => ['review_required', 'low_confidence'].includes(status || ''))
      .map(([key]) => key)
    const confirmed = Object.entries(statuses)
      .filter(([, status]) => ['confirmed', 'accepted'].includes(status || ''))
      .map(([key]) => key)
    const missing = Object.entries(actual)
      .filter(([, value]) => value === '')
      .map(([key]) => key)
    const confirmedReasons = candidateDiagnostics
      .filter(row => confirmed.includes(row.canonicalKey))
      .map(row => {
        const evidenceGroups = selectedEvidenceGroupNames(row)
        return {
          key: row.canonicalKey,
          reason: `${evidenceGroups.length} independent evidence groups agreed with clear card ownership and no similarly strong conflict.`,
          evidenceGroups,
        }
      })

    console.info(JSON.stringify({
      fixture: fixture.fileName,
      source: fixture.source,
      selected_roi: diagnostics.selected_roi,
      selected_candidate: selected,
      candidate_count: diagnostics.dashboard_candidates.length,
      status_counts: {
        confirmed: confirmed.length,
        review_required: reviewRequired.length,
        missing: missing.length,
      },
      confirmed_reasons: confirmedReasons,
      review_required: reviewRequired,
      mismatches,
      mismatch_candidates: mismatchCandidates,
      raw_diagnostics_available: Boolean(rawDiagnostics),
    }, null, 2))
    if (fixture.source === 'real') {
      expect(mismatches, JSON.stringify({ actual, diagnostics }, null, 2)).toEqual([])
    } else {
      if (fixture.minimumExactMetrics) {
        expect(
          Object.keys(expectedMetrics).length - mismatches.length,
          JSON.stringify({ actual, diagnostics }, null, 2),
        ).toBeGreaterThanOrEqual(fixture.minimumExactMetrics)
      }
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
    if (fixture.fileName === 'tiktok-reference.jpg') {
      const downloadPromise = page.waitForEvent('download')
      await page.getByTestId('ocr-download-diagnostics').click()
      const download = await downloadPromise
      const downloadedPath = await download.path()
      if (!downloadedPath) {
        throw new Error('Playwright did not provide a path for the OCR diagnostics download')
      }
      const exported = JSON.parse(
        await readFile(downloadedPath, 'utf8'),
      ) as OcrDiagnosticDownload
      expect(exported.schema_version).toBe('1')
      expect(exported.runtime?.runtime_id).toBe('tesseract-browser-pinned-v1')
      expect(exported.runtime?.browser.device_pixel_ratio).toBe(1)
      expect(exported.runtime?.browser.viewport).toEqual({ width: 1366, height: 768 })
      expect(exported.runtime?.image.decoded_width).toBe(1748)
      expect(exported.runtime?.image.decoded_height).toBe(926)
      expect(exported.runtime?.image.canvas_width).toBeGreaterThan(0)
      expect(exported.runtime?.image.canvas_width).toBeLessThanOrEqual(1800)
      expect(exported.runtime?.image.canvas_height).toBeGreaterThan(0)
      expect(exported.runtime?.image.canvas_height).toBeLessThan(926 * 3)
      expect(exported.runtime?.tesseract).toMatchObject({
        package_version: '7.0.0',
        core_version: '7.0.0',
        language: 'eng+vie',
        language_data_version: '4.0.0_best_int',
        language_data_source: '/ocr/tessdata',
        worker_path: '/ocr/tesseract/worker.min.js',
        core_path: '/ocr/tesseract/tesseract-core-lstm.wasm.js',
        cache_method: 'none',
      })
      expect(exported.runtime?.selected_roi).toEqual(diagnostics.selected_roi)
      expect(exported.runtime?.normalized_roi_dimensions).toEqual({
        width: 2400,
        height: 1200,
      })
      expect(exported.runtime?.preprocessing_pipeline).toContain(
        'tiktok_selected_kpi_crop_original_resolution',
      )
      expect(exported.runtime?.preprocessing_pipeline).toContain(
        'tiktok_selected_kpi_crop_card_grid_2400x1200',
      )
      expect(exported.runtime?.preprocessing_pipeline).toContain('anchor_aligned_card_crop')
      expect(exported.raw_ocr_text.length).toBeGreaterThan(0)
      expect(exported.words.length).toBeGreaterThan(0)
      for (const key of [
        'items_sold',
        'impressions',
        'advertising_cost',
        'comments',
        'average_order_value',
      ]) {
        expect(
          exported.candidates.some(candidate => candidate.canonical_key === key),
          `${key} must be included in the diagnostics export`,
        ).toBe(true)
        expect(exported.card_diagnostics[key]?.length || 0).toBeGreaterThan(0)
      }
      console.info(JSON.stringify({
        fixture: fixture.fileName,
        runtime: exported.runtime,
        failing_metric_candidate_comparison: exported.candidates
          .filter(candidate => [
            'items_sold',
            'impressions',
            'advertising_cost',
            'comments',
            'average_order_value',
          ].includes(candidate.canonical_key))
          .map(candidate => ({
            canonical_key: candidate.canonical_key,
            selected_value: candidate.metric.value,
            selected_raw_value: candidate.metric.raw_value,
            selected_strategy: candidate.metric.strategy,
            selected_evidence_group: candidate.metric.evidence_group,
            status: candidate.metric.status,
            candidates: candidate.metric.strategy_candidates,
          })),
      }, null, 2))
      expect(JSON.stringify(exported)).not.toMatch(/data:image|base64,/i)
      expect(ocrAssetRequests.some(url =>
        url.includes('/ocr/tesseract/worker.min.js'),
      )).toBe(true)
      expect(ocrAssetRequests.some(url =>
        url.includes('/ocr/tessdata/eng.traineddata.gz'),
      )).toBe(true)
      expect(ocrAssetRequests.some(url =>
        url.includes('/ocr/tessdata/vie.traineddata.gz'),
      )).toBe(true)
      expect(ocrAssetRequests.some(url => url.includes('cdn.jsdelivr.net'))).toBe(false)
    }
    await page.getByTestId('ocr-metric-filter-data').click()
    for (const [key, value] of Object.entries(actual)) {
      if (!value) continue
      await expect(page.getByTestId(`ocr-metric-input-${key}`)).toHaveValue(value)
    }
    await page.getByTestId('ocr-metric-filter-all').click()
    expect(await readRenderedMetrics(page, expectedMetrics)).toEqual(actual)
    const originalWidth = await page.getByTestId('ocr-crop-width').inputValue()
    const adjustedWidth = Math.max(5, Number(originalWidth) - 1)
    await page.getByTestId('ocr-crop-width').fill(String(adjustedWidth))
    await expect(page.getByTestId('ocr-crop-width')).toHaveValue(String(adjustedWidth))
  })
}

for (const fixture of fixtures.filter(candidate => candidate.source === 'diagnostic')) {
  test(`TikTok ${fixture.name} Live Dashboard Update keeps weak values review-required`, async ({ page }) => {
    test.setTimeout(240_000)
    const fixturePath = path.join(fixtureDirectory, fixture.fileName)
    const expectedMetrics = fixture.expected || referenceExpectedMetrics
    await expectFixtureIntegrity(fixturePath, fixture.sha256)
    await prepareTikTokShiftForLiveUpdate(page)
    await expect(page.getByTestId('live-platform-selector')).toContainText('TikTok Shop')
    await page.getByTestId('live-dashboard-image-upload').setInputFiles(fixturePath)
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
    await page.getByTestId('live-run-ocr-button').click()
    await waitForOcrCompletion(page.getByTestId('live-ocr-completion-status'))
    await page.getByTestId('ocr-metric-filter-all').click()

    const actual = await readRenderedMetrics(page, expectedMetrics)
    const statuses = await readMetricStatuses(page, expectedMetrics)
    const mismatches = Object.entries(expectedMetrics).flatMap(([key, expected]) =>
      actual[key] === String(expected)
        ? []
        : [{ key, expected: String(expected), actual: actual[key], status: statuses[key] || '' }],
    )
    expect(
      Object.keys(expectedMetrics).length - mismatches.length,
      JSON.stringify({ fixture: fixture.fileName, actual, statuses }, null, 2),
    ).toBeGreaterThanOrEqual(fixture.minimumExactMetrics || 0)
    for (const mismatch of mismatches) {
      if (mismatch.actual === '') {
        expect(
          ['empty', 'missing'].includes(mismatch.status),
          `${mismatch.key} is unreadable and must remain missing`,
        ).toBe(true)
        continue
      }
      expect(
        ['review_required', 'low_confidence'].includes(mismatch.status),
        `${mismatch.key}=${mismatch.actual} must remain review_required`,
      ).toBe(true)
    }
    expect(
      Object.entries(statuses)
        .filter(([, status]) => ['confirmed', 'accepted'].includes(status || ''))
        .map(([key]) => key)
        .filter(key => mismatches.some(mismatch => mismatch.key === key)),
    ).toEqual([])

    console.info(JSON.stringify({
      fixture: fixture.fileName,
      workflow: 'live_dashboard_update',
      exact: Object.keys(expectedMetrics).length - mismatches.length,
      confirmed: Object.values(statuses)
        .filter(status => ['confirmed', 'accepted'].includes(status || '')).length,
      review_required: Object.values(statuses)
        .filter(status => ['review_required', 'low_confidence'].includes(status || '')).length,
      missing: Object.values(actual).filter(value => value === '').length,
      mismatches,
    }, null, 2))

    await page.getByTestId('ocr-metric-filter-data').click()
    for (const [key, value] of Object.entries(actual)) {
      if (!value) continue
      await expect(page.getByTestId(`ocr-metric-input-${key}`)).toHaveValue(value)
    }
    await page.getByTestId('ocr-metric-filter-all').click()
    expect(await readRenderedMetrics(page, expectedMetrics)).toEqual(actual)
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

async function prepareTikTokShiftForLiveUpdate(page: Page) {
  await expect.poll(async () => {
    const response = await page.goto('/calendar', { waitUntil: 'domcontentloaded' })
    return response?.status()
  }, {
    timeout: 30_000,
    intervals: [500, 1_000, 2_000],
  }).toBe(200)
  await page.getByTestId('calendar-event-s1').click()
  await page.getByTestId('edit-shift-detail').click()

  const editDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Edit Shift', exact: true }),
  })
  const statusField = editDialog.getByText('Status', { exact: true }).locator('..')
  await statusField.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Preparing', exact: true }).click()
  await editDialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editDialog).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByTestId('sidebar-live').click()
  await expect(page).toHaveURL(/\/live$/)
  await page.getByTestId('open-live-dashboard-update-s1').click()
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

async function readRenderedMetrics(page: Page, expectedMetrics: Record<string, number>) {
  const keys = Object.keys(expectedMetrics)
  const inputs = page.getByTestId('ocr-main-metrics').locator('input[data-testid^="ocr-metric-input-"]')
  await expect(inputs).toHaveCount(keys.length)
  return Object.fromEntries(await Promise.all(keys.map(async key => [
    key,
    await page.getByTestId(`ocr-metric-input-${key}`).inputValue(),
  ])))
}

async function readMetricStatuses(page: Page, expectedMetrics: Record<string, number>) {
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
      evidenceGroups: JSON.parse(
        await rows.nth(index).getAttribute('data-ocr-evidence-groups') || '[]',
      ) as unknown[],
    }
  }))
}

function selectedEvidenceGroupNames(
  row: Awaited<ReturnType<typeof readCandidateDiagnostics>>[number],
) {
  return [...new Set(row.evidenceGroups.flatMap(candidate => {
    if (
      !candidate
      || typeof candidate !== 'object'
      || !('evidence_group' in candidate)
      || typeof candidate.evidence_group !== 'string'
      || !('value_candidate' in candidate)
      || String(candidate.value_candidate ?? '') !== row.normalizedValue
    ) return []
    return [candidate.evidence_group]
  }))]
}

async function expectFixtureIntegrity(filePath: string, sha256: string) {
  const bytes = await readFile(filePath)
  expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(sha256)
}
