import type {
  VisionMetricReasoningCode,
  VisionMetricResult,
  VisionOcrPlatform,
  VisionOcrRequest,
  VisionOcrResponse,
} from '@/lib/visionOcr/types'
import { parseVisionOcrResponse, visionMetricKeys } from '@/lib/visionOcr/types'

export type VisionProviderErrorCode =
  | 'provider_disabled'
  | 'provider_not_configured'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'invalid_provider_response'

export class VisionProviderError extends Error {
  constructor(public readonly code: VisionProviderErrorCode, message: string) {
    super(message)
    this.name = 'VisionProviderError'
  }
}
export interface VisionOcrProvider {
  readonly id: 'mock' | 'openai'
  readonly model: string
  recognize(request: VisionOcrRequest): Promise<unknown>
}

export type MockVisionScenario =
  | 'full_agreement'
  | 'partial_agreement'
  | 'conflict'
  | 'missing'
  | 'timeout'
  | 'invalid_response'
  | 'provider_error'

export class MockVisionOcrProvider implements VisionOcrProvider {
  readonly id = 'mock' as const
  readonly model = 'deterministic-mock-v1'

  constructor(private readonly options: {
    scenario?: MockVisionScenario
    values?: Partial<Record<string, number | null>>
  } = {}) {}

  async recognize(request: VisionOcrRequest): Promise<unknown> {
    const startedAt = Date.now()
    const scenario = this.options.scenario || 'missing'
    if (scenario === 'timeout') throw new VisionProviderError('provider_timeout', 'The mock provider timed out.')
    if (scenario === 'provider_error') throw new VisionProviderError('provider_unavailable', 'The mock provider is unavailable.')
    if (scenario === 'invalid_response') return { provider: 'mock', metrics: [{ key: 'unknown' }] }

    const metrics = visionMetricKeys[request.platform].map((key, index): VisionMetricResult => {
      const suppliedValue = this.options.values?.[key]
      const shouldBeMissing = scenario === 'missing'
        || (scenario === 'partial_agreement' && index % 3 === 0)
        || suppliedValue === null
        || suppliedValue === undefined
      const value = shouldBeMissing ? null : scenario === 'conflict' && index === 0 ? suppliedValue + 1 : suppliedValue
      const reasoningCode: VisionMetricReasoningCode = value === null
        ? 'not_visible'
        : scenario === 'conflict' && index === 0 ? 'conflict' : 'direct_read'
      return {
        key,
        value,
        rawText: value === null ? null : String(value),
        confidence: value === null ? null : 0.99,
        state: value === null ? 'missing' : reasoningCode === 'conflict' ? 'review_required' : 'confirmed',
        reasoningCode,
      }
    })
    return {
      provider: 'mock',
      model: this.model,
      metrics,
      warnings: [],
      latencyMs: Date.now() - startedAt,
    } satisfies VisionOcrResponse
  }
}

export class OpenAiVisionOcrProvider implements VisionOcrProvider {
  readonly id = 'openai' as const

  constructor(
    readonly model: string,
    private readonly enabled = false,
    private readonly apiKey = '',
  ) {}

  async recognize(_request: VisionOcrRequest): Promise<never> {
    if (!this.enabled) {
      throw new VisionProviderError('provider_disabled', 'OpenAI Vision OCR is disabled in Phase A.')
    }
    if (!this.apiKey) {
      throw new VisionProviderError('provider_not_configured', 'OpenAI Vision OCR is not configured.')
    }
    // Phase A intentionally makes no SDK or Responses API call. Phase B will
    // dynamically import the official server SDK and submit image input with
    // strict structured output after an explicit configuration gate.
    throw new VisionProviderError('provider_disabled', 'Real OpenAI execution is disabled in Phase A.')
  }
}

export class VisionOcrProviderRegistry {
  private readonly providers = new Map<VisionOcrProvider['id'], VisionOcrProvider>()

  register(provider: VisionOcrProvider) {
    this.providers.set(provider.id, provider)
    return this
  }

  get(id: VisionOcrProvider['id']) {
    const provider = this.providers.get(id)
    if (!provider) throw new VisionProviderError('provider_not_configured', 'Vision OCR provider is not configured.')
    return provider
  }

  async recognize(providerId: VisionOcrProvider['id'], request: VisionOcrRequest) {
    const raw = await this.get(providerId).recognize(request)
    try {
      return parseVisionOcrResponse(request.platform, raw)
    } catch {
      throw new VisionProviderError('invalid_provider_response', 'Vision OCR provider returned an invalid response.')
    }
  }
}
