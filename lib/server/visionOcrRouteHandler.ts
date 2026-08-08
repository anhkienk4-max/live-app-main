import { z } from 'zod'
import {
  type AuthenticatedServerUser,
  authorizationErrorResponse,
  isAuthorizationError,
  requirePermission,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import {
  consumeRateLimit,
  OperationTimeoutError,
  rateLimitResponse,
  readFormDataBody,
  RequestBodyError,
  withTimeout,
} from '@/lib/server/apiSecurity'
import {
  MockVisionOcrProvider,
  OpenAiVisionOcrProvider,
  VisionOcrProviderRegistry,
  VisionProviderError,
} from '@/lib/server/visionOcrProviders'
import type { VisionOcrPlatform } from '@/lib/visionOcr/types'
import { visionMetricKeys } from '@/lib/visionOcr/types'

const maximumImageBytes = 10 * 1024 * 1024
const maximumMultipartBytes = maximumImageBytes + 64 * 1024
const maximumDimension = 5_000
const minimumDimension = 32
const activeRequests = new Set<string>()

const requestFieldsSchema = z.object({
  platform: z.enum(['tiktok', 'shopee']),
  requestId: z.string().min(8).max(120).regex(/^[a-zA-Z0-9._-]+$/),
  cropWidth: z.coerce.number().int().min(minimumDimension).max(maximumDimension),
  cropHeight: z.coerce.number().int().min(minimumDimension).max(maximumDimension),
}).strict()

type SafeRequestLog = {
  requestId: string
  userId: string
  provider: string
  model: string
  platform: VisionOcrPlatform
  cropDimensions: { width: number; height: number }
  timestamp: string
  latencyMs: number
  success: boolean
  metricStateCounts?: Record<string, number>
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  errorCode?: string
}

type VisionRouteDependencies = {
  resolveUser?: ServerUserResolver
  authorize?: (request: Request) => Promise<AuthenticatedServerUser>
  registry?: VisionOcrProviderRegistry
  config?: Partial<VisionOcrServerConfig>
  logger?: (entry: SafeRequestLog) => void
}

export type VisionOcrServerConfig = {
  enabled: boolean
  provider: 'mock' | 'openai'
  model: string
  timeoutMs: number
  retryCount: 0 | 1
  dailyRequestLimit: number
  globalDailyRequestLimit: number
  allowTikTok: boolean
  allowShopee: boolean
}

function envBoolean(value: string | undefined, fallback = false) {
  if (value == null) return fallback
  return value === 'true'
}

function envInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback
}

export function visionOcrServerConfig(): VisionOcrServerConfig {
  const provider = process.env.VISION_OCR_PROVIDER === 'mock' ? 'mock' : 'openai'
  return {
    enabled: envBoolean(process.env.VISION_OCR_ENABLED),
    provider,
    model: process.env.VISION_OCR_MODEL || (provider === 'mock' ? 'deterministic-mock-v1' : 'openai-not-configured'),
    timeoutMs: envInteger(process.env.VISION_OCR_TIMEOUT_MS, 30_000, 1_000, 120_000),
    retryCount: envInteger(process.env.VISION_OCR_RETRY_COUNT, 0, 0, 1) as 0 | 1,
    dailyRequestLimit: envInteger(process.env.VISION_OCR_DAILY_USER_LIMIT, 25, 1, 10_000),
    globalDailyRequestLimit: envInteger(process.env.VISION_OCR_DAILY_GLOBAL_LIMIT, 500, 1, 100_000),
    allowTikTok: envBoolean(process.env.VISION_OCR_ALLOW_TIKTOK, true),
    allowShopee: envBoolean(process.env.VISION_OCR_ALLOW_SHOPEE, true),
  }
}

function runtimeRegistry(config: VisionOcrServerConfig) {
  const registry = new VisionOcrProviderRegistry()
  if (
    config.provider === 'mock'
    && process.env.NODE_ENV !== 'production'
    && process.env.VISION_OCR_ENABLE_MOCK_PROVIDER === 'true'
  ) {
    registry.register(new MockVisionOcrProvider())
  }
  registry.register(new OpenAiVisionOcrProvider(
    config.model,
    config.enabled,
    process.env.OPENAI_API_KEY || '',
  ))
  return registry
}

function safeError(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function imageSignature(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return 'image/png' as const
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg' as const
  }
  if (
    bytes.length >= 12
    && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp' as const
  }
  return null
}

async function imageDimensions(bytes: Uint8Array) {
  const sharpModule = await import('sharp')
  const metadata = await sharpModule.default(bytes).metadata()
  return { width: metadata.width || 0, height: metadata.height || 0 }
}

function stateCounts(metrics: Array<{ state: string }>) {
  return metrics.reduce<Record<string, number>>((counts, metric) => {
    counts[metric.state] = (counts[metric.state] || 0) + 1
    return counts
  }, {})
}

async function recognizeWithRetry({
  registry,
  config,
  request,
}: {
  registry: VisionOcrProviderRegistry
  config: VisionOcrServerConfig
  request: Parameters<VisionOcrProviderRegistry['recognize']>[1]
}) {
  let lastError: unknown
  for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
    try {
      return await withTimeout(registry.recognize(config.provider, request), config.timeoutMs)
    } catch (error) {
      lastError = error
      const retryable = error instanceof VisionProviderError && error.code === 'provider_unavailable'
      if (!retryable || attempt >= config.retryCount) throw error
    }
  }
  throw lastError
}

export function createVisionOcrPostHandler(dependencies: VisionRouteDependencies = {}) {
  return async function POST(request: Request) {
    const startedAt = Date.now()
    const timestamp = new Date().toISOString()
    let logContext: Omit<SafeRequestLog, 'latencyMs' | 'success'> | null = null
    try {
      const user = dependencies.authorize
        ? await dependencies.authorize(request)
        : await requirePermission(request, 'reports.submit', dependencies.resolveUser)
      const config = { ...visionOcrServerConfig(), ...dependencies.config }
      if (!config.enabled) return safeError('AI_OCR_DISABLED', 'AI Vision OCR is disabled.', 503)
      if (config.provider === 'mock' && process.env.NODE_ENV === 'production' && !dependencies.registry) {
        return safeError('AI_PROVIDER_NOT_CONFIGURED', 'AI Vision OCR provider is not configured.', 503)
      }

      const userRateLimit = consumeRateLimit({
        key: `vision-ocr:user:${user.id}`,
        limit: config.dailyRequestLimit,
        windowMs: 86_400_000,
      })
      if (!userRateLimit.allowed) return rateLimitResponse(userRateLimit.resetAt)
      const globalRateLimit = consumeRateLimit({
        key: 'vision-ocr:global',
        limit: config.globalDailyRequestLimit,
        windowMs: 86_400_000,
      })
      if (!globalRateLimit.allowed) return rateLimitResponse(globalRateLimit.resetAt)

      const formData = await readFormDataBody(request, maximumMultipartBytes)
      const rawPlatform = formData.get('platform')
      if (rawPlatform !== 'tiktok' && rawPlatform !== 'shopee') {
        return safeError('UNSUPPORTED_PLATFORM', 'AI OCR does not support this platform.', 400)
      }
      const parsedFields = requestFieldsSchema.safeParse({
        platform: rawPlatform,
        requestId: formData.get('request_id'),
        cropWidth: formData.get('crop_width'),
        cropHeight: formData.get('crop_height'),
      })
      if (!parsedFields.success) return safeError('INVALID_REQUEST', 'AI OCR request metadata is invalid.', 400)
      const { platform, requestId, cropWidth, cropHeight } = parsedFields.data
      if ((platform === 'tiktok' && !config.allowTikTok) || (platform === 'shopee' && !config.allowShopee)) {
        return safeError('UNSUPPORTED_PLATFORM', 'AI OCR is not enabled for this platform.', 400)
      }
      const image = formData.get('image')
      if (!(image instanceof File) || image.size === 0) return safeError('INVALID_CROP', 'The selected KPI crop is empty.', 400)
      if (image.size > maximumImageBytes) return safeError('PAYLOAD_TOO_LARGE', 'The selected KPI crop is too large.', 413)
      const bytes = new Uint8Array(await image.arrayBuffer())
      const verifiedMime = imageSignature(bytes)
      if (!verifiedMime || verifiedMime !== image.type) return safeError('INVALID_IMAGE', 'The selected KPI crop has an invalid image format.', 400)
      const dimensions = await imageDimensions(bytes)
      if (
        dimensions.width < minimumDimension
        || dimensions.height < minimumDimension
        || dimensions.width > maximumDimension
        || dimensions.height > maximumDimension
        || dimensions.width !== cropWidth
        || dimensions.height !== cropHeight
      ) {
        return safeError('INVALID_CROP', 'The selected KPI crop dimensions are invalid.', 400)
      }
      if (activeRequests.has(user.id)) return safeError('DUPLICATE_REQUEST', 'An AI OCR request is already active.', 409)

      const registry = dependencies.registry || runtimeRegistry(config)
      const provider = registry.get(config.provider)
      logContext = {
        requestId,
        userId: user.id,
        provider: provider.id,
        model: provider.model,
        platform,
        cropDimensions: dimensions,
        timestamp,
      }
      activeRequests.add(user.id)
      try {
        const data = await recognizeWithRetry({
          registry,
          config,
          request: {
            platform,
            image: { bytes, mimeType: verifiedMime, ...dimensions },
            expectedMetricKeys: [...visionMetricKeys[platform]],
            requestId,
          },
        })
        const log = dependencies.logger || ((entry: SafeRequestLog) => console.info('vision_ocr_request', entry))
        log({
          ...logContext,
          latencyMs: Date.now() - startedAt,
          success: true,
          metricStateCounts: stateCounts(data.metrics),
          usage: data.usage,
        })
        return Response.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } })
      } finally {
        activeRequests.delete(user.id)
      }
    } catch (error) {
      if (logContext) (dependencies.logger || ((entry: SafeRequestLog) => console.info('vision_ocr_request', entry)))({
        ...logContext,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorCode: error instanceof VisionProviderError ? error.code : error instanceof Error ? error.name : 'unknown',
      })
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) return safeError(error.code, error.message, error.status)
      if (error instanceof OperationTimeoutError || (error instanceof VisionProviderError && error.code === 'provider_timeout')) {
        return safeError('AI_OCR_TIMEOUT', 'AI Vision OCR timed out.', 504)
      }
      if (error instanceof VisionProviderError) {
        const status = error.code === 'invalid_provider_response' ? 502 : 503
        const code = error.code === 'provider_not_configured'
          ? 'AI_PROVIDER_NOT_CONFIGURED'
          : error.code === 'provider_disabled'
            ? 'AI_OCR_DISABLED'
            : error.code === 'invalid_provider_response'
              ? 'INVALID_PROVIDER_RESPONSE'
              : 'AI_PROVIDER_UNAVAILABLE'
        const message = code === 'AI_PROVIDER_NOT_CONFIGURED'
          ? 'AI Vision OCR provider is not configured.'
          : code === 'AI_OCR_DISABLED'
            ? 'AI Vision OCR is disabled.'
            : code === 'INVALID_PROVIDER_RESPONSE'
              ? 'AI Vision OCR provider returned an invalid response.'
              : 'AI Vision OCR provider is unavailable.'
        return safeError(code, message, status)
      }
      return safeError('AI_OCR_FAILED', 'AI Vision OCR is unavailable.', 500)
    }
  }
}
