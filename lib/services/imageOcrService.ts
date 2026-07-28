import type {
  OcrCropBox,
  OcrDashboardCandidate,
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
  roiCellBoundingBox,
  roiPointToImage,
  type DashboardVisualHint,
} from '@/lib/utils/dashboardRegionDetection'

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
  const [{ createWorker, OEM, PSM }, bitmap] = await Promise.all([
    import('tesseract.js'),
    createImageBitmap(imageBlob),
  ])
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  const requested = clampOcrCrop(requestedCrop || defaultOcrCrop(platform))
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

  const worker = await createWorker('eng+vie', OEM.LSTM_ONLY)
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
    let selectedWords = fullImageWords
    let cardRecognition: Awaited<ReturnType<typeof recognizeMetricCardsInBrowser>> = {
      output: {},
      labels: {},
      words: [],
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
      )
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
      },
      confidence: result.data.confidence,
      words: [...selectedWords, ...cardRecognition.words],
      crop_box: selected?.crop_box || requested,
      original_dimensions: { width: originalWidth, height: originalHeight },
      processed_dimensions: { width: canvas.width, height: canvas.height },
      region_diagnostics: regionResult.diagnostics,
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
) {
  const output: Record<string, string[]> = {}
  const labels: Record<string, string[]> = {}
  const words: OcrRecognizedWord[] = []

  for (const cell of platformRoiMetricLayouts[platform]) {
    // Shopee social/live-preview metrics sit outside the orange KPI panel. They
    // remain available through anchor text, but are not cropped from this ROI.
    if (cell.x < 0 || cell.x > 1 || cell.y < 0 || cell.y > 1) continue
    const labelOriginalBox = roiCellBoundingBox(candidate, cell, 'label')
    const labelOriginalCrop = {
      left: labelOriginalBox.x,
      top: labelOriginalBox.y,
      width: labelOriginalBox.width,
      height: labelOriginalBox.height,
    }
    const labelCrop = candidate.perspective_correction_applied
      ? browserMetricLabelCrop(
        cell,
        normalizedCanvas.width,
        normalizedCanvas.height,
        platform,
      )
      : labelOriginalCrop
    const cardSource = candidate.perspective_correction_applied
      ? normalizedCanvas
      : originalBitmap
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
      ))
    }

    const originalBox = roiCellBoundingBox(candidate, cell, 'value')
    const originalCrop = {
      left: originalBox.x,
      top: originalBox.y,
      width: originalBox.width,
      height: originalBox.height,
    }
    const crop = candidate.perspective_correction_applied
      ? browserMetricCellCrop(
        cell,
        normalizedCanvas.width,
        normalizedCanvas.height,
        platform,
      )
      : originalCrop
    const scale = platform === 'tiktok_shop' ? 7 : 5
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
    }]
    const alwaysThreshold = platform === 'tiktok_shop'
      ? ['click_rate', 'average_order_value', 'live_ctr'].includes(cell.key)
      : ['sales', 'comment_rate', 'gpm', 'ctr'].includes(cell.key)
    const lowConfidenceRetry = cell.valueKind !== 'count' && variants[0].confidence < 60
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
      })
      const adaptiveCanvas = createBrowserAdaptiveMetricCanvas(cardSource, crop, scale, true)
      const adaptiveResult = await worker.recognize(
        adaptiveCanvas,
        { rotateAuto: false },
        { text: true },
      )
      variants.push({
        text: normalizeBrowserCardText(adaptiveResult.data.text),
        confidence: adaptiveResult.data.confidence,
        crop: originalCrop,
      })
      if (!/\d/.test(adaptiveResult.data.text) || adaptiveResult.data.confidence < 60) {
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
  return { output, labels, words }
}

function reconstructCompactCardValue(
  cell: LayoutMetricCell,
  variants: Array<{
    text: string
    confidence: number
    crop: { left: number; top: number; width: number; height: number }
  }>,
) {
  const text = reconstructCompactOcrValue(cell, variants.map(variant => variant.text))
  if (!text) return null
  return {
    text,
    confidence: Math.min(...variants.map(variant => variant.confidence)),
    crop: variants[0].crop,
  }
}

function browserValueWhitelist(cell: LayoutMetricCell) {
  if (cell.valueKind === 'count') return '0123456789'
  if (cell.valueKind === 'percentage') return '0123456789.,%'
  if (cell.valueKind === 'duration') return '0123456789:'
  if (cell.valueKind === 'compact') return '0123456789.,KkMm'
  return '0123456789.,'
}

function browserValuePsm(cell: LayoutMetricCell, psm: BrowserPsm) {
  return ['currency', 'ratio'].includes(cell.valueKind)
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
