import type {
  OcrCropBox,
  OcrDashboardCandidate,
  OcrEvidenceSourceFamily,
  OcrImageRecognition,
  OcrRecognizedWord,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import {
  isLegacyOcrApiSuccess,
  isOcrApiSuccess,
  type OcrApiFailure,
  type OcrApiResponse,
} from '@/lib/services/ocrApiContract'
import { clampOcrCrop, defaultOcrCrop } from '@/lib/utils/ocrImage'
import {
  reconstructCompactOcrValue,
  type LayoutMetricCell,
} from '@/lib/utils/ocrMetrics'
import {
  detectDashboardRegions,
  detectVisualDashboardHints,
  platformRoiMetricLayouts,
  proposeTikTokKpiPanelCrop,
  roiCellBoundingBox,
  roiPointToImage,
  type DashboardVisualHint,
} from '@/lib/utils/dashboardRegionDetection'
import {
  OCR_RUNTIME_CONFIG,
  pinnedBrowserWorkerOptions,
} from '@/lib/services/ocrRuntimeConfig'

export class OcrApiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly contentType: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'OcrApiResponseError'
  }
}

export async function parseOcrApiResponse(response: Response): Promise<OcrImageRecognition> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  const responseText = await response.text()

  if (!contentType.includes('application/json')) {
    throw new OcrApiResponseError(
      `OCR API returned an unexpected non-JSON response (status ${response.status}).`,
      response.status,
      contentType,
    )
  }

  let payload: OcrApiResponse | OcrImageRecognition
  try {
    payload = JSON.parse(responseText) as OcrApiResponse | OcrImageRecognition
  } catch {
    throw new OcrApiResponseError(
      `OCR API returned invalid JSON (status ${response.status}).`,
      response.status,
      contentType,
    )
  }

  if (response.ok && isOcrApiSuccess(payload)) return payload.data
  // Keep compatibility with an already-running server during a rolling deployment.
  if (response.ok && isLegacyOcrApiSuccess(payload)) return payload

  const failure = payload as Partial<OcrApiFailure>
  const message = failure.error?.message || `Image recognition failed (status ${response.status}).`
  throw new OcrApiResponseError(
    message,
    response.status,
    contentType,
    failure.error?.code,
  )
}

export async function recognizeDashboardImage(
  imageUrl: string,
  platform: ReportDashboardPlatform,
  cropBox?: OcrCropBox,
): Promise<OcrImageRecognition> {
  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) {
    throw new Error('The selected dashboard image could not be read.')
  }
  const imageBlob = await imageResponse.blob()

  let browserFailure: unknown
  if (typeof window !== 'undefined') {
    try {
      return await recognizeDashboardImageInBrowser(imageBlob, platform, cropBox)
    } catch (error) {
      browserFailure = error
    }
  }

  try {
    return await recognizeDashboardImageOnServer(imageBlob, platform, cropBox)
  } catch (serverFailure) {
    if (browserFailure instanceof Error) {
      throw new Error(
        `${serverFailure instanceof Error ? serverFailure.message : 'Server OCR unavailable.'} `
        + `Browser OCR also failed: ${browserFailure.message}`,
      )
    }
    throw serverFailure
  }
}

export async function proposeTikTokKpiCrop(imageUrl: string) {
  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) throw new Error('The selected dashboard image could not be read.')
  const bitmap = await createImageBitmap(await imageResponse.blob())
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Browser crop proposal canvas is unavailable.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    return proposeTikTokKpiPanelCrop(image.data, canvas.width, canvas.height)
  } finally {
    bitmap.close()
  }
}

async function recognizeDashboardImageOnServer(
  imageBlob: Blob,
  platform: ReportDashboardPlatform,
  cropBox?: OcrCropBox,
) {
  const formData = new FormData()
  formData.append('image', imageBlob, 'dashboard-image')
  formData.append('platform', platform)
  if (cropBox) formData.append('crop', JSON.stringify(cropBox))

  const response = await fetch('/api/ocr', {
    method: 'POST',
    body: formData,
  })
  return parseOcrApiResponse(response)
}

async function recognizeDashboardImageInBrowser(
  imageBlob: Blob,
  platform: ReportDashboardPlatform,
  requestedCrop?: OcrCropBox,
): Promise<OcrImageRecognition> {
  const [tesseract, bitmap] = await Promise.all([
    import('tesseract.js'),
    createImageBitmap(imageBlob),
  ])
  const { createWorker, OEM, PSM } = tesseract
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  const requested = clampOcrCrop(requestedCrop || defaultOcrCrop(platform))
  if (platform === 'tiktok_shop') {
    return recognizeTikTokKpiCropInBrowser({
      bitmap,
      requested,
      createWorker,
      OEM,
      PSM,
    })
  }
  const browserPreprocessScale = Math.max(
    1,
    Math.min(2, 2800 / Math.max(originalWidth, originalHeight)),
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(originalWidth * browserPreprocessScale))
  canvas.height = Math.max(1, Math.round(originalHeight * browserPreprocessScale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Browser OCR canvas is unavailable.')
  }
  context.drawImage(bitmap, 0, 0, originalWidth, originalHeight, 0, 0, canvas.width, canvas.height)

  const worker = await createWorker(
    OCR_RUNTIME_CONFIG.language,
    OEM.LSTM_ONLY,
    pinnedBrowserWorkerOptions(),
  )
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const result = await worker.recognize(
      canvas,
      { rotateAuto: false },
      { text: true, blocks: true },
    )
    const text = result.data.text.trim()
    const fullImageWords = mapBrowserTesseractBlocksToWords(
      result.data.blocks,
      platform,
      { left: 0, top: 0 },
      browserPreprocessScale,
      'legacy_full_image_ocr',
      'legacy_full_image:primary',
    )
    const visualHints = browserVisualHints(bitmap)
    const regionResult = detectDashboardRegions({
      words: fullImageWords,
      imageWidth: originalWidth,
      imageHeight: originalHeight,
      requestedPlatform: platform,
      requestedCrop: requested,
      visualHints,
    })
    const selected = regionResult.selected
    let selectedText = text
    let normalizedStrategyText = text
    let selectedWords = fullImageWords
    let cardRecognition: Awaited<ReturnType<typeof recognizeMetricCardsInBrowser>> = {
      output: {},
      labels: {},
      words: [],
      diagnostics: {},
    }

    if (selected && platform !== 'other') {
      const normalizedDimensions = regionResult.diagnostics.normalized_roi_dimensions
        || { width: 1600, height: 900 }
      const normalizedCanvas = createNormalizedRoiCanvas(
        bitmap,
        selected,
        normalizedDimensions.width,
        normalizedDimensions.height,
      )
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })
      const normalizedResult = await worker.recognize(
        normalizedCanvas,
        { rotateAuto: false },
        { text: true, blocks: true },
      )
      const normalizedWords = mapNormalizedBrowserTesseractBlocksToWords(
        normalizedResult.data.blocks,
        platform,
        selected,
        normalizedCanvas.width,
        normalizedCanvas.height,
        'roi-label',
        `normalized_roi:${selected.id}`,
      )
      normalizedStrategyText = normalizedResult.data.text.trim()
      const adaptiveRoi = createBrowserAdaptiveMetricCanvas(
        normalizedCanvas,
        {
          left: 0,
          top: 0,
          width: normalizedCanvas.width,
          height: normalizedCanvas.height,
        },
        1,
        true,
      )
      const adaptiveResult = await worker.recognize(
        adaptiveRoi,
        { rotateAuto: false },
        { text: true, blocks: true },
      )
      const adaptiveWords = mapNormalizedBrowserTesseractBlocksToWords(
        adaptiveResult.data.blocks,
        platform,
        selected,
        normalizedCanvas.width,
        normalizedCanvas.height,
        'roi-adaptive',
        `normalized_roi:${selected.id}`,
      )
      selectedText = [
        normalizedResult.data.text.trim(),
        adaptiveResult.data.text.trim(),
      ].filter(Boolean).join('\n') || text
      selectedWords = [...normalizedWords, ...adaptiveWords]
      cardRecognition = await recognizeMetricCardsInBrowser(
        worker,
        bitmap,
        normalizedCanvas,
        selected,
        platform,
        PSM,
      )
    }

    return {
      engine: 'tesseract.js',
      language: 'eng+vie',
      text: selectedText,
      pass_output: {
        label: selectedText,
        numeric: '',
        card: cardRecognition.output,
        card_labels: cardRecognition.labels,
        card_diagnostics: cardRecognition.diagnostics,
        strategy_text: {
          normalized_roi: normalizedStrategyText,
          legacy_relative: text,
        },
      },
      confidence: result.data.confidence,
      words: [...selectedWords, ...cardRecognition.words],
      crop_box: selected?.crop_box || requested,
      original_dimensions: { width: originalWidth, height: originalHeight },
      processed_dimensions: { width: canvas.width, height: canvas.height },
      region_diagnostics: regionResult.diagnostics,
      runtime_diagnostics: browserRuntimeDiagnostics({
        originalWidth,
        originalHeight,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        selectedRoi: selected?.crop_box,
        normalizedRoiDimensions:
          regionResult.diagnostics.normalized_roi_dimensions,
      }),
    }
  } finally {
    bitmap.close()
    await worker.terminate()
  }
}

async function recognizeTikTokKpiCropInBrowser({
  bitmap,
  requested,
  createWorker,
  OEM,
  PSM,
}: {
  bitmap: ImageBitmap
  requested: OcrCropBox
  createWorker: typeof import('tesseract.js')['createWorker']
  OEM: typeof import('tesseract.js')['OEM']
  PSM: typeof import('tesseract.js')['PSM']
}): Promise<OcrImageRecognition> {
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  const pixelCrop = {
    left: requested.left * originalWidth,
    top: requested.top * originalHeight,
    width: requested.width * originalWidth,
    height: requested.height * originalHeight,
  }
  const cropScale = Math.max(1, Math.min(3, 1800 / Math.max(1, pixelCrop.width)))
  const cropCanvas = createBrowserOriginalMetricCanvas(bitmap, pixelCrop, cropScale)
  const worker = await createWorker(
    OCR_RUNTIME_CONFIG.language,
    OEM.LSTM_ONLY,
    pinnedBrowserWorkerOptions(),
  )
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const primary = await worker.recognize(
      cropCanvas,
      { rotateAuto: false },
      { text: true, blocks: true },
    )
    const primaryWords = mapBrowserTesseractBlocksToWords(
      primary.data.blocks,
      'tiktok_shop',
      { left: pixelCrop.left, top: pixelCrop.top },
      cropScale,
      'normalized_roi_ocr',
      'selected_kpi_crop:primary',
    )
    const selectedWords = primaryWords
    const regionResult = detectDashboardRegions({
      words: selectedWords,
      imageWidth: originalWidth,
      imageHeight: originalHeight,
      requestedPlatform: 'tiktok_shop',
      requestedCrop: requested,
    })
    const selected = regionResult.selected
    const normalizedCardCanvas = selected
      ? createNormalizedRoiCanvas(bitmap, selected, 2400, 1200)
      : cropCanvas
    const cardRecognition = selected
      ? await recognizeMetricCardsInBrowser(
        worker,
        bitmap,
        normalizedCardCanvas,
        selected,
        'tiktok_shop',
        PSM,
        { cropFirst: true, useNormalizedSource: true },
      )
      : { output: {}, labels: {}, words: [], diagnostics: {} }
    const selectedText = primary.data.text.trim()
    const regionDiagnostics = {
      ...regionResult.diagnostics,
      normalized_roi_dimensions: selected ? { width: 2400, height: 1200 } : undefined,
    }
    const runtimeDiagnostics = browserRuntimeDiagnostics({
      originalWidth,
      originalHeight,
      canvasWidth: cropCanvas.width,
      canvasHeight: cropCanvas.height,
      selectedRoi: requested,
      normalizedRoiDimensions: selected ? { width: 2400, height: 1200 } : undefined,
    })
    runtimeDiagnostics.preprocessing_pipeline = [
      'tiktok_selected_kpi_crop_original_resolution',
      'tiktok_selected_kpi_crop_card_grid_2400x1200',
      'anchor_aligned_card_crop',
    ]

    return {
      engine: 'tesseract.js',
      language: 'eng+vie',
      text: selectedText,
      pass_output: {
        label: selectedText,
        numeric: '',
        card: cardRecognition.output,
        card_labels: cardRecognition.labels,
        card_diagnostics: cardRecognition.diagnostics,
        strategy_text: {
          normalized_roi: selectedText,
        },
      },
      confidence: primary.data.confidence,
      words: [...selectedWords, ...cardRecognition.words],
      crop_box: requested,
      original_dimensions: { width: originalWidth, height: originalHeight },
      processed_dimensions: { width: cropCanvas.width, height: cropCanvas.height },
      region_diagnostics: regionDiagnostics,
      runtime_diagnostics: runtimeDiagnostics,
    }
  } finally {
    bitmap.close()
    await worker.terminate()
  }
}

type BrowserOcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>
type BrowserPsm = typeof import('tesseract.js')['PSM']

async function recognizeMetricCardsInBrowser(
  worker: BrowserOcrWorker,
  originalBitmap: ImageBitmap,
  normalizedCanvas: HTMLCanvasElement,
  candidate: OcrDashboardCandidate,
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  psm: BrowserPsm,
  options: { cropFirst?: boolean; useNormalizedSource?: boolean } = {},
) {
  const output: Record<string, string[]> = {}
  const labels: Record<string, string[]> = {}
  const diagnostics: NonNullable<OcrImageRecognition['pass_output']['card_diagnostics']> = {}
  const words: OcrRecognizedWord[] = []

  for (const cell of platformRoiMetricLayouts[platform]) {
    // Shopee social/live-preview metrics sit outside the orange KPI panel. They
    // remain available through anchor text, but are not cropped from this ROI.
    if (cell.x < 0 || cell.x > 1 || cell.y < 0 || cell.y > 1) continue
    const labelOriginalBox = roiCellBoundingBox(candidate, cell, 'label')
    const evidenceGroup = `anchor_card:${candidate.id}:${cell.key}`
    const labelOriginalCrop = {
      left: labelOriginalBox.x,
      top: labelOriginalBox.y,
      width: labelOriginalBox.width,
      height: labelOriginalBox.height,
    }
    const useNormalizedSource = candidate.perspective_correction_applied
      || options.useNormalizedSource
    const labelCrop = useNormalizedSource
      ? browserMetricLabelCrop(
        cell,
        normalizedCanvas.width,
        normalizedCanvas.height,
        platform,
      )
      : labelOriginalCrop
    const useOriginalCardFallback = options.cropFirst
      && useNormalizedSource
      && platform === 'tiktok_shop'
      && (cell.key === 'current_viewers' || cell.key === 'estimated_gmv')
    const cardSource = useNormalizedSource && !useOriginalCardFallback
      ? normalizedCanvas
      : originalBitmap
    labels[cell.key] = []
    // The selected-crop OCR already reads all labels and validates the panel.
    // The canonical card grid owns each value crop, so repeating 19 label-only
    // OCR calls would add latency without independent evidence.
    if (!options.cropFirst) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ()-/.đĐ',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })
      const labelCanvas = createBrowserMetricCanvas(cardSource, labelCrop, 3)
      const labelResult = await worker.recognize(
        labelCanvas,
        { rotateAuto: false },
        { text: true },
      )
      const rawLabel = normalizeBrowserCardText(labelResult.data.text)
      labels[cell.key] = rawLabel ? [rawLabel] : []
      if (rawLabel) {
        words.push(browserCardWord(
          rawLabel,
          labelResult.data.confidence,
          `card-label:${cell.key}:0`,
          labelOriginalCrop,
          platform,
          'label',
          'anchor_aligned_card_crop',
          evidenceGroup,
        ))
      }
    }

    const originalBox = roiCellBoundingBox(candidate, cell, 'value')
    const originalCrop = {
      left: originalBox.x,
      top: originalBox.y,
      width: originalBox.width,
      height: originalBox.height,
    }
    const crop = useNormalizedSource && !useOriginalCardFallback
      ? browserMetricCellCrop(
        cell,
        normalizedCanvas.width,
        normalizedCanvas.height,
        platform,
      )
      : originalCrop
    const appearance = inspectBrowserMetricCrop(cardSource, crop)
    const scale = platform === 'tiktok_shop'
      ? options.cropFirst
        ? useNormalizedSource && !useOriginalCardFallback
          ? cell.valueKind === 'compact' && candidate.aspect_ratio >= 1.75
            ? crop.height <= 34 || appearance.blurEstimate >= .55 ? 5 : 4
            : crop.height <= 34 || appearance.blurEstimate >= .55 ? 4 : 3
          : crop.height <= 34 || appearance.blurEstimate >= .55 ? 5 : 4
        : crop.height <= 34 || appearance.blurEstimate >= .55 ? 9 : 7
      : 5
    await worker.setParameters({
      tessedit_pageseg_mode: browserValuePsm(cell, psm),
      tessedit_char_whitelist: browserValueWhitelist(cell),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const primaryCanvas = createBrowserMetricCanvas(cardSource, crop, scale)
    const primaryResult = await worker.recognize(
      primaryCanvas,
      { rotateAuto: false },
      { text: true },
    )
    const variants = [{
      text: normalizeBrowserCardText(primaryResult.data.text),
      confidence: primaryResult.data.confidence,
      crop: originalCrop,
      preprocessingPass: 'inverted_grayscale',
    }]
    const useColorPass = platform === 'tiktok_shop'
      && (
        options.cropFirst
          ? !/\d/.test(variants[0].text)
            || cell.valueKind === 'compact'
            || candidate.aspect_ratio >= 1.75 && cell.valueKind === 'count_or_compact'
          : appearance.saturation >= .04
            || appearance.dynamicRange < 190
            || appearance.blurEstimate >= .35
      )
    if (useColorPass) {
      const colorCanvas = createBrowserOriginalMetricCanvas(cardSource, crop, scale)
      const colorResult = await worker.recognize(
        colorCanvas,
        { rotateAuto: false },
        { text: true },
      )
      variants.push({
        text: normalizeBrowserCardText(colorResult.data.text),
        confidence: colorResult.data.confidence,
        crop: originalCrop,
        preprocessingPass: 'original_color',
      })
    }
    const alwaysThreshold = platform === 'tiktok_shop'
      ? true
      : ['sales', 'comment_rate', 'gpm', 'ctr'].includes(cell.key)
    const lowConfidenceRetry = cell.valueKind !== 'count'
      && variants[0].confidence < (options.cropFirst
        ? 45
        : cell.valueKind === 'compact' ? 85 : 60)
    if (!/\d/.test(variants[0].text) || lowConfidenceRetry || alwaysThreshold) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm.SINGLE_LINE,
        tessedit_char_whitelist: browserValueWhitelist(cell),
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })
      const thresholdCanvas = createBrowserMetricCanvas(cardSource, crop, scale, 175)
      const thresholdResult = await worker.recognize(
        thresholdCanvas,
        { rotateAuto: false },
        { text: true },
      )
      variants.push({
        text: normalizeBrowserCardText(thresholdResult.data.text),
        confidence: thresholdResult.data.confidence,
        crop: originalCrop,
        preprocessingPass: 'fixed_threshold',
      })
      if (
        platform === 'tiktok_shop'
        && !options.cropFirst
        && (
          appearance.dynamicRange < 210
          || appearance.blurEstimate >= .3
          || new Set(variants.map(variant => variant.text)).size > 1
        )
      ) {
        const localContrastCanvas = createBrowserLocalContrastMetricCanvas(
          cardSource,
          crop,
          Math.max(scale, 8),
        )
        const localContrastResult = await worker.recognize(
          localContrastCanvas,
          { rotateAuto: false },
          { text: true },
        )
        variants.push({
          text: normalizeBrowserCardText(localContrastResult.data.text),
          confidence: localContrastResult.data.confidence,
          crop: originalCrop,
          preprocessingPass: 'local_contrast',
        })
      }
      const distinctThresholdReadings = new Set(
        variants.map(variant => variant.text.replace(/\s+/g, '')).filter(value => /\d/.test(value)),
      )
      const runAdaptivePass = !options.cropFirst
        || !variants.some(variant => /\d/.test(variant.text))
        || Math.max(...variants.map(variant => variant.confidence), 0) < 65
        || distinctThresholdReadings.size > 1
      let adaptiveResult: Awaited<ReturnType<BrowserOcrWorker['recognize']>> | undefined
      if (runAdaptivePass) {
        const adaptiveCanvas = createBrowserAdaptiveMetricCanvas(cardSource, crop, scale, true)
        adaptiveResult = await worker.recognize(
          adaptiveCanvas,
          { rotateAuto: false },
          { text: true },
        )
        variants.push({
          text: normalizeBrowserCardText(adaptiveResult.data.text),
          confidence: adaptiveResult.data.confidence,
          crop: originalCrop,
          preprocessingPass: 'adaptive_light_text',
        })
      }
      if (adaptiveResult && (!/\d/.test(adaptiveResult.data.text) || adaptiveResult.data.confidence < 60)) {
        const normalAdaptiveCanvas = createBrowserAdaptiveMetricCanvas(cardSource, crop, scale, false)
        const normalAdaptiveResult = await worker.recognize(
          normalAdaptiveCanvas,
          { rotateAuto: false },
          { text: true },
        )
        variants.push({
          text: normalizeBrowserCardText(normalAdaptiveResult.data.text),
          confidence: normalAdaptiveResult.data.confidence,
          crop: originalCrop,
          preprocessingPass: 'adaptive_dark_text',
        })
      }
    }
    const compactDecimalPlaces = cell.valueKind === 'compact'
      ? cell.displayFormat?.decimalPlaces
      : undefined
    const compactSuffix = cell.valueKind === 'compact'
      ? cell.displayFormat?.compactSuffix
      : undefined
    const hasDeclaredCompactPrecision = compactDecimalPlaces && compactSuffix
      ? variants.some(variant => new RegExp(
        `[.,]\\d{${compactDecimalPlaces}}${compactSuffix}\\s*[.;:]*$`,
        'i',
      ).test(variant.text.trim()))
      : true
    const distinctGlyphReadings = new Set(
      variants
        .map(variant => variant.text.replace(/\s+/g, '').toUpperCase())
        .filter(value => /\d/.test(value)),
    )
    const countCompactSuffixMissing = cell.valueKind === 'count_or_compact'
      && Boolean(cell.displayFormat?.compactSuffix)
      && !variants.some(variant => new RegExp(
        `${cell.displayFormat?.compactSuffix}\\s*[.;:]*$`,
        'i',
      ).test(variant.text.trim()))
    const shouldRunHighResolutionGlyphPass = platform === 'tiktok_shop'
      && ['count', 'compact', 'count_or_compact', 'currency'].includes(cell.valueKind)
      && (
        !hasDeclaredCompactPrecision
        || countCompactSuffixMissing
        || (
          cell.valueKind === 'compact'
          && (
            distinctGlyphReadings.size > 1
            || Math.max(...variants.map(variant => variant.confidence), 0) < 60
          )
        )
      )
    if (shouldRunHighResolutionGlyphPass) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm.SINGLE_WORD,
        tessedit_char_whitelist: browserValueWhitelist(cell),
        preserve_interword_spaces: '0',
        user_defined_dpi: '300',
      })
      const tightGlyphCrop = browserBrightGlyphCrop(cardSource, crop)
      const highResolutionCanvas = createBrowserOriginalMetricCanvas(
        cardSource,
        tightGlyphCrop,
        Math.max(scale, 12),
      )
      const highResolutionResult = await worker.recognize(
        highResolutionCanvas,
        { rotateAuto: false },
        { text: true },
      )
      variants.push({
        text: normalizeBrowserCardText(highResolutionResult.data.text),
        confidence: highResolutionResult.data.confidence,
        crop: originalCrop,
        preprocessingPass: 'high_resolution_color',
      })
      await worker.setParameters({
        tessedit_pageseg_mode: psm.SINGLE_LINE,
        tessedit_char_whitelist: browserValueWhitelist(cell),
        preserve_interword_spaces: '0',
        user_defined_dpi: '300',
      })
      const segmentedGlyphCanvas = createBrowserSegmentedGlyphCanvas(
        cardSource,
        tightGlyphCrop,
        Math.max(scale, 12),
      )
      if (segmentedGlyphCanvas) {
        const segmentedGlyphResult = await worker.recognize(
          segmentedGlyphCanvas,
          { rotateAuto: false },
          { text: true },
        )
        variants.push({
          text: normalizeBrowserCardText(segmentedGlyphResult.data.text),
          confidence: segmentedGlyphResult.data.confidence,
          crop: originalCrop,
          preprocessingPass: 'segmented_glyphs',
        })
      }
    }
    const reconstructedCompact = reconstructCompactCardValue(cell, variants)
    if (reconstructedCompact) variants.unshift(reconstructedCompact)
    // Keep the least-destructive pass first. Threshold and adaptive variants
    // are recovery evidence and receive a later-pass penalty in candidate
    // scoring unless the primary value is structurally invalid.
    const rankedVariants = variants
    output[cell.key] = rankedVariants.map(variant => variant.text)
    diagnostics[cell.key] = rankedVariants.map(variant => ({
      text: variant.text,
      confidence: variant.confidence,
      preprocessing_pass: variant.preprocessingPass,
      evidence_source_family: 'anchor_aligned_card_crop',
      evidence_group: evidenceGroup,
      bounding_box: {
        x: variant.crop.left,
        y: variant.crop.top,
        width: variant.crop.width,
        height: variant.crop.height,
      },
    }))
    rankedVariants.forEach((variant, variantIndex) => {
      if (!/\d/.test(variant.text)) return
      words.push({
        text: variant.text,
        confidence: variant.confidence,
        line_id: `card:${cell.key}:${variantIndex}`,
        block_index: variantIndex,
        line_index: 0,
        platform,
        source: 'image_ocr',
        pass: 'card',
        evidence_source_family: 'anchor_aligned_card_crop',
        evidence_group: evidenceGroup,
        bounding_box: {
          x: variant.crop.left,
          y: variant.crop.top,
          width: variant.crop.width,
          height: variant.crop.height,
        },
        x0: variant.crop.left,
        y0: variant.crop.top,
        x1: variant.crop.left + variant.crop.width,
        y1: variant.crop.top + variant.crop.height,
        centerX: variant.crop.left + variant.crop.width / 2,
        centerY: variant.crop.top + variant.crop.height / 2,
        width: variant.crop.width,
        height: variant.crop.height,
      })
    })
  }
  return { output, labels, diagnostics, words }
}

function browserRuntimeDiagnostics({
  originalWidth,
  originalHeight,
  canvasWidth,
  canvasHeight,
  selectedRoi,
  normalizedRoiDimensions,
}: {
  originalWidth: number
  originalHeight: number
  canvasWidth: number
  canvasHeight: number
  selectedRoi?: OcrCropBox
  normalizedRoiDimensions?: { width: number; height: number }
}): NonNullable<OcrImageRecognition['runtime_diagnostics']> {
  const userAgent = navigator.userAgent
  const browserMatch = userAgent.match(
    /(?:Edg|Chrome|CriOS|Firefox|Version)\/([\d.]+)/,
  )
  const browserName = userAgent.includes('Edg/')
    ? 'Microsoft Edge'
    : userAgent.includes('Firefox/')
      ? 'Firefox'
      : userAgent.includes('Chrome/') || userAgent.includes('CriOS/')
        ? 'Chromium'
        : userAgent.includes('Safari/')
          ? 'Safari'
          : 'Unknown'
  const operatingSystem = userAgent.includes('Windows')
    ? 'Windows'
    : userAgent.includes('Android')
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : userAgent.includes('Mac OS')
          ? 'macOS'
          : userAgent.includes('Linux')
            ? 'Linux'
            : 'Unknown'

  return {
    runtime_id: OCR_RUNTIME_CONFIG.runtimeId,
    browser: {
      name: browserName,
      version: browserMatch?.[1] || 'unknown',
      user_agent: userAgent,
      operating_system: operatingSystem,
      device_pixel_ratio: window.devicePixelRatio,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    },
    image: {
      decoded_width: originalWidth,
      decoded_height: originalHeight,
      canvas_width: canvasWidth,
      canvas_height: canvasHeight,
    },
    tesseract: {
      package_version: OCR_RUNTIME_CONFIG.tesseractVersion,
      core_version: OCR_RUNTIME_CONFIG.coreVersion,
      language: OCR_RUNTIME_CONFIG.language,
      language_data_version: OCR_RUNTIME_CONFIG.languageDataVersion,
      language_data_source: OCR_RUNTIME_CONFIG.langPath,
      worker_path: OCR_RUNTIME_CONFIG.workerPath,
      core_path: OCR_RUNTIME_CONFIG.corePath,
      cache_method: OCR_RUNTIME_CONFIG.cacheMethod,
      asset_sha256: { ...OCR_RUNTIME_CONFIG.assetSha256 },
      worker_parameters: { ...OCR_RUNTIME_CONFIG.workerParameters },
    },
    preprocessing_pipeline: [...OCR_RUNTIME_CONFIG.preprocessingPipeline],
    selected_roi: selectedRoi,
    normalized_roi_dimensions: normalizedRoiDimensions,
  }
}

function reconstructCompactCardValue(
  cell: LayoutMetricCell,
  variants: Array<{
    text: string
    confidence: number
    crop: { left: number; top: number; width: number; height: number }
    preprocessingPass: string
  }>,
) {
  const text = reconstructCompactOcrValue(cell, variants.map(variant => variant.text))
  if (!text) return null
  return {
    text,
    confidence: Math.min(...variants.map(variant => variant.confidence)),
    crop: variants[0].crop,
    preprocessingPass: 'geometry_compact_reconstruction',
  }
}

function browserValueWhitelist(cell: LayoutMetricCell) {
  if (cell.valueKind === 'count') return '0123456789'
  if (cell.valueKind === 'count_or_compact') return '0123456789.,KkMm'
  if (cell.valueKind === 'percentage') return '0123456789.,%'
  if (cell.valueKind === 'duration') return '0123456789:mMsS'
  if (cell.valueKind === 'compact') return '0123456789.,KkMm'
  return '0123456789.,'
}

function browserValuePsm(cell: LayoutMetricCell, psm: BrowserPsm) {
  return ['currency', 'ratio', 'compact', 'count_or_compact'].includes(cell.valueKind)
    ? psm.SINGLE_LINE
    : psm.SINGLE_WORD
}

function browserCardWord(
  text: string,
  confidence: number,
  lineId: string,
  crop: { left: number; top: number; width: number; height: number },
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  pass: OcrRecognizedWord['pass'],
  evidenceSourceFamily?: OcrEvidenceSourceFamily,
  evidenceGroup?: string,
): OcrRecognizedWord {
  return {
    text,
    confidence,
    line_id: lineId,
    block_index: 0,
    line_index: 0,
    platform,
    source: 'image_ocr',
    pass,
    evidence_source_family: evidenceSourceFamily,
    evidence_group: evidenceGroup,
    bounding_box: {
      x: crop.left,
      y: crop.top,
      width: crop.width,
      height: crop.height,
    },
    x0: crop.left,
    y0: crop.top,
    x1: crop.left + crop.width,
    y1: crop.top + crop.height,
    centerX: crop.left + crop.width / 2,
    centerY: crop.top + crop.height / 2,
    width: crop.width,
    height: crop.height,
  }
}

function browserMetricCellCrop(
  cell: LayoutMetricCell,
  imageWidth: number,
  imageHeight: number,
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  useFullHeight = false,
) {
  const width = Math.max(1, Math.round(cell.width * imageWidth))
  const normalizedHeight = platform === 'tiktok_shop' && cell.key !== 'gmv' && !useFullHeight
    ? Math.min(cell.height, .07)
    : platform === 'shopee_live'
      ? Math.min(cell.height, cell.key === 'sales' ? .16 : .09)
      : cell.height
  const height = Math.max(1, Math.round(normalizedHeight * imageHeight))
  const left = Math.max(0, Math.min(
    imageWidth - width,
    Math.round(cell.x * imageWidth - width / 2),
  ))
  const top = Math.max(0, Math.min(
    imageHeight - height,
    Math.round(cell.y * imageHeight - height / 2),
  ))
  return { left, top, width, height }
}

function browserMetricLabelCrop(
  cell: LayoutMetricCell,
  imageWidth: number,
  imageHeight: number,
  platform: Exclude<ReportDashboardPlatform, 'other'>,
) {
  const widthMultiplier = platform === 'tiktok_shop' ? 1.55 : 1.35
  const normalizedWidth = Math.min(.22, cell.width * widthMultiplier)
  const normalizedHeight = platform === 'tiktok_shop' ? .045 : .055
  const centerY = cell.y - (platform === 'tiktok_shop' ? .055 : .075)
  const width = Math.max(1, Math.round(normalizedWidth * imageWidth))
  const height = Math.max(1, Math.round(normalizedHeight * imageHeight))
  const left = Math.max(0, Math.min(
    imageWidth - width,
    Math.round(cell.x * imageWidth - width / 2),
  ))
  const top = Math.max(0, Math.min(
    imageHeight - height,
    Math.round(centerY * imageHeight - height / 2),
  ))
  return { left, top, width, height }
}

function createBrowserMetricCanvas(
  bitmap: CanvasImageSource,
  crop: { left: number; top: number; width: number; height: number },
  scale: number,
  threshold?: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = crop.width * scale
  canvas.height = crop.height * scale
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Browser OCR card canvas is unavailable.')
  context.drawImage(
    bitmap,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const gray = Math.round(
      image.data[offset] * .299
      + image.data[offset + 1] * .587
      + image.data[offset + 2] * .114,
    )
    const inverted = 255 - gray
    // Dashboard KPI text is light on a colored/dark panel. A fixed threshold
    // must therefore keep bright glyphs black on a white background; comparing
    // the inverted value selected the background instead and erased digits.
    const value = threshold === undefined ? inverted : gray >= threshold ? 0 : 255
    image.data[offset] = value
    image.data[offset + 1] = value
    image.data[offset + 2] = value
    image.data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function createBrowserOriginalMetricCanvas(
  bitmap: CanvasImageSource,
  crop: { left: number; top: number; width: number; height: number },
  scale: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = crop.width * scale
  canvas.height = crop.height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Browser OCR color card canvas is unavailable.')
  context.filter = 'contrast(135%)'
  context.drawImage(
    bitmap,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  context.filter = 'none'
  return canvas
}

function inspectBrowserMetricCrop(
  bitmap: CanvasImageSource,
  crop: { left: number; top: number; width: number; height: number },
) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width))
  canvas.height = Math.max(1, Math.round(crop.height))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return {
      dynamicRange: 255,
      saturation: 0,
      blurEstimate: 0,
    }
  }
  context.drawImage(
    bitmap,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  let minimum = 255
  let maximum = 0
  let saturationTotal = 0
  let gradientTotal = 0
  let gradientSamples = 0
  const luminance = new Uint8ClampedArray(canvas.width * canvas.height)
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 4
    const red = image.data[offset]
    const green = image.data[offset + 1]
    const blue = image.data[offset + 2]
    const gray = Math.round(red * .299 + green * .587 + blue * .114)
    luminance[pixel] = gray
    minimum = Math.min(minimum, gray)
    maximum = Math.max(maximum, gray)
    saturationTotal += maximumChannelDifference(red, green, blue) / 255
  }
  for (let y = 1; y < canvas.height; y += 1) {
    for (let x = 1; x < canvas.width; x += 1) {
      const pixel = y * canvas.width + x
      gradientTotal += Math.abs(luminance[pixel] - luminance[pixel - 1])
        + Math.abs(luminance[pixel] - luminance[pixel - canvas.width])
      gradientSamples += 2
    }
  }
  const averageGradient = gradientSamples ? gradientTotal / gradientSamples : 0
  return {
    dynamicRange: maximum - minimum,
    saturation: saturationTotal / Math.max(1, luminance.length),
    blurEstimate: Math.max(0, Math.min(1, 1 - averageGradient / 28)),
  }
}

function browserBrightGlyphCrop(
  bitmap: CanvasImageSource,
  crop: { left: number; top: number; width: number; height: number },
) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width))
  canvas.height = Math.max(1, Math.round(crop.height))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return crop
  context.drawImage(
    bitmap,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  let maximumLuminance = 0
  for (let offset = 0; offset < image.data.length; offset += 4) {
    maximumLuminance = Math.max(
      maximumLuminance,
      Math.round(
        image.data[offset] * .299
        + image.data[offset + 1] * .587
        + image.data[offset + 2] * .114,
      ),
    )
  }
  const glyphThreshold = Math.max(145, maximumLuminance - 55)
  let minimumX = canvas.width
  let minimumY = canvas.height
  let maximumX = -1
  let maximumY = -1
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4
      const red = image.data[offset]
      const green = image.data[offset + 1]
      const blue = image.data[offset + 2]
      const luminance = Math.round(red * .299 + green * .587 + blue * .114)
      if (
        luminance < glyphThreshold
        || maximumChannelDifference(red, green, blue) > 80
      ) continue
      minimumX = Math.min(minimumX, x)
      minimumY = Math.min(minimumY, y)
      maximumX = Math.max(maximumX, x)
      maximumY = Math.max(maximumY, y)
    }
  }
  if (
    maximumX - minimumX < 3
    || maximumY - minimumY < 3
  ) return crop
  const padding = Math.max(2, Math.round(canvas.height * .08))
  const left = Math.max(0, minimumX - padding)
  const top = Math.max(0, minimumY - padding)
  const right = Math.min(canvas.width, maximumX + padding + 1)
  const bottom = Math.min(canvas.height, maximumY + padding + 1)
  return {
    left: crop.left + left,
    top: crop.top + top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

function createBrowserSegmentedGlyphCanvas(
  bitmap: CanvasImageSource,
  crop: { left: number; top: number; width: number; height: number },
  scale: number,
) {
  const source = document.createElement('canvas')
  source.width = Math.max(1, Math.round(crop.width))
  source.height = Math.max(1, Math.round(crop.height))
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return null
  sourceContext.drawImage(
    bitmap,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    source.width,
    source.height,
  )
  const image = sourceContext.getImageData(0, 0, source.width, source.height)
  let maximumLuminance = 0
  for (let offset = 0; offset < image.data.length; offset += 4) {
    maximumLuminance = Math.max(
      maximumLuminance,
      Math.round(
        image.data[offset] * .299
        + image.data[offset + 1] * .587
        + image.data[offset + 2] * .114,
      ),
    )
  }
  const glyphThreshold = Math.max(145, maximumLuminance - 55)
  const activeColumns = new Array<boolean>(source.width).fill(false)
  for (let x = 0; x < source.width; x += 1) {
    for (let y = 0; y < source.height; y += 1) {
      const offset = (y * source.width + x) * 4
      const red = image.data[offset]
      const green = image.data[offset + 1]
      const blue = image.data[offset + 2]
      const luminance = Math.round(red * .299 + green * .587 + blue * .114)
      if (
        luminance >= glyphThreshold
        && maximumChannelDifference(red, green, blue) <= 80
      ) {
        activeColumns[x] = true
        break
      }
    }
  }
  const runs: Array<{ left: number; width: number }> = []
  let runStart = -1
  activeColumns.forEach((active, x) => {
    if (active && runStart < 0) runStart = x
    if (!active && runStart >= 0) {
      runs.push({ left: runStart, width: x - runStart })
      runStart = -1
    }
  })
  if (runStart >= 0) runs.push({ left: runStart, width: source.width - runStart })
  if (runs.length < 3) return null
  const gap = 3
  const segmentedWidth = runs.reduce((total, run) => total + run.width, 0)
    + gap * (runs.length - 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, segmentedWidth * scale)
  canvas.height = Math.max(1, source.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return null
  const corner = sourceContext.getImageData(0, 0, 1, 1).data
  context.fillStyle = `rgb(${corner[0]}, ${corner[1]}, ${corner[2]})`
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.filter = 'contrast(150%)'
  let targetX = 0
  runs.forEach(run => {
    context.drawImage(
      source,
      run.left,
      0,
      run.width,
      source.height,
      targetX * scale,
      0,
      run.width * scale,
      source.height * scale,
    )
    targetX += run.width + gap
  })
  context.filter = 'none'
  return canvas
}

function maximumChannelDifference(red: number, green: number, blue: number) {
  return Math.max(red, green, blue) - Math.min(red, green, blue)
}

function createBrowserLocalContrastMetricCanvas(
  bitmap: CanvasImageSource,
  crop: { left: number; top: number; width: number; height: number },
  scale: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width * scale))
  canvas.height = Math.max(1, Math.round(crop.height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Browser OCR local-contrast canvas is unavailable.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    bitmap,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const histogram = new Uint32Array(256)
  const grayscale = new Uint8ClampedArray(canvas.width * canvas.height)
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4
    const gray = Math.round(
      image.data[offset] * .299
      + image.data[offset + 1] * .587
      + image.data[offset + 2] * .114,
    )
    grayscale[pixel] = gray
    histogram[gray] += 1
  }
  const lower = histogramPercentile(histogram, grayscale.length, .04)
  const upper = histogramPercentile(histogram, grayscale.length, .98)
  const range = Math.max(12, upper - lower)
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const normalized = Math.max(0, Math.min(
      255,
      ((grayscale[pixel] - lower) / range) * 255,
    ))
    const value = 255 - Math.round(normalized)
    const offset = pixel * 4
    image.data[offset] = value
    image.data[offset + 1] = value
    image.data[offset + 2] = value
    image.data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function histogramPercentile(
  histogram: Uint32Array,
  sampleCount: number,
  percentile: number,
) {
  const target = sampleCount * percentile
  let accumulated = 0
  for (let value = 0; value < histogram.length; value += 1) {
    accumulated += histogram[value]
    if (accumulated >= target) return value
  }
  return histogram.length - 1
}

function createBrowserAdaptiveMetricCanvas(
  bitmap: CanvasImageSource,
  crop: { left: number; top: number; width: number; height: number },
  scale: number,
  lightText: boolean,
) {
  const canvas = document.createElement('canvas')
  canvas.width = crop.width * scale
  canvas.height = crop.height * scale
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Browser OCR adaptive-threshold canvas is unavailable.')
  context.filter = 'grayscale(1) contrast(180%)'
  context.drawImage(
    bitmap,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  context.filter = 'none'
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const grayscale = new Uint8ClampedArray(canvas.width * canvas.height)
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const pixel = y * canvas.width + x
      const offset = pixel * 4
      const gray = Math.round(
        image.data[offset] * .299
        + image.data[offset + 1] * .587
        + image.data[offset + 2] * .114,
      )
      grayscale[pixel] = gray
    }
  }
  const sharpened = new Uint8ClampedArray(grayscale)
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const pixel = y * canvas.width + x
      sharpened[pixel] = Math.max(0, Math.min(
        255,
        grayscale[pixel] * 5
        - grayscale[pixel - 1]
        - grayscale[pixel + 1]
        - grayscale[pixel - canvas.width]
        - grayscale[pixel + canvas.width],
      ))
    }
  }
  const integral = new Float64Array((canvas.width + 1) * (canvas.height + 1))
  for (let y = 0; y < canvas.height; y += 1) {
    let rowSum = 0
    for (let x = 0; x < canvas.width; x += 1) {
      rowSum += sharpened[y * canvas.width + x]
      integral[(y + 1) * (canvas.width + 1) + x + 1] =
        integral[y * (canvas.width + 1) + x + 1] + rowSum
    }
  }
  const radius = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) / 10))
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const x0 = Math.max(0, x - radius)
      const y0 = Math.max(0, y - radius)
      const x1 = Math.min(canvas.width - 1, x + radius)
      const y1 = Math.min(canvas.height - 1, y + radius)
      const sum =
        integral[(y1 + 1) * (canvas.width + 1) + x1 + 1]
        - integral[y0 * (canvas.width + 1) + x1 + 1]
        - integral[(y1 + 1) * (canvas.width + 1) + x0]
        + integral[y0 * (canvas.width + 1) + x0]
      const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1))
      const gray = sharpened[y * canvas.width + x]
      const isText = lightText ? gray > mean + 7 : gray < mean - 7
      const output = isText ? 0 : 255
      const offset = (y * canvas.width + x) * 4
      image.data[offset] = output
      image.data[offset + 1] = output
      image.data[offset + 2] = output
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function normalizeBrowserCardText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function browserVisualHints(bitmap: ImageBitmap): DashboardVisualHint[] {
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  return detectVisualDashboardHints(image.data, canvas.width, canvas.height)
    .map(hint => ({
      ...hint,
      bounding_box: {
        x: hint.bounding_box.x / scale,
        y: hint.bounding_box.y / scale,
        width: hint.bounding_box.width / scale,
        height: hint.bounding_box.height / scale,
      },
      quadrilateral: hint.quadrilateral?.map(point => ({
        x: point.x / scale,
        y: point.y / scale,
      })) as DashboardVisualHint['quadrilateral'],
    }))
}

function createNormalizedRoiCanvas(
  bitmap: ImageBitmap,
  candidate: OcrDashboardCandidate,
  targetWidth: number,
  targetHeight: number,
) {
  const sourceBox = candidate.bounding_box
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = Math.max(1, Math.ceil(sourceBox.width))
  sourceCanvas.height = Math.max(1, Math.ceil(sourceBox.height))
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Browser OCR ROI source canvas is unavailable.')
  sourceContext.drawImage(
    bitmap,
    sourceBox.x,
    sourceBox.y,
    sourceBox.width,
    sourceBox.height,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  )
  const source = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const targetCanvas = document.createElement('canvas')
  targetCanvas.width = targetWidth
  targetCanvas.height = targetHeight
  const targetContext = targetCanvas.getContext('2d', { willReadFrequently: true })
  if (!targetContext) throw new Error('Browser OCR normalized ROI canvas is unavailable.')
  const target = targetContext.createImageData(targetWidth, targetHeight)

  for (let y = 0; y < targetHeight; y += 1) {
    const normalizedY = (y + .5) / targetHeight
    for (let x = 0; x < targetWidth; x += 1) {
      const normalizedX = (x + .5) / targetWidth
      const sourcePoint = roiPointToImage(candidate, normalizedX, normalizedY)
      const sourceX = Math.max(
        0,
        Math.min(sourceCanvas.width - 1, sourcePoint.x - sourceBox.x),
      )
      const sourceY = Math.max(
        0,
        Math.min(sourceCanvas.height - 1, sourcePoint.y - sourceBox.y),
      )
      const targetOffset = (y * targetWidth + x) * 4
      const left = Math.floor(sourceX)
      const top = Math.floor(sourceY)
      const right = Math.min(sourceCanvas.width - 1, left + 1)
      const bottom = Math.min(sourceCanvas.height - 1, top + 1)
      const horizontalWeight = sourceX - left
      const verticalWeight = sourceY - top
      const offsets = [
        (top * sourceCanvas.width + left) * 4,
        (top * sourceCanvas.width + right) * 4,
        (bottom * sourceCanvas.width + left) * 4,
        (bottom * sourceCanvas.width + right) * 4,
      ]
      const weights = [
        (1 - horizontalWeight) * (1 - verticalWeight),
        horizontalWeight * (1 - verticalWeight),
        (1 - horizontalWeight) * verticalWeight,
        horizontalWeight * verticalWeight,
      ]
      for (let channel = 0; channel < 4; channel += 1) {
        target.data[targetOffset + channel] = Math.round(offsets.reduce(
          (sum, sourceOffset, index) =>
            sum + source.data[sourceOffset + channel] * weights[index],
          0,
        ))
      }
    }
  }
  targetContext.putImageData(target, 0, 0)
  return targetCanvas
}

function mapNormalizedBrowserTesseractBlocksToWords(
  blocks: BrowserTesseractBlock[] | null,
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  candidate: OcrDashboardCandidate,
  normalizedWidth: number,
  normalizedHeight: number,
  linePrefix = 'roi-label',
  evidenceGroup = 'normalized_roi:primary',
): OcrRecognizedWord[] {
  if (!blocks?.length || !normalizedWidth || !normalizedHeight) return []
  return blocks.flatMap((block, blockIndex) =>
    block.paragraphs.flatMap((paragraph, paragraphIndex) =>
      paragraph.lines.flatMap((line, lineIndex) =>
        line.words.flatMap(word => {
          const text = word.text.trim()
          if (!text) return []
          const corners = [
            roiPointToImage(candidate, word.bbox.x0 / normalizedWidth, word.bbox.y0 / normalizedHeight),
            roiPointToImage(candidate, word.bbox.x1 / normalizedWidth, word.bbox.y0 / normalizedHeight),
            roiPointToImage(candidate, word.bbox.x1 / normalizedWidth, word.bbox.y1 / normalizedHeight),
            roiPointToImage(candidate, word.bbox.x0 / normalizedWidth, word.bbox.y1 / normalizedHeight),
          ]
          const left = Math.min(...corners.map(point => point.x))
          const top = Math.min(...corners.map(point => point.y))
          const right = Math.max(...corners.map(point => point.x))
          const bottom = Math.max(...corners.map(point => point.y))
          const width = right - left
          const height = bottom - top
          if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return []
          return [{
            text,
            confidence: word.confidence,
            line_id: `${linePrefix}:${blockIndex}:${paragraphIndex}:${lineIndex}`,
            block_index: blockIndex,
            line_index: lineIndex,
            platform,
            source: 'image_ocr' as const,
            pass: 'label' as const,
            evidence_source_family: 'normalized_roi_ocr' as const,
            evidence_group: evidenceGroup,
            bounding_box: { x: left, y: top, width, height },
            x0: left,
            y0: top,
            x1: right,
            y1: bottom,
            centerX: left + width / 2,
            centerY: top + height / 2,
            width,
            height,
          }]
        }),
      ),
    ),
  )
}

interface BrowserTesseractBlock {
  paragraphs: Array<{
    lines: Array<{
      words: Array<{
        text: string
        confidence: number
        bbox: { x0: number; y0: number; x1: number; y1: number }
      }>
    }>
  }>
}

export function mapBrowserTesseractBlocksToWords(
  blocks: BrowserTesseractBlock[] | null,
  platform: ReportDashboardPlatform,
  cropOffset: { left: number; top: number },
  scale: number,
  evidenceSourceFamily: OcrEvidenceSourceFamily = 'legacy_full_image_ocr',
  evidenceGroup = 'legacy_full_image:primary',
): OcrRecognizedWord[] {
  if (!blocks?.length || !Number.isFinite(scale) || scale <= 0) return []
  return blocks.flatMap((block, blockIndex) =>
    block.paragraphs.flatMap((paragraph, paragraphIndex) =>
      paragraph.lines.flatMap((line, lineIndex) =>
        line.words.flatMap(word => {
          const text = word.text.trim()
          if (!text) return []
          const x = cropOffset.left + word.bbox.x0 / scale
          const y = cropOffset.top + word.bbox.y0 / scale
          const width = (word.bbox.x1 - word.bbox.x0) / scale
          const height = (word.bbox.y1 - word.bbox.y0) / scale
          if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return []
          return [{
            text,
            confidence: word.confidence,
            line_id: `label:${blockIndex}:${paragraphIndex}:${lineIndex}`,
            block_index: blockIndex,
            line_index: lineIndex,
            platform,
            source: 'image_ocr' as const,
            pass: 'label' as const,
            evidence_source_family: evidenceSourceFamily,
            evidence_group: evidenceGroup,
            bounding_box: { x, y, width, height },
            x0: x,
            y0: y,
            x1: x + width,
            y1: y + height,
            centerX: x + width / 2,
            centerY: y + height / 2,
            width,
            height,
          }]
        }),
      ),
    ),
  )
}
