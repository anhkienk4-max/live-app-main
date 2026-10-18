import assert from 'node:assert/strict'
import test from 'node:test'

import { proposeTikTokKpiCrop } from '../lib/services/imageOcrService.ts'
import { OCR_RUNTIME_CONFIG } from '../lib/services/ocrRuntimeConfig.ts'

function withBrowserImageMocks<T>(
  fetchResponse: Response,
  decode: () => Promise<ImageBitmap>,
  operation: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch
  const bitmapDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
  globalThis.fetch = async () => fetchResponse
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: decode,
  })
  return operation().finally(() => {
    globalThis.fetch = originalFetch
    if (bitmapDescriptor) Object.defineProperty(globalThis, 'createImageBitmap', bitmapDescriptor)
    else Reflect.deleteProperty(globalThis, 'createImageBitmap')
  })
}

test('TikTok crop proposal rejects unsupported image types before browser decode', async () => {
  let decodeCalls = 0
  await withBrowserImageMocks(
    new Response(new Blob(['image'], { type: 'image/gif' })),
    async () => {
      decodeCalls += 1
      throw new Error('decode should not run')
    },
    () => assert.rejects(proposeTikTokKpiCrop('blob:unsupported'), /Only PNG, JPEG, and WebP/),
  )
  assert.equal(decodeCalls, 0)
})

test('TikTok crop proposal rejects oversized image blobs before browser decode', async () => {
  let decodeCalls = 0
  const oversizedBytes = new Uint8Array(OCR_RUNTIME_CONFIG.maxImageBytes + 1)
  await withBrowserImageMocks(
    new Response(new Blob([oversizedBytes], { type: 'image/png' })),
    async () => {
      decodeCalls += 1
      throw new Error('decode should not run')
    },
    () => assert.rejects(proposeTikTokKpiCrop('blob:oversized'), /10 MB or smaller/),
  )
  assert.equal(decodeCalls, 0)
})

test('TikTok crop proposal closes and rejects images beyond configured dimensions', async () => {
  let closeCalls = 0
  await withBrowserImageMocks(
    new Response(new Blob(['image'], { type: 'image/png' })),
    async () => ({
      width: OCR_RUNTIME_CONFIG.maxImageDimension + 1,
      height: 1,
      close: () => { closeCalls += 1 },
    } as ImageBitmap),
    () => assert.rejects(proposeTikTokKpiCrop('blob:oversized-dimensions'), /dimensions are not supported/),
  )
  assert.equal(closeCalls, 1)
})
