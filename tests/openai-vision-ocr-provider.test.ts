import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OpenAiVisionOcrProvider,
  VisionProviderError,
  type OpenAiExecutorFactory,
} from '../lib/server/visionOcrProviders.ts'
import {
  visionMetricKeys,
  type VisionOcrPlatform,
  type VisionOcrRequest,
} from '../lib/visionOcr/types.ts'

function request(platform: VisionOcrPlatform): VisionOcrRequest {
  return {
    platform,
    image: {
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 42]),
      mimeType: 'image/png',
      width: 640,
      height: 360,
    },
    expectedMetricKeys: [...visionMetricKeys[platform]],
    requestId: `request-${platform}`,
  }
}

function structuredOutput(platform: VisionOcrPlatform) {
  return JSON.stringify({
    platform,
    metrics: visionMetricKeys[platform].map((key, index) => ({
      key,
      value: index + 1,
      rawText: String(index + 1),
      confidence: 0.99,
      state: 'confirmed',
      reasoningCode: 'direct_read',
    })),
    warnings: [],
  })
}

function fakeFactory(
  outputText: string,
  capture?: { apiKey?: string; timeoutMs?: number; request?: unknown },
): OpenAiExecutorFactory {
  return async options => {
    if (capture) {
      capture.apiKey = options.apiKey
      capture.timeoutMs = options.timeoutMs
    }
    return async apiRequest => {
      if (capture) capture.request = apiRequest
      return {
        outputText,
        requestId: 'provider-request-safe-id',
        model: 'gpt-5.4',
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      }
    }
  }
}

test('OpenAI provider does not initialize while disabled or when the server key is missing', async () => {
  let factoryCalls = 0
  const createExecutor: OpenAiExecutorFactory = async () => {
    factoryCalls += 1
    throw new Error('must not initialize')
  }
  await assert.rejects(
    new OpenAiVisionOcrProvider('gpt-5.4', false, {
      resolveApiKey: () => 'server-test-key',
      createExecutor,
    }).recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'provider_disabled',
  )
  await assert.rejects(
    new OpenAiVisionOcrProvider('openai-not-configured', true, {
      resolveApiKey: () => undefined,
      createExecutor,
    }).recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'provider_not_configured',
  )
  assert.equal(factoryCalls, 0)
})

for (const platform of ['tiktok', 'shopee'] as const) {
  test(`OpenAI provider validates the complete ${platform} canonical response`, async () => {
    const capture: { apiKey?: string; timeoutMs?: number; request?: unknown } = {}
    const provider = new OpenAiVisionOcrProvider('gpt-5.4', true, {
      resolveApiKey: () => 'server-test-key',
      createExecutor: fakeFactory(structuredOutput(platform), capture),
      timeoutMs: 12_345,
    })
    const response = await provider.recognize(request(platform))
    assert.equal(response.metrics.length, visionMetricKeys[platform].length)
    assert.deepEqual(response.metrics.map(metric => metric.key), [...visionMetricKeys[platform]])
    assert.equal(response.providerRequestId, 'provider-request-safe-id')
    assert.deepEqual(response.usage, { inputTokens: 100, outputTokens: 200, totalTokens: 300 })
    assert.equal(capture.apiKey, 'server-test-key')
    assert.equal(capture.timeoutMs, 12_345)

    const serializedRequest = JSON.stringify(capture.request)
    assert.match(serializedRequest, /data:image\/png;base64,/)
    assert.match(serializedRequest, /"detail":"original"/)
    assert.match(serializedRequest, /"type":"json_schema"/)
    assert.match(serializedRequest, /"strict":true/)
    assert.match(serializedRequest, /"additionalProperties":false/)
    assert.match(serializedRequest, /"store":false/)
    assert.equal(serializedRequest.includes('server-test-key'), false)
    assert.equal(serializedRequest.includes('selected-kpi-crop.png'), false)
    assert.equal(serializedRequest.includes('C:\\'), false)
    assert.equal(serializedRequest.includes('http://localhost'), false)
  })
}

test('OpenAI provider ignores client-shaped provider, model and key fields', async () => {
  const capture: { request?: unknown } = {}
  const taintedRequest = Object.assign(request('tiktok'), {
    provider: 'client-provider',
    model: 'client-model',
    apiKey: 'client-key',
  })
  const response = await new OpenAiVisionOcrProvider('gpt-5.4', true, {
    resolveApiKey: () => 'server-test-key',
    createExecutor: fakeFactory(structuredOutput('tiktok'), capture),
  }).recognize(taintedRequest)
  assert.equal(response.model, 'gpt-5.4')
  const serializedRequest = JSON.stringify(capture.request)
  assert.match(serializedRequest, /"model":"gpt-5.4"/)
  assert.equal(serializedRequest.includes('client-model'), false)
  assert.equal(serializedRequest.includes('client-key'), false)
  assert.equal(serializedRequest.includes('client-provider'), false)
})

test('OpenAI provider separates malformed JSON from structured-schema mismatch', async () => {
  const options = { resolveApiKey: () => 'server-test-key' }
  await assert.rejects(
    new OpenAiVisionOcrProvider('gpt-5.4', true, {
      ...options,
      createExecutor: fakeFactory('not-json'),
    }).recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'invalid_provider_response',
  )
  const missingMetric = JSON.parse(structuredOutput('tiktok')) as { metrics: unknown[] }
  missingMetric.metrics.pop()
  await assert.rejects(
    new OpenAiVisionOcrProvider('gpt-5.4', true, {
      ...options,
      createExecutor: fakeFactory(JSON.stringify(missingMetric)),
    }).recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'output_schema_mismatch',
  )
})

for (const scenario of [
  { error: { name: 'APIConnectionTimeoutError' }, code: 'provider_timeout' },
  { error: { name: 'RateLimitError', status: 429 }, code: 'provider_rate_limited' },
  { error: { status: 404, code: 'model_not_found' }, code: 'model_unavailable' },
  { error: { status: 500 }, code: 'provider_unavailable' },
] as const) {
  test(`OpenAI provider maps failures to ${scenario.code} without leaking provider bodies`, async () => {
    const createExecutor: OpenAiExecutorFactory = async () => async () => {
      throw { ...scenario.error, message: 'private provider response with server-test-key' }
    }
    await assert.rejects(
      new OpenAiVisionOcrProvider('gpt-5.4', true, {
        resolveApiKey: () => 'server-test-key',
        createExecutor,
      }).recognize(request('tiktok')),
      (error: unknown) => {
        assert.ok(error instanceof VisionProviderError)
        assert.equal(error.code, scenario.code)
        assert.equal(error.message.includes('private provider response'), false)
        assert.equal(error.message.includes('server-test-key'), false)
        return true
      },
    )
  })
}

test('OpenAI provider rejects non-whitelisted server models before SDK initialization', async () => {
  let factoryCalls = 0
  await assert.rejects(
    new OpenAiVisionOcrProvider('gpt-client-override', true, {
      resolveApiKey: () => 'server-test-key',
      createExecutor: async () => {
        factoryCalls += 1
        throw new Error('must not initialize')
      },
    }).recognize(request('shopee')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'model_unavailable',
  )
  assert.equal(factoryCalls, 0)
})
