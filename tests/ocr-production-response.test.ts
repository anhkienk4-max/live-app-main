import assert from 'node:assert/strict'
import test from 'node:test'

import { POST } from '../app/api/ocr/route.ts'
import { ocrService } from '../lib/services/dataService.ts'
import {
  OcrApiResponseError,
  parseOcrApiResponse,
} from '../lib/services/imageOcrService.ts'
import {
  ocrErrorResponse,
  ocrSuccessResponse,
} from '../lib/services/ocrApiContract.ts'
import type { OcrImageRecognition } from '../lib/types/database.types.ts'
import { mergeMetricValues, reviewInputValues } from '../lib/utils/ocrReview.ts'

const recognition: OcrImageRecognition = {
  engine: 'tesseract.js',
  language: 'eng+vie',
  text: 'Sales 0',
  pass_output: {
    label: 'Sales 0',
    numeric: '0',
    card: {},
  },
  confidence: 90,
  words: [],
  crop_box: { left: 0, top: 0, width: 1, height: 1 },
  original_dimensions: { width: 1920, height: 1080 },
  processed_dimensions: { width: 3840, height: 2160 },
}

test('OCR API success responses are structured JSON and the client unwraps data', async () => {
  const response = ocrSuccessResponse(recognition)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') || '', /application\/json/)

  const parsed = await parseOcrApiResponse(response)
  assert.deepEqual(parsed, recognition)
})

test('OCR API errors are structured JSON and the client reports the safe message', async () => {
  const response = ocrErrorResponse('OCR_PROCESSING_FAILED', 'Image recognition failed.', 500)
  assert.equal(response.status, 500)
  assert.match(response.headers.get('content-type') || '', /application\/json/)

  await assert.rejects(
    () => parseOcrApiResponse(response),
    (error: unknown) => {
      assert.equal(error instanceof OcrApiResponseError, true)
      assert.equal((error as OcrApiResponseError).status, 500)
      assert.equal((error as OcrApiResponseError).code, 'OCR_PROCESSING_FAILED')
      assert.equal((error as Error).message, 'Image recognition failed.')
      return true
    },
  )
})

test('unauthenticated OCR route validation returns JSON instead of a redirect', async () => {
  const request = new Request('http://localhost/api/ocr', {
    method: 'POST',
    body: new FormData(),
  })
  const response = await POST(request)
  assert.equal(response.status, 400)
  assert.equal(response.headers.get('location'), null)
  assert.match(response.headers.get('content-type') || '', /application\/json/)
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: 'IMAGE_REQUIRED',
      message: 'An image file is required.',
    },
  })
})

test('HTML OCR responses produce a controlled non-JSON error, never a JSON SyntaxError', async () => {
  const response = new Response('<!DOCTYPE html><html><body>Login</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })

  await assert.rejects(
    () => parseOcrApiResponse(response),
    (error: unknown) => {
      assert.equal(error instanceof SyntaxError, false)
      assert.equal(error instanceof OcrApiResponseError, true)
      assert.match((error as Error).message, /unexpected non-JSON response/)
      assert.doesNotMatch((error as Error).message, /<!DOCTYPE/)
      return true
    },
  )
})

test('raw Tesseract text autofills metrics when the image OCR API returns HTML', async () => {
  const originalFetch = globalThis.fetch
  let callCount = 0
  globalThis.fetch = async () => {
    callCount += 1
    if (callCount === 1) {
      return new Response(new Blob(['image-bytes'], { type: 'image/png' }), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    }
    return new Response('<!DOCTYPE html><html><body>Production error</body></html>', {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  try {
    const review = await ocrService.extractDashboardMetrics(
      'shopee_live',
      [
        'Sales: 21.281.718,00',
        'Engaged Viewer: 521',
        'Comments: 0',
        'Comments Rate: 6,58%',
        'Orders: 109',
        'ABS: NaN',
      ].join('\n'),
      'blob:dashboard-image',
    )

    assert.equal(callCount, 2)
    assert.equal(review.status, 'review_required')
    assert.equal(review.metrics.sales?.value, 21281718)
    assert.equal(review.metrics.engaged_viewers?.value, 521)
    assert.equal(review.metrics.comments?.value, 0)
    assert.equal(review.metrics.comment_rate?.value, 6.58)
    assert.equal(review.metrics.orders?.value, 109)
    assert.equal(review.metrics.average_basket_size, undefined)
    assert.match(review.error_message || '', /populated from the available OCR text/)

    const existingFormState = {
      replayUrl: 'https://example.test/replay',
      notes: 'Keep this note',
      metrics: { revenue: '10', orders: '7' },
    }
    const nextFormState = {
      ...existingFormState,
      metrics: mergeMetricValues(
        existingFormState.metrics,
        reviewInputValues(review),
      ),
    }

    assert.equal(nextFormState.replayUrl, existingFormState.replayUrl)
    assert.equal(nextFormState.notes, existingFormState.notes)
    assert.equal(nextFormState.metrics.revenue, '10')
    assert.equal(nextFormState.metrics.sales, '21281718')
    assert.equal(nextFormState.metrics.comments, '0')
    assert.equal('average_basket_size' in nextFormState.metrics, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

