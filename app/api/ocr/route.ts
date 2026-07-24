import { copyFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import englishData from '@tesseract.js-data/eng'
import vietnameseData from '@tesseract.js-data/vie'
import sharp from 'sharp'
import { createWorker, OEM, PSM } from 'tesseract.js'
import type {
  OcrCropBox,
  OcrImageRecognition,
  OcrRecognizedWord,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import { ocrErrorResponse, ocrSuccessResponse } from '@/lib/services/ocrApiContract'
import { clampOcrCrop, defaultOcrCrop } from '@/lib/utils/ocrImage'
import { platformMetricLayouts, type LayoutMetricCell } from '@/lib/utils/ocrMetrics'

export const runtime = 'nodejs'
export const maxDuration = 60

const maxImageBytes = 10 * 1024 * 1024
const supportedPlatforms = new Set<ReportDashboardPlatform>(['shopee_live', 'tiktok_shop'])
const preprocessScale = 2

export async function POST(request: Request) {
  try {
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
    const metadata = await sharp(imageBytes).metadata()
    if (!metadata.width || !metadata.height) {
      return ocrErrorResponse('INVALID_IMAGE', 'The dashboard image dimensions could not be read.', 422)
    }

    const requestedCrop = parseCropBox(formData.get('crop'))
    const cropBox = clampOcrCrop(requestedCrop || defaultOcrCrop(platform))
    const pixelCrop = toPixelCrop(cropBox, metadata.width, metadata.height)
    const processedWidth = pixelCrop.width * preprocessScale
    const processedHeight = pixelCrop.height * preprocessScale
    const basePipeline = () => sharp(imageBytes)
      .extract(pixelCrop)
      .resize({
        width: processedWidth,
        height: processedHeight,
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
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

    const modelPath = await prepareCombinedLanguageModels()
    const worker = await createWorker('eng+vie', OEM.LSTM_ONLY, {
      langPath: modelPath,
      gzip: true,
      cachePath: join(tmpdir(), 'livestream-ops-tesseract-cache'),
    })

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })
      const labelResult = await worker.recognize(
        labelImage,
        { rotateAuto: false },
        { text: true, blocks: true },
      )

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: '0123456789.,:%KMkm₫đ$-/',
        preserve_interword_spaces: '1',
      })
      const numericResult = await worker.recognize(
        numericImage,
        { rotateAuto: false },
        { text: true, blocks: true },
      )
      const cardRecognition = await recognizeMetricCards(
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
      await worker.terminate()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image recognition failed.'
    console.error('Dashboard OCR failed:', message)
    const timedOut = /timed?\s*out|timeout/i.test(message)
    return ocrErrorResponse(
      timedOut ? 'OCR_TIMEOUT' : 'OCR_PROCESSING_FAILED',
      timedOut ? 'Image recognition timed out.' : 'Image recognition failed.',
      timedOut ? 504 : 500,
    )
  }
}

async function recognizeMetricCards(
  worker: Awaited<ReturnType<typeof createWorker>>,
  imageBytes: Buffer,
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  imageWidth: number,
  imageHeight: number,
) {
  const output: Record<string, string[]> = {}
  const words: OcrRecognizedWord[] = []

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: '0123456789.,:%KMkmâ‚«Ä‘$-/',
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })

  for (const cell of platformMetricLayouts[platform]) {
    const crop = toMetricCellCrop(cell, imageWidth, imageHeight)
    const basePipeline = () => sharp(imageBytes)
      .extract(crop)
      .resize({
        width: crop.width * 5,
        height: crop.height * 5,
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.1 })
      .negate()
    const primaryImage = await basePipeline().png().toBuffer()
    const primaryResult = await worker.recognize(primaryImage, { rotateAuto: false }, { text: true })
    const primaryText = normalizeCardText(primaryResult.data.text)
    const variants = [{ text: primaryText, confidence: primaryResult.data.confidence }]

    if (!/\d/.test(primaryText) || primaryResult.data.confidence < 60) {
      const thresholdImage = await basePipeline().threshold(175).png().toBuffer()
      const thresholdResult = await worker.recognize(thresholdImage, { rotateAuto: false }, { text: true })
      variants.push({
        text: normalizeCardText(thresholdResult.data.text),
        confidence: thresholdResult.data.confidence,
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
          x: crop.left,
          y: crop.top,
          width: crop.width,
          height: crop.height,
        },
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
) {
  const width = Math.max(1, Math.round(cell.width * imageWidth))
  const height = Math.max(1, Math.round(cell.height * imageHeight))
  const left = Math.max(0, Math.min(imageWidth - width, Math.round(cell.x * imageWidth - width / 2)))
  const top = Math.max(0, Math.min(imageHeight - height, Math.round(cell.y * imageHeight - height / 2)))
  return { left, top, width, height }
}

async function prepareCombinedLanguageModels() {
  const modelPath = join(tmpdir(), 'livestream-ops-tesseract-models')
  await mkdir(modelPath, { recursive: true })
  await Promise.all([
    copyFile(join(englishData.langPath, 'eng.traineddata.gz'), join(modelPath, 'eng.traineddata.gz')),
    copyFile(join(vietnameseData.langPath, 'vie.traineddata.gz'), join(modelPath, 'vie.traineddata.gz')),
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
        line.words.map(word => ({
          text: word.text,
          confidence: word.confidence,
          line_id: `${pass}:${blockIndex}:${paragraphIndex}:${lineIndex}`,
          block_index: blockIndex,
          line_index: lineIndex,
          platform,
          source: 'image_ocr',
          pass,
          bounding_box: {
            x: crop.left + word.bbox.x0 / preprocessScale,
            y: crop.top + word.bbox.y0 / preprocessScale,
            width: (word.bbox.x1 - word.bbox.x0) / preprocessScale,
            height: (word.bbox.y1 - word.bbox.y0) / preprocessScale,
          },
        })),
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
