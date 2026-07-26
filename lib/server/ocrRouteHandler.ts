import type {
  OcrCropBox,
  OcrImageRecognition,
  OcrRecognizedWord,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import { ocrErrorResponse, ocrSuccessResponse } from '@/lib/services/ocrApiContract'
import { clampOcrCrop, defaultOcrCrop } from '@/lib/utils/ocrImage'
import { platformMetricLayouts, type LayoutMetricCell } from '@/lib/utils/ocrMetrics'

const maxImageBytes = 10 * 1024 * 1024
const supportedPlatforms = new Set<ReportDashboardPlatform>(['shopee_live', 'tiktok_shop'])
const preprocessScale = 2
const serverFailureMessage = 'Server OCR unavailable; local browser OCR fallback was used.'

type LanguageData = {
  langPath: string
}

export type OcrServerDependencies = {
  sharp: typeof import('sharp')['default']
  createWorker: typeof import('tesseract.js')['createWorker']
  OEM: typeof import('tesseract.js')['OEM']
  PSM: typeof import('tesseract.js')['PSM']
  englishData: LanguageData
  vietnameseData: LanguageData
  copyFile: typeof import('node:fs/promises')['copyFile']
  mkdir: typeof import('node:fs/promises')['mkdir']
  tmpdir: typeof import('node:os')['tmpdir']
  join: typeof import('node:path')['join']
}

type OcrWorker = Awaited<ReturnType<OcrServerDependencies['createWorker']>>
type OcrDependencyLoader = () => Promise<OcrServerDependencies>

export async function loadOcrServerDependencies(): Promise<OcrServerDependencies> {
  const [
    sharpModule,
    tesseractModule,
    englishModule,
    vietnameseModule,
    fsPromises,
    osModule,
    pathModule,
  ] = await Promise.all([
    import('sharp'),
    import('tesseract.js'),
    import('@tesseract.js-data/eng'),
    import('@tesseract.js-data/vie'),
    import('node:fs/promises'),
    import('node:os'),
    import('node:path'),
  ])

  return {
    sharp: sharpModule.default,
    createWorker: tesseractModule.createWorker,
    OEM: tesseractModule.OEM,
    PSM: tesseractModule.PSM,
    englishData: englishModule.default,
    vietnameseData: vietnameseModule.default,
    copyFile: fsPromises.copyFile,
    mkdir: fsPromises.mkdir,
    tmpdir: osModule.tmpdir,
    join: pathModule.join,
  }
}

export function createOcrPostHandler(options?: {
  loadDependencies?: OcrDependencyLoader
  serverOcrEnabled?: () => boolean
}) {
  const loadDependencies = options?.loadDependencies || loadOcrServerDependencies
  const serverOcrEnabled = options?.serverOcrEnabled || isServerOcrEnabled

  return async function POST(request: Request) {
    try {
      if (!serverOcrEnabled()) {
        return serverOcrFailureResponse()
      }

      const formData = await request.formData()
      const image = formData.get('image')
      const platform = String(formData.get('platform') || 'other') as ReportDashboardPlatform

      if (!(image instanceof File)) {
        return ocrErrorResponse('IMAGE_REQUIRED', 'An image file is required.', 400)
      }
      if (!image.type.startsWith('image/')) {
        return ocrErrorResponse('UNSUPPORTED_FILE', 'Only image files can be processed.', 415)
      }
      if (image.size > maxImageBytes) {
        return ocrErrorResponse('IMAGE_TOO_LARGE', 'The dashboard image must be 10 MB or smaller.', 413)
      }
      if (!supportedPlatforms.has(platform)) {
        return ocrErrorResponse('UNSUPPORTED_PLATFORM', 'Select TikTok Shop or Shopee Live before scanning.', 400)
      }

      const imageBytes = Buffer.from(await image.arrayBuffer())
      const dependencies = await loadDependencies()
      const metadata = await dependencies.sharp(imageBytes).metadata()
      if (!metadata.width || !metadata.height) {
        return ocrErrorResponse('INVALID_IMAGE', 'The dashboard image dimensions could not be read.', 422)
      }

      const requestedCrop = parseCropBox(formData.get('crop'))
      const cropBox = clampOcrCrop(requestedCrop || defaultOcrCrop(platform))
      const pixelCrop = toPixelCrop(cropBox, metadata.width, metadata.height)
      const processedWidth = pixelCrop.width * preprocessScale
      const processedHeight = pixelCrop.height * preprocessScale
      const basePipeline = () => dependencies.sharp(imageBytes)
        .extract(pixelCrop)
        .resize({
          width: processedWidth,
          height: processedHeight,
          fit: 'fill',
          kernel: dependencies.sharp.kernel.lanczos3,
        })
        .grayscale()
        .normalize()
        .sharpen({ sigma: platform === 'shopee_live' ? 0.9 : 1.2 })

      const [labelImage, numericImage] = await Promise.all([
        basePipeline().png().toBuffer(),
        basePipeline()
          .linear(platform === 'shopee_live' ? 1.25 : 1.4, platform === 'shopee_live' ? -18 : -28)
          .threshold(platform === 'shopee_live' ? 175 : 150)
          .png()
          .toBuffer(),
      ])

      const modelPath = await prepareCombinedLanguageModels(dependencies)
      let worker: OcrWorker | undefined
      try {
        worker = await dependencies.createWorker('eng+vie', dependencies.OEM.LSTM_ONLY, {
          langPath: modelPath,
          gzip: true,
          cachePath: dependencies.join(dependencies.tmpdir(), 'livestream-ops-tesseract-cache'),
        })

        await worker.setParameters({
          tessedit_pageseg_mode: dependencies.PSM.SPARSE_TEXT,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        })
        const labelResult = await worker.recognize(
          labelImage,
          { rotateAuto: false },
          { text: true, blocks: true },
        )

        await worker.setParameters({
          tessedit_pageseg_mode: dependencies.PSM.SPARSE_TEXT,
          tessedit_char_whitelist: '0123456789.,:%KMkm₫đ$-/',
          preserve_interword_spaces: '1',
        })
        const numericResult = await worker.recognize(
          numericImage,
          { rotateAuto: false },
          { text: true, blocks: true },
        )
        const cardRecognition = await recognizeMetricCards(
          dependencies,
          worker,
          imageBytes,
          platform as Exclude<ReportDashboardPlatform, 'other'>,
          metadata.width,
          metadata.height,
        )

        const words = mergePassWords([
          ...flattenWords(labelResult.data.blocks, 'label', platform, pixelCrop),
          ...flattenWords(numericResult.data.blocks, 'numeric', platform, pixelCrop),
        ]).concat(cardRecognition.words)
        const response: OcrImageRecognition = {
          engine: 'tesseract.js',
          language: 'eng+vie',
          text: labelResult.data.text.trim(),
          pass_output: {
            label: labelResult.data.text.trim(),
            numeric: numericResult.data.text.trim(),
            card: cardRecognition.output,
          },
          confidence: Math.min(labelResult.data.confidence, numericResult.data.confidence),
          words,
          crop_box: cropBox,
          original_dimensions: { width: metadata.width, height: metadata.height },
          processed_dimensions: { width: processedWidth, height: processedHeight },
        }
        return ocrSuccessResponse(response)
      } finally {
        await worker?.terminate()
      }
    } catch (error) {
      console.error(
        'Dashboard server OCR failed:',
        error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown OCR server error',
      )
      return serverOcrFailureResponse()
    }
  }
}

function isServerOcrEnabled() {
  // Vercel serverless does not provide a reliable environment for this
  // native/WASM/worker pipeline. Browser OCR remains the production path.
  return process.env.VERCEL !== '1' && !process.env.VERCEL_ENV
}

function serverOcrFailureResponse() {
  return ocrErrorResponse('OCR_SERVER_FAILED', serverFailureMessage, 503)
}

async function recognizeMetricCards(
  dependencies: OcrServerDependencies,
  worker: OcrWorker,
  imageBytes: Buffer,
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  imageWidth: number,
  imageHeight: number,
) {
  const output: Record<string, string[]> = {}
  const words: OcrRecognizedWord[] = []

  await worker.setParameters({
    tessedit_pageseg_mode: dependencies.PSM.SINGLE_LINE,
    tessedit_char_whitelist: '0123456789.,:%KMkm₫đ$-/',
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })

  for (const cell of platformMetricLayouts[platform]) {
    const crop = toMetricCellCrop(cell, imageWidth, imageHeight, platform)
    const resizeScale = platform === 'tiktok_shop' ? 7 : 5
    const basePipeline = () => dependencies.sharp(imageBytes)
      .extract(crop)
      .resize({
        width: crop.width * resizeScale,
        height: crop.height * resizeScale,
        fit: 'fill',
        kernel: dependencies.sharp.kernel.lanczos3,
      })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.1 })
      .negate()
    const primaryImage = await basePipeline().png().toBuffer()
    const primaryResult = await worker.recognize(primaryImage, { rotateAuto: false }, { text: true })
    const primaryText = normalizeCardText(primaryResult.data.text)
    const variants = [{ text: primaryText, confidence: primaryResult.data.confidence, crop }]

    if (!/\d/.test(primaryText) || primaryResult.data.confidence < 60) {
      const thresholdImage = await basePipeline().threshold(175).png().toBuffer()
      const thresholdResult = await worker.recognize(thresholdImage, { rotateAuto: false }, { text: true })
      variants.push({
        text: normalizeCardText(thresholdResult.data.text),
        confidence: thresholdResult.data.confidence,
        crop,
      })
    }
    if (
      platform === 'tiktok_shop'
      && ['total_views', 'advertising_cost', 'roi_gmv_max', 'estimated_gmv'].includes(cell.key)
    ) {
      const legacyCrop = toMetricCellCrop(cell, imageWidth, imageHeight, platform, true)
      const legacyImage = await dependencies.sharp(imageBytes)
        .extract(legacyCrop)
        .resize({
          width: legacyCrop.width * 5,
          height: legacyCrop.height * 5,
          fit: 'fill',
          kernel: dependencies.sharp.kernel.lanczos3,
        })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.1 })
        .negate()
        .png()
        .toBuffer()
      const legacyResult = await worker.recognize(legacyImage, { rotateAuto: false }, { text: true })
      variants.push({
        text: normalizeCardText(legacyResult.data.text),
        confidence: legacyResult.data.confidence,
        crop: legacyCrop,
      })
    }

    output[cell.key] = variants.map(variant => variant.text)
    variants.forEach((variant, variantIndex) => {
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

  return { output, words }
}

function normalizeCardText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function toMetricCellCrop(
  cell: LayoutMetricCell,
  imageWidth: number,
  imageHeight: number,
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  useFullHeight = false,
) {
  const width = Math.max(1, Math.round(cell.width * imageWidth))
  const valueHeight = platform === 'tiktok_shop' && cell.key !== 'gmv' && !useFullHeight
    ? Math.min(cell.height, .038)
    : cell.height
  const height = Math.max(1, Math.round(valueHeight * imageHeight))
  const left = Math.max(0, Math.min(imageWidth - width, Math.round(cell.x * imageWidth - width / 2)))
  const top = Math.max(0, Math.min(imageHeight - height, Math.round(cell.y * imageHeight - height / 2)))
  return { left, top, width, height }
}

async function prepareCombinedLanguageModels(dependencies: OcrServerDependencies) {
  const modelPath = dependencies.join(dependencies.tmpdir(), 'livestream-ops-tesseract-models')
  await dependencies.mkdir(modelPath, { recursive: true })
  await Promise.all([
    dependencies.copyFile(
      dependencies.join(dependencies.englishData.langPath, 'eng.traineddata.gz'),
      dependencies.join(modelPath, 'eng.traineddata.gz'),
    ),
    dependencies.copyFile(
      dependencies.join(dependencies.vietnameseData.langPath, 'vie.traineddata.gz'),
      dependencies.join(modelPath, 'vie.traineddata.gz'),
    ),
  ])
  return modelPath
}

function parseCropBox(value: FormDataEntryValue | null): OcrCropBox | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = JSON.parse(value) as Partial<OcrCropBox>
    if (![parsed.left, parsed.top, parsed.width, parsed.height].every(item => typeof item === 'number')) return null
    return parsed as OcrCropBox
  } catch {
    return null
  }
}

function toPixelCrop(crop: OcrCropBox, imageWidth: number, imageHeight: number) {
  const left = Math.max(0, Math.floor(crop.left * imageWidth))
  const top = Math.max(0, Math.floor(crop.top * imageHeight))
  const width = Math.max(1, Math.min(imageWidth - left, Math.round(crop.width * imageWidth)))
  const height = Math.max(1, Math.min(imageHeight - top, Math.round(crop.height * imageHeight)))
  return { left, top, width, height }
}

function flattenWords(
  blocks: Tesseract.Block[] | null,
  pass: OcrRecognizedWord['pass'],
  platform: ReportDashboardPlatform,
  crop: { left: number; top: number },
): OcrRecognizedWord[] {
  return (blocks || []).flatMap((block, blockIndex) =>
    block.paragraphs.flatMap((paragraph, paragraphIndex) =>
      paragraph.lines.flatMap((line, lineIndex) =>
        line.words.map(word => {
          const x0 = crop.left + word.bbox.x0 / preprocessScale
          const y0 = crop.top + word.bbox.y0 / preprocessScale
          const width = (word.bbox.x1 - word.bbox.x0) / preprocessScale
          const height = (word.bbox.y1 - word.bbox.y0) / preprocessScale
          return {
            text: word.text,
            confidence: word.confidence,
            line_id: `${pass}:${blockIndex}:${paragraphIndex}:${lineIndex}`,
            block_index: blockIndex,
            line_index: lineIndex,
            platform,
            source: 'image_ocr' as const,
            pass,
            bounding_box: { x: x0, y: y0, width, height },
            x0,
            y0,
            x1: x0 + width,
            y1: y0 + height,
            centerX: x0 + width / 2,
            centerY: y0 + height / 2,
            width,
            height,
          }
        }),
      ),
    ),
  )
}

function mergePassWords(words: OcrRecognizedWord[]) {
  return words.filter((word, index) => !words.slice(0, index).some(existing =>
    existing.pass !== word.pass &&
    normalizeToken(existing.text) === normalizeToken(word.text) &&
    boxDistance(existing.bounding_box, word.bounding_box) < 12,
  ))
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}%.,:-]/gu, '')
}

function boxDistance(
  left: OcrRecognizedWord['bounding_box'],
  right: OcrRecognizedWord['bounding_box'],
) {
  const leftX = left.x + left.width / 2
  const leftY = left.y + left.height / 2
  const rightX = right.x + right.width / 2
  const rightY = right.y + right.height / 2
  return Math.hypot(leftX - rightX, leftY - rightY)
}
