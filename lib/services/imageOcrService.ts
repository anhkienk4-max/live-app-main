import type {
  OcrCropBox,
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
  platformMetricLayouts,
  type LayoutMetricCell,
} from '@/lib/utils/ocrMetrics'

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
  const cropBox = clampOcrCrop(requestedCrop || defaultOcrCrop(platform))
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  const left = Math.max(0, Math.floor(cropBox.left * originalWidth))
  const top = Math.max(0, Math.floor(cropBox.top * originalHeight))
  const width = Math.max(1, Math.min(originalWidth - left, Math.round(cropBox.width * originalWidth)))
  const height = Math.max(1, Math.min(originalHeight - top, Math.round(cropBox.height * originalHeight)))
  const browserPreprocessScale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * browserPreprocessScale
  canvas.height = height * browserPreprocessScale
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Browser OCR canvas is unavailable.')
  }
  context.drawImage(bitmap, left, top, width, height, 0, 0, canvas.width, canvas.height)

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
    const labelWords = mapBrowserTesseractBlocksToWords(
      result.data.blocks,
      platform,
      { left, top },
      browserPreprocessScale,
    )
    const cardRecognition = platform === 'other'
      ? { output: undefined, labels: undefined, words: [] }
      : await recognizeMetricCardsInBrowser(worker, bitmap, platform, PSM)
    return {
      engine: 'tesseract.js',
      language: 'eng+vie',
      text,
      pass_output: {
        label: text,
        numeric: '',
        card: cardRecognition.output,
        card_labels: cardRecognition.labels,
      },
      confidence: result.data.confidence,
      words: [...labelWords, ...cardRecognition.words],
      crop_box: cropBox,
      original_dimensions: { width: originalWidth, height: originalHeight },
      processed_dimensions: { width: canvas.width, height: canvas.height },
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
  bitmap: ImageBitmap,
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  psm: BrowserPsm,
) {
  const output: Record<string, string[]> = {}
  const labels: Record<string, string[]> = {}
  const words: OcrRecognizedWord[] = []

  for (const cell of platformMetricLayouts[platform]) {
    const labelCrop = browserMetricLabelCrop(cell, bitmap.width, bitmap.height, platform)
    await worker.setParameters({
      tessedit_pageseg_mode: psm.SINGLE_LINE,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ()-/.đĐ',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const labelCanvas = createBrowserMetricCanvas(bitmap, labelCrop, 3)
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
        labelCrop,
        platform,
        'label',
      ))
    }

    const crop = browserMetricCellCrop(cell, bitmap.width, bitmap.height, platform)
    const scale = platform === 'tiktok_shop' ? 7 : 5
    await worker.setParameters({
      tessedit_pageseg_mode: browserValuePsm(cell, psm),
      tessedit_char_whitelist: browserValueWhitelist(cell),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const primaryCanvas = createBrowserMetricCanvas(bitmap, crop, scale)
    const primaryResult = await worker.recognize(
      primaryCanvas,
      { rotateAuto: false },
      { text: true },
    )
    const variants = [{
      text: normalizeBrowserCardText(primaryResult.data.text),
      confidence: primaryResult.data.confidence,
      crop,
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
      const thresholdCanvas = createBrowserMetricCanvas(bitmap, crop, scale, 175)
      const thresholdResult = await worker.recognize(
        thresholdCanvas,
        { rotateAuto: false },
        { text: true },
      )
      variants.push({
        text: normalizeBrowserCardText(thresholdResult.data.text),
        confidence: thresholdResult.data.confidence,
        crop,
      })
      const adaptiveCanvas = createBrowserAdaptiveMetricCanvas(bitmap, crop, scale, true)
      const adaptiveResult = await worker.recognize(
        adaptiveCanvas,
        { rotateAuto: false },
        { text: true },
      )
      variants.push({
        text: normalizeBrowserCardText(adaptiveResult.data.text),
        confidence: adaptiveResult.data.confidence,
        crop,
      })
      if (!/\d/.test(adaptiveResult.data.text) || adaptiveResult.data.confidence < 60) {
        const normalAdaptiveCanvas = createBrowserAdaptiveMetricCanvas(bitmap, crop, scale, false)
        const normalAdaptiveResult = await worker.recognize(
          normalAdaptiveCanvas,
          { rotateAuto: false },
          { text: true },
        )
        variants.push({
          text: normalizeBrowserCardText(normalAdaptiveResult.data.text),
          confidence: normalAdaptiveResult.data.confidence,
          crop,
        })
      }
    }
    if (
      platform === 'tiktok_shop'
      && ['total_views', 'advertising_cost', 'roi_gmv_max', 'estimated_gmv'].includes(cell.key)
    ) {
      const legacyCrop = browserMetricCellCrop(cell, bitmap.width, bitmap.height, platform, true)
      const legacyCanvas = createBrowserMetricCanvas(bitmap, legacyCrop, 5)
      const legacyResult = await worker.recognize(
        legacyCanvas,
        { rotateAuto: false },
        { text: true },
      )
      variants.push({
        text: normalizeBrowserCardText(legacyResult.data.text),
        confidence: legacyResult.data.confidence,
        crop: legacyCrop,
      })
    }
    const rankedVariants = [...variants].sort((left, right) => left.confidence - right.confidence)
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

function browserValueWhitelist(cell: LayoutMetricCell) {
  if (cell.valueKind === 'count') return '0123456789'
  if (cell.valueKind === 'percentage') return '0123456789.,%'
  if (cell.valueKind === 'duration') return '0123456789:'
  if (cell.valueKind === 'compact') return '0123456789.,KkMm'
  return '0123456789.,'
}

function browserValuePsm(cell: LayoutMetricCell, psm: BrowserPsm) {
  return ['currency', 'compact', 'ratio'].includes(cell.valueKind)
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
    ? Math.min(cell.height, .038)
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
  const normalizedHeight = platform === 'tiktok_shop' ? .032 : .027
  const centerY = cell.y - (platform === 'tiktok_shop' ? .033 : .030)
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
  bitmap: ImageBitmap,
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
    const value = threshold === undefined ? inverted : inverted >= threshold ? 255 : 0
    image.data[offset] = value
    image.data[offset + 1] = value
    image.data[offset + 2] = value
    image.data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function createBrowserAdaptiveMetricCanvas(
  bitmap: ImageBitmap,
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
