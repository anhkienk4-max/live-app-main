import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'

import { AuthorizationError } from '../lib/server/authGuards.ts'
import { createVisionOcrPostHandler } from '../lib/server/visionOcrRouteHandler.ts'
import {
  MockVisionOcrProvider,
  OpenAiVisionOcrProvider,
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
  privacyConsent?: boolean
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
  if (options.privacyConsent !== false) formData.set('privacy_consent', 'accepted')
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
  assert.equal((await json(await disabled(await multipartRequest()))).error?.code, 'AI_PROVIDER_DISABLED')
  const missing = createVisionOcrPostHandler({ authorize, config: enabledConfig, registry: new VisionOcrProviderRegistry() })
  assert.equal((await json(await missing(await multipartRequest()))).error?.code, 'AI_PROVIDER_NOT_CONFIGURED')
})

test('Vision route cannot activate the deterministic mock provider in production', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const handler = createVisionOcrPostHandler({
      authorize,
      config: { ...enabledConfig, provider: 'mock' },
    })
    const response = await handler(await multipartRequest())
    assert.equal(response.status, 503)
    assert.equal((await json(response)).error?.code, 'AI_PROVIDER_NOT_CONFIGURED')
  } finally {
    process.env.NODE_ENV = originalNodeEnv
  }
})

test('Vision route rejects unsupported platform, invalid signature and empty crop', async () => {
  const handler = createVisionOcrPostHandler({ authorize, config: enabledConfig, registry: registryWith(successProvider()) })
  assert.equal((await json(await handler(await multipartRequest({ platform: 'other' })))).error?.code, 'UNSUPPORTED_PLATFORM')
  assert.equal((await json(await handler(await multipartRequest({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' })))).error?.code, 'INVALID_IMAGE')
  assert.equal((await json(await handler(await multipartRequest({ includeImage: false })))).error?.code, 'INVALID_CROP')
})

test('Vision route requires an explicit privacy-consent assertion before provider execution', async () => {
  const handler = createVisionOcrPostHandler({ authorize, config: enabledConfig, registry: registryWith(successProvider()) })
  const response = await handler(await multipartRequest({ privacyConsent: false }))
  assert.equal(response.status, 400)
  assert.equal((await json(response)).error?.code, 'INVALID_REQUEST')
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
  assert.equal((await json(response)).error?.code, 'AI_REQUEST_TOO_LARGE')
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
  assert.equal(body.error?.code, 'AI_TIMEOUT')
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
  assert.equal((await json(response)).error?.code, 'AI_RATE_LIMITED')
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

test('Vision route executes the OpenAI boundary with only the validated selected crop', async () => {
  let capturedRequest: unknown
  const outputText = JSON.stringify({
    platform: 'tiktok',
    metrics: visionMetricKeys.tiktok.map((key, index) => ({
      key,
      value: index + 1,
      rawText: String(index + 1),
      confidence: 0.99,
      state: 'confirmed',
      reasoningCode: 'direct_read',
    })),
    warnings: [],
  })
  const provider = new OpenAiVisionOcrProvider('gpt-5.4', true, {
    resolveApiKey: () => 'server-test-key',
    createExecutor: async () => async request => {
      capturedRequest = request
      return { outputText, model: 'gpt-5.4', requestId: 'safe-provider-request-id' }
    },
  })
  const logs: unknown[] = []
  const response = await createVisionOcrPostHandler({
    authorize,
    config: { ...enabledConfig, provider: 'openai', model: 'gpt-5.4' },
    registry: registryWith(provider),
    logger: entry => logs.push(entry),
  })(await multipartRequest())
  assert.equal(response.status, 200)
  const body = await json(response) as { ok: boolean; data: { metrics: unknown[] } }
  assert.equal(body.data.metrics.length, 19)
  const serializedRequest = JSON.stringify(capturedRequest)
  assert.match(serializedRequest, /data:image\/png;base64,/)
  assert.equal(serializedRequest.includes('selected-kpi-crop.png'), false)
  assert.equal(serializedRequest.includes('server-test-key'), false)
  assert.equal(JSON.stringify(logs).includes('base64'), false)
  assert.equal(JSON.stringify(logs).includes('server-test-key'), false)
})

test('Vision route maps provider failures to stable safe API codes', async t => {
  const cases = [
    ['provider_not_configured', 'AI_PROVIDER_NOT_CONFIGURED', 503],
    ['provider_disabled', 'AI_PROVIDER_DISABLED', 503],
    ['model_unavailable', 'AI_MODEL_UNAVAILABLE', 503],
    ['provider_rate_limited', 'AI_RATE_LIMITED', 429],
    ['provider_timeout', 'AI_TIMEOUT', 504],
    ['provider_unavailable', 'AI_PROVIDER_ERROR', 502],
    ['invalid_provider_response', 'AI_INVALID_OUTPUT', 502],
    ['output_schema_mismatch', 'AI_OUTPUT_SCHEMA_MISMATCH', 502],
    ['request_too_large', 'AI_REQUEST_TOO_LARGE', 413],
  ] as const
  for (const [providerCode, apiCode, status] of cases) {
    await t.test(apiCode, async () => {
      const provider: VisionOcrProvider = {
        id: 'mock',
        model: 'safe-error-test',
        async recognize() {
          throw new VisionProviderError(providerCode, 'private provider body and secret-test-value')
        },
      }
      const response = await createVisionOcrPostHandler({
        authorize,
        config: enabledConfig,
        registry: registryWith(provider),
        logger: () => undefined,
      })(await multipartRequest())
      const body = await json(response)
      assert.equal(response.status, status)
      assert.equal(body.error?.code, apiCode)
      const serialized = JSON.stringify(body)
      assert.equal(serialized.includes('private provider body'), false)
      assert.equal(serialized.includes('secret-test-value'), false)
      assert.equal(serialized.includes('stack'), false)
    })
  }
})
