export class RequestBodyError extends Error {
  constructor(
    public readonly status: 400 | 413,
    public readonly code: 'MALFORMED_REQUEST' | 'PAYLOAD_TOO_LARGE',
    message: string,
  ) {
    super(message)
    this.name = 'RequestBodyError'
  }
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
const maximumRateLimitEntries = 10_000

export function requestIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function consumeRateLimit({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: {
  key: string
  limit: number
  windowMs: number
  now?: number
}) {
  if (rateLimitStore.size > maximumRateLimitEntries) {
    for (const [entryKey, entry] of rateLimitStore) {
      if (entry.resetAt <= now) rateLimitStore.delete(entryKey)
    }
  }

  const existing = rateLimitStore.get(key)
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    rateLimitStore.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt }
  }

  existing.count += 1
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  }
}

export function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  return Response.json(
    {
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(retryAfter),
      },
    },
  )
}

async function readRequestBytes(request: Request, maximumBytes: number) {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyError(
      413,
      'PAYLOAD_TOO_LARGE',
      'The request body is too large.',
    )
  }

  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maximumBytes) {
      await reader.cancel()
      throw new RequestBodyError(
        413,
        'PAYLOAD_TOO_LARGE',
        'The request body is too large.',
      )
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function readJsonBody(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  const bytes = await readRequestBytes(request, maximumBytes)
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new RequestBodyError(
      400,
      'MALFORMED_REQUEST',
      'The JSON request body is malformed.',
    )
  }
}

export async function readFormDataBody(
  request: Request,
  maximumBytes: number,
) {
  const bytes = await readRequestBytes(request, maximumBytes)
  try {
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bytes,
    })
    return await boundedRequest.formData()
  } catch (error) {
    if (error instanceof RequestBodyError) throw error
    throw new RequestBodyError(
      400,
      'MALFORMED_REQUEST',
      'The multipart request body is malformed.',
    )
  }
}

export class OperationTimeoutError extends Error {
  constructor() {
    super('The server operation timed out.')
    this.name = 'OperationTimeoutError'
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new OperationTimeoutError()), timeoutMs)
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
