import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'

import { AuthorizationError } from '../lib/server/authGuards.ts'
import { createVisionOcrPostHandler } from '../lib/server/visionOcrRouteHandler.ts'
import {
  MockVisionOcrProvider,
  VisionOcrProviderRegistry,
  VisionProviderError,
  type VisionOcrProvider,
} from '../lib/server/visionOcrProviders.ts'
import { visionMetricKeys, type VisionOcrRequest } from '../lib/visionOcr/types.ts'

let userSequence = 0
const authorize = async () => ({ id: `vision-route-user-${userSequence += 1}`, systemPermission: 'member' as const })
const values = Object.fromEntries(visionMetricKeys.tiktok.map((key, index) => [key, index + 1]))
const successProvider = () => new MockVisionOcrProvider({ scenario: 'full_agreement', values })
const registryWith = (provider: VisionOcrProvider) => new VisionOcrProviderRegistry().register(provider)
const enabledConfig = {
  enabled: true,
  provider: 'mock' as const,
  timeoutMs: 1_000,
  retryCount: 0 as const,
  dailyRequestLimit: 10_000,
  globalDailyRequestLimit: 100_000,
}

async function pngBytes(width = 64, height = 48) {
  return sharp({ create: { width, height, channels: 3, background: '#de4d2c' } }).png().toBuffer()
}

async function multipartRequest(options: {
  platform?: string
  bytes?: Uint8Array
  mime?: string
  includeImage?: boolean
  width?: number
  height?: number
  requestId?: string
} = {}) {
  const width = options.width ?? 64
  const height = options.height ?? 48
  const bytes = options.bytes || await pngBytes(width, height)
  const formData = new FormData()
  if (options.includeImage !== false) {
    formData.set('image', new File([bytes], 'selected-kpi-crop.png', { type: options.mime || 'image/png' }))
  }
  formData.set('platform', options.platform || 'tiktok')
  formData.set('crop_width', String(width))
  formData.set('crop_height', String(height))
  formData.set('request_id', options.requestId || `request-${crypto.randomUUID()}`)
  return new Request('http://localhost/api/ocr/vision', { method: 'POST', body: formData })
}

async function json(response: Response) {
  assert.match(response.headers.get('content-type') || '', /application\/json/)
  assert.doesNotMatch(response.headers.get('content-type') || '', /text\/html/)
  return response.json() as Promise<{ ok: boolean; error?: { code: string; message: string }; data?: unknown }>
}

test('Vision route requires authentication', async () => {
  const handler = createVisionOcrPostHandler({
    config: enabledConfig,
    registry: registryWith(successProvider()),
    resolveUser: async () => null,
  })
  const response = await handler(await multipartRequest())
  assert.equal(response.status, 401)
  assert.equal((await json(response)).error?.code, 'AUTHENTICATION_REQUIRED')
})
test('Vision route returns a standardized permission denial', async () => {
  const handler = createVisionOcrPostHandler({
    config: enabledConfig,
    registry: registryWith(successProvider()),
    authorize: async () => { throw new AuthorizationError(403, 'PERMISSION_DENIED', 'Denied.') },
  })
  const response = await handler(await multipartRequest())
  assert.equal(response.status, 403)
  assert.equal((await json(response)).error?.code, 'PERMISSION_DENIED')
})

test('Vision route rejects disabled and unconfigured providers', async () => {
  const disabled = createVisionOcrPostHandler({ authorize, config: { ...enabledConfig, enabled: false }, registry: registryWith(successProvider()) })
  assert.equal((await json(await disabled(await multipartRequest()))).error?.code, 'AI_OCR_DISABLED')
  const missing = createVisionOcrPostHandler({ authorize, config: enabledConfig, registry: new VisionOcrProviderRegistry() })
  assert.equal((await json(await missing(await multipartRequest()))).error?.code, 'AI_PROVIDER_NOT_CONFIGURED')
})

test('Vision route rejects unsupported platform, invalid signature and empty crop', async () => {
  const handler = createVisionOcrPostHandler({ authorize, config: enabledConfig, registry: registryWith(successProvider()) })
  assert.equal((await json(await handler(await multipartRequest({ platform: 'other' })))).error?.code, 'UNSUPPORTED_PLATFORM')
  assert.equal((await json(await handler(await multipartRequest({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' })))).error?.code, 'INVALID_IMAGE')
  assert.equal((await json(await handler(await multipartRequest({ includeImage: false })))).error?.code, 'INVALID_CROP')
})

test('Vision route rejects MIME/signature mismatch and invalid crop dimensions', async () => {
  const handler = createVisionOcrPostHandler({ authorize, config: enabledConfig, registry: registryWith(successProvider()) })
  assert.equal((await json(await handler(await multipartRequest({ mime: 'image/jpeg' })))).error?.code, 'INVALID_IMAGE')
  const bytes = await pngBytes(64, 48)
  assert.equal((await json(await handler(await multipartRequest({ bytes, width: 65, height: 48 })))).error?.code, 'INVALID_CROP')
})

test('Vision route rejects oversized declared payload before multipart parsing', async () => {
  const handler = createVisionOcrPostHandler({ authorize, config: enabledConfig, registry: registryWith(successProvider()) })
  const request = new Request('http://localhost/api/ocr/vision', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(11 * 1024 * 1024) },
    body: '--x--',
  })
  const response = await handler(request)
  assert.equal(response.status, 413)
  assert.equal((await json(response)).error?.code, 'PAYLOAD_TOO_LARGE')
})

test('Vision route applies timeout and sanitizes provider failures', async () => {
  const handler = createVisionOcrPostHandler({
    authorize,
    config: { ...enabledConfig, timeoutMs: 20 },
    registry: registryWith(new MockVisionOcrProvider({ scenario: 'timeout' })),
  })
  const response = await handler(await multipartRequest())
  assert.equal(response.status, 504)
  const body = await json(response)
  assert.equal(body.error?.code, 'AI_OCR_TIMEOUT')
  assert.equal(JSON.stringify(body).includes('stack'), false)
})

test('Vision route retries a provider at most once', async () => {
  let attempts = 0
  const fallback = successProvider()
  const provider: VisionOcrProvider = {
    id: 'mock',
    model: 'retry-test',
    async recognize(request: VisionOcrRequest) {
      attempts += 1
      if (attempts === 1) throw new VisionProviderError('provider_unavailable', 'private provider body')
      return fallback.recognize(request)
    },
  }
  const handler = createVisionOcrPostHandler({ authorize, config: { ...enabledConfig, retryCount: 1 }, registry: registryWith(provider) })
  const response = await handler(await multipartRequest())
  assert.equal(response.status, 200)
  assert.equal(attempts, 2)
})

test('Vision route rejects a duplicate active request for the same user', async () => {
  let release: (() => void) | undefined
  let entered: (() => void) | undefined
  const enteredPromise = new Promise<void>(resolve => { entered = resolve })
  const releasePromise = new Promise<void>(resolve => { release = resolve })
  const fallback = successProvider()
  const provider: VisionOcrProvider = {
    id: 'mock',
    model: 'duplicate-test',
    async recognize(request: VisionOcrRequest) {
      entered?.()
      await releasePromise
      return fallback.recognize(request)
    },
  }
  const sameUser = async () => ({ id: 'same-active-user', systemPermission: 'member' as const })
  const handler = createVisionOcrPostHandler({ authorize: sameUser, config: enabledConfig, registry: registryWith(provider) })
  const first = handler(await multipartRequest())
  await enteredPromise
  const second = await handler(await multipartRequest())
  assert.equal(second.status, 409)
  assert.equal((await json(second)).error?.code, 'DUPLICATE_REQUEST')
  release?.()
  assert.equal((await first).status, 200)
})

test('Vision route enforces the per-user daily request limit on the server', async () => {
  const limitedUserId = `limited-user-${crypto.randomUUID()}`
  const limitedUser = async () => ({ id: limitedUserId, systemPermission: 'member' as const })
  const handler = createVisionOcrPostHandler({
    authorize: limitedUser,
    config: { ...enabledConfig, dailyRequestLimit: 1 },
    registry: registryWith(successProvider()),
    logger: () => undefined,
  })
  assert.equal((await handler(await multipartRequest())).status, 200)
  const response = await handler(await multipartRequest())
  assert.equal(response.status, 429)
  assert.equal((await json(response)).error?.code, 'RATE_LIMITED')
  assert.ok(response.headers.get('retry-after'))
})

test('Vision route enforces platform allow-list configuration', async () => {
  const handler = createVisionOcrPostHandler({
    authorize,
    config: { ...enabledConfig, allowTikTok: false },
    registry: registryWith(successProvider()),
  })
  const response = await handler(await multipartRequest())
  assert.equal(response.status, 400)
  assert.equal((await json(response)).error?.code, 'UNSUPPORTED_PLATFORM')
})

test('Vision route validates provider output and never returns secrets or logs image data', async () => {
  const logs: unknown[] = []
  const invalid = new MockVisionOcrProvider({ scenario: 'invalid_response' })
  const handler = createVisionOcrPostHandler({ authorize, config: enabledConfig, registry: registryWith(invalid), logger: entry => logs.push(entry) })
  const response = await handler(await multipartRequest())
  assert.equal(response.status, 502)
  const body = await json(response)
  const serialized = JSON.stringify({ body, logs })
  assert.equal(serialized.includes('OPENAI_API_KEY'), false)
  assert.equal(serialized.includes('base64'), false)
  assert.equal(serialized.includes('bytes'), false)
  assert.equal(serialized.includes('selected-kpi-crop'), false)
  assert.equal(serialized.includes('stack'), false)
})
