import type {
  VisionMetricReasoningCode,
  VisionMetricResult,
  VisionOcrPlatform,
  VisionOcrRequest,
  VisionOcrResponse,
} from '@/lib/visionOcr/types'
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses'
import { parseVisionOcrResponse, visionMetricKeys } from '@/lib/visionOcr/types'

export type VisionProviderErrorCode =
  | 'provider_disabled'
  | 'provider_not_configured'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'model_unavailable'
  | 'invalid_provider_response'
  | 'output_schema_mismatch'
  | 'request_too_large'

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
    private readonly options: OpenAiVisionProviderOptions = {},
  ) {}

  async recognize(request: VisionOcrRequest): Promise<VisionOcrResponse> {
    if (!this.enabled) {
      throw new VisionProviderError('provider_disabled', 'OpenAI Vision OCR is disabled.')
    }
    const apiKey = (this.options.resolveApiKey || (() => process.env.OPENAI_API_KEY))()?.trim()
    if (!apiKey) {
      throw new VisionProviderError('provider_not_configured', 'OpenAI Vision OCR is not configured.')
    }
    if (!allowedOpenAiVisionModels.has(this.model)) {
      throw new VisionProviderError('model_unavailable', 'The configured OpenAI Vision model is unavailable.')
    }
    if (request.image.bytes.byteLength > maximumOpenAiCropBytes) {
      throw new VisionProviderError('request_too_large', 'The selected KPI crop is too large.')
    }

    const startedAt = Date.now()
    try {
      const execute = await (this.options.createExecutor || createOpenAiExecutor)({
        apiKey,
        timeoutMs: this.options.timeoutMs || 30_000,
      })
      const result = await execute(buildOpenAiVisionRequest(this.model, request))
      let parsed: unknown
      try {
        parsed = JSON.parse(result.outputText)
      } catch {
        throw new VisionProviderError('invalid_provider_response', 'OpenAI Vision OCR returned invalid JSON.')
      }
      if (!isRecord(parsed) || parsed.platform !== request.platform) {
        throw new VisionProviderError('output_schema_mismatch', 'OpenAI Vision OCR output did not match the requested platform.')
      }
      const response = {
        provider: 'openai',
        model: result.model || this.model,
        providerRequestId: result.requestId || undefined,
        metrics: parsed.metrics,
        warnings: parsed.warnings,
        latencyMs: Date.now() - startedAt,
        usage: result.usage,
      }
      try {
        return parseVisionOcrResponse(request.platform, response)
      } catch {
        throw new VisionProviderError('output_schema_mismatch', 'OpenAI Vision OCR output did not match the canonical metric schema.')
      }
    } catch (error) {
      throw mapOpenAiProviderError(error)
    }
  }
}

const maximumOpenAiCropBytes = 10 * 1024 * 1024

export const allowedOpenAiVisionModels = new Set([
  'gpt-5.6',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
])

type OpenAiResponseResult = {
  outputText: string
  requestId?: string | null
  model?: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

export type OpenAiResponseExecutor = (
  request: ResponseCreateParamsNonStreaming,
) => Promise<OpenAiResponseResult>

export type OpenAiExecutorFactory = (options: {
  apiKey: string
  timeoutMs: number
}) => Promise<OpenAiResponseExecutor>

export type OpenAiVisionProviderOptions = {
  resolveApiKey?: () => string | undefined
  createExecutor?: OpenAiExecutorFactory
  timeoutMs?: number
}

async function createOpenAiExecutor({
  apiKey,
  timeoutMs,
}: {
  apiKey: string
  timeoutMs: number
}): Promise<OpenAiResponseExecutor> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 })
  return async request => {
    const { data, request_id: requestId } = await client.responses.create(request).withResponse()
    if (data.error || data.incomplete_details || !data.output_text) {
      throw new VisionProviderError('invalid_provider_response', 'OpenAI Vision OCR did not return a complete structured response.')
    }
    return {
      outputText: data.output_text,
      requestId,
      model: data.model,
      usage: data.usage ? {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }
  }
}

function buildOpenAiVisionRequest(
  model: string,
  request: VisionOcrRequest,
): ResponseCreateParamsNonStreaming {
  const keys = visionMetricKeys[request.platform]
  return {
    model,
    store: false,
    max_output_tokens: 4_000,
    instructions: [
      'Read only the visible KPI values from the supplied selected KPI-panel crop.',
      'Never invent, calculate, infer, or borrow a value from another card.',
      'Preserve decimal punctuation, percentages, duration units, and K/M suffix meaning.',
      'Distinguish a visible zero from an unreadable or missing value.',
      'Use review_required for ambiguous glyphs, suffixes, or punctuation.',
      'Use missing with null value when a metric is not reliably visible.',
      'Return only the structured result. Do not include explanations or chain-of-thought.',
    ].join(' '),
    input: [{
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: `Platform: ${request.platform}. Return exactly these canonical metric keys: ${keys.join(', ')}.`,
        },
        {
          type: 'input_image',
          detail: 'original',
          image_url: `data:${request.image.mimeType};base64,${Buffer.from(request.image.bytes).toString('base64')}`,
        },
      ],
    }],
    text: {
      verbosity: 'low',
      format: {
        type: 'json_schema',
        name: `livestream_${request.platform}_ocr`,
        strict: true,
        schema: buildVisionOutputJsonSchema(request.platform),
      },
    },
  }
}

function buildVisionOutputJsonSchema(platform: VisionOcrPlatform) {
  const keys = visionMetricKeys[platform]
  return {
    type: 'object',
    additionalProperties: false,
    required: ['platform', 'metrics', 'warnings'],
    properties: {
      platform: { type: 'string', enum: [platform] },
      metrics: {
        type: 'array',
        minItems: keys.length,
        maxItems: keys.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'value', 'rawText', 'confidence', 'state', 'reasoningCode'],
          properties: {
            key: { type: 'string', enum: [...keys] },
            value: { type: ['number', 'null'] },
            rawText: { type: ['string', 'null'], maxLength: 64 },
            confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
            state: { type: 'string', enum: ['confirmed', 'review_required', 'missing'] },
            reasoningCode: {
              type: 'string',
              enum: [
                'direct_read',
                'ambiguous_glyph',
                'missing_suffix',
                'missing_decimal',
                'label_not_found',
                'not_visible',
                'conflict',
                'invalid_format',
              ],
            },
          },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 50,
        items: { type: 'string', maxLength: 500 },
      },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mapOpenAiProviderError(error: unknown) {
  if (error instanceof VisionProviderError) return error
  const details = isRecord(error) ? error : {}
  const name = typeof details.name === 'string' ? details.name : ''
  const status = typeof details.status === 'number' ? details.status : null
  const code = typeof details.code === 'string' ? details.code.toLowerCase() : ''
  if (name === 'APIConnectionTimeoutError' || name === 'AbortError') {
    return new VisionProviderError('provider_timeout', 'OpenAI Vision OCR timed out.')
  }
  if (name === 'RateLimitError' || status === 429) {
    return new VisionProviderError('provider_rate_limited', 'OpenAI Vision OCR rate limit was reached.')
  }
  if (status === 404 || code === 'model_not_found' || code === 'invalid_model') {
    return new VisionProviderError('model_unavailable', 'The configured OpenAI Vision model is unavailable.')
  }
  return new VisionProviderError('provider_unavailable', 'OpenAI Vision OCR is unavailable.')
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
