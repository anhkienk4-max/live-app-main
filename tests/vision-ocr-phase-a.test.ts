import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MockVisionOcrProvider,
  OpenAiVisionOcrProvider,
  VisionOcrProviderRegistry,
  VisionProviderError,
} from '../lib/server/visionOcrProviders.ts'
import {
  parseVisionOcrResponse,
  visionMetricKeys,
  type VisionMetricResult,
  type VisionOcrRequest,
} from '../lib/visionOcr/types.ts'
import {
  compareVisionMetrics,
  parseVisionDisplayValue,
  resolveHybridMetric,
} from '../lib/utils/visionOcrHybrid.ts'
import type { OcrReviewData } from '../lib/types/database.types.ts'

const request = (platform: 'tiktok' | 'shopee'): VisionOcrRequest => ({
  platform,
  image: { bytes: new Uint8Array([1]), mimeType: 'image/png', width: 100, height: 100 },
  expectedMetricKeys: [...visionMetricKeys[platform]],
  requestId: `request-${platform}`,
})
const values = (platform: 'tiktok' | 'shopee') => Object.fromEntries(
  visionMetricKeys[platform].map((key, index) => [key, index + 1]),
)

test('canonical Vision schemas contain exactly 19 TikTok and 16 Shopee keys', () => {
  assert.equal(visionMetricKeys.tiktok.length, 19)
  assert.equal(new Set(visionMetricKeys.tiktok).size, 19)
  assert.equal(visionMetricKeys.shopee.length, 16)
  assert.equal(new Set(visionMetricKeys.shopee).size, 16)
})

test('provider validation requires every canonical key and rejects unknown keys', async () => {
  const registry = new VisionOcrProviderRegistry().register(new MockVisionOcrProvider({
    scenario: 'full_agreement',
    values: values('tiktok'),
  }))
  const response = await registry.recognize('mock', request('tiktok'))
  assert.equal(response.metrics.length, 19)
  const unknown = structuredClone(response)
  unknown.metrics[0].key = 'unknown_metric'
  assert.throws(() => parseVisionOcrResponse('tiktok', unknown), /canonical platform schema/)
  const omitted = structuredClone(response)
  omitted.metrics.pop()
  assert.throws(() => parseVisionOcrResponse('tiktok', omitted), /canonical platform schema/)
})

test('strict metric validation rejects non-finite values, invalid confidence and invalid null state', async () => {
  const provider = new MockVisionOcrProvider({ scenario: 'full_agreement', values: values('shopee') })
  const response = await provider.recognize(request('shopee')) as { metrics: VisionMetricResult[] }
  response.metrics[0].value = Number.POSITIVE_INFINITY
  assert.throws(() => parseVisionOcrResponse('shopee', response))
  response.metrics[0].value = 1
  response.metrics[0].confidence = 1.1
  assert.throws(() => parseVisionOcrResponse('shopee', response))
  response.metrics[0].confidence = 1
  response.metrics[0].state = 'missing'
  assert.throws(() => parseVisionOcrResponse('shopee', response), /null value/)
})

test('localized numbers normalize K/M, decimal comma and duration without inventing zero', () => {
  assert.equal(parseVisionDisplayValue('165.32K'), 165320)
  assert.equal(parseVisionDisplayValue('8.98M'), 8980000)
  assert.equal(parseVisionDisplayValue('1.604.714,07'), 1604714.07)
  assert.equal(parseVisionDisplayValue('1m17s'), 77)
  assert.equal(parseVisionDisplayValue('unreadable'), null)
  assert.equal(parseVisionDisplayValue(''), null)
})

const localReview = (value: number | null): OcrReviewData => ({
  status: value === null ? 'review_required' : 'confirmed',
  metrics: value === null ? {} : {
    gmv: { value, confidence: 'high', needs_review: false, status: 'confirmed', raw_value: String(value) },
  },
})

const aiMetrics = (gmv: number | null) => visionMetricKeys.tiktok.map((key): VisionMetricResult => ({
  key,
  value: key === 'gmv' ? gmv : null,
  rawText: key === 'gmv' && gmv !== null ? String(gmv) : null,
  confidence: key === 'gmv' && gmv !== null ? 0.9 : null,
  state: key === 'gmv' && gmv !== null ? 'confirmed' : 'missing',
  reasoningCode: key === 'gmv' && gmv !== null ? 'direct_read' : 'not_visible',
}))

test('hybrid agreement confirms numerically equal values', () => {
  const [result] = compareVisionMetrics({ platform: 'tiktok', localReview: localReview(1000), aiMetrics: aiMetrics(1000) })
  assert.equal(result.selectedSource, 'agreement')
  assert.equal(result.state, 'confirmed')
  assert.equal(result.selectedValue, 1000)
})

test('hybrid conflicts stay unresolved until OCR, AI or manual resolution', () => {
  const [result] = compareVisionMetrics({ platform: 'tiktok', localReview: localReview(1000), aiMetrics: aiMetrics(1001) })
  assert.equal(result.selectedSource, 'none')
  assert.equal(result.state, 'review_required')
  assert.equal(resolveHybridMetric(result, 'local').selectedValue, 1000)
  assert.equal(resolveHybridMetric(result, 'ai').selectedValue, 1001)
  const manual = resolveHybridMetric(result, 'manual', 1002)
  assert.equal(manual.selectedSource, 'manual')
  assert.equal(manual.selectedValue, 1002)
})

test('hybrid local-only, AI-only and both-missing rules are conservative', () => {
  const localOnly = compareVisionMetrics({ platform: 'tiktok', localReview: localReview(1000), aiMetrics: aiMetrics(null) })[0]
  assert.equal(localOnly.selectedSource, 'local')
  assert.equal(localOnly.selectedValue, 1000)
  const aiOnly = compareVisionMetrics({ platform: 'tiktok', localReview: localReview(null), aiMetrics: aiMetrics(1000) })[0]
  assert.equal(aiOnly.selectedSource, 'ai')
  assert.equal(aiOnly.state, 'review_required')
  const missing = compareVisionMetrics({ platform: 'tiktok', localReview: localReview(null), aiMetrics: aiMetrics(null) })[0]
  assert.equal(missing.selectedSource, 'none')
  assert.equal(missing.state, 'missing')
})

test('user-edited values are protected from both OCR sources', () => {
  const [result] = compareVisionMetrics({
    platform: 'tiktok',
    localReview: localReview(1000),
    aiMetrics: aiMetrics(1001),
    manualValues: { gmv: 999 },
    protectedKeys: new Set(['gmv']),
  })
  assert.equal(result.selectedSource, 'manual')
  assert.equal(result.selectedValue, 999)
})

test('mock provider supports deterministic missing, conflict, timeout, invalid and provider-error scenarios', async () => {
  const missing = await new VisionOcrProviderRegistry()
    .register(new MockVisionOcrProvider({ scenario: 'missing' }))
    .recognize('mock', request('tiktok'))
  assert.equal(missing.metrics.filter(metric => metric.state === 'missing').length, 19)

  const conflict = await new VisionOcrProviderRegistry()
    .register(new MockVisionOcrProvider({ scenario: 'conflict', values: values('tiktok') }))
    .recognize('mock', request('tiktok'))
  assert.equal(conflict.metrics[0].state, 'review_required')

  await assert.rejects(
    () => new MockVisionOcrProvider({ scenario: 'timeout' }).recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'provider_timeout',
  )
  await assert.rejects(
    () => new VisionOcrProviderRegistry().register(new MockVisionOcrProvider({ scenario: 'invalid_response' })).recognize('mock', request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'invalid_provider_response',
  )
  await assert.rejects(
    () => new MockVisionOcrProvider({ scenario: 'provider_error' }).recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'provider_unavailable',
  )
})

test('OpenAI placeholder never executes and fails with typed Phase A gates', async () => {
  await assert.rejects(
    () => new OpenAiVisionOcrProvider('openai-placeholder', false, '').recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'provider_disabled',
  )
  await assert.rejects(
    () => new OpenAiVisionOcrProvider('openai-placeholder', true, '').recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'provider_not_configured',
  )
  await assert.rejects(
    () => new OpenAiVisionOcrProvider('openai-placeholder', true, 'server-only-test-key').recognize(request('tiktok')),
    (error: unknown) => error instanceof VisionProviderError && error.code === 'provider_disabled',
  )
})
