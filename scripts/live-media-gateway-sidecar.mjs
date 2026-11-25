/**
 * Standalone External Media Gateway Sidecar for RC19 W4 Delta C isolated verification.
 *
 * Emulates MediaMTX's JWKS JWT verification boundary on its own origin:
 * - Zero shared memory or process state with Next.js SSR or Supabase DB.
 * - Verifies ES256 JWT signatures against APP_JWKS_URL (or MEDIA_JWT_PUBLIC_JWK_JSON).
 * - Enforces audience, expiry, exact media_path binding, and `action` ('publish' vs 'read').
 * - Holds only the latest published frame per active room in RAM (`record: false`).
 *
 * Endpoints:
 *   GET  /healthz                  -> { ok: true, activeRooms }
 *   POST /<mediaPath>/whip         -> Publish frame packet (requires action: 'publish', path: mediaPath)
 *   DEL  /<mediaPath>/whip         -> End active stream (requires action: 'publish', path: mediaPath)
 *   GET  /<mediaPath>/frame        -> Read latest live frame (requires action: 'read', path: mediaPath)
 */
import http from 'node:http'
import { createPublicKey, verify, randomUUID } from 'node:crypto'

const PORT = Number.parseInt(process.env.MEDIA_GATEWAY_PORT || '8898', 10)
const HOST = process.env.MEDIA_GATEWAY_HOST || '127.0.0.1'
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1:3210'
const EXPECTED_AUDIENCE = process.env.MEDIA_JWT_AUDIENCE || 'ada-media-monitor'
const EXPECTED_ISSUER = process.env.MEDIA_JWT_ISSUER || APP_ORIGIN
const APP_JWKS_URL = process.env.APP_JWKS_URL || `${APP_ORIGIN}/api/media/jwks`
const MAX_BODY_BYTES = 1_500_000
const MEDIA_PATH_RE = /^\/([a-z][a-z0-9_]{0,63})\/(whip|whep|frame)(?:\/([a-zA-Z0-9_-]+))?$/

/** @type {Map<string, { sessionId: string; seq: number; width: number; height: number; timestamp: number; dataUrl: string; updatedAt: number; publisherUserId?: string }>} */
const activeStreams = new Map()

/** @type {{ keys: Array<Record<string, unknown>>; fetchedAt: number } | null} */
let cachedJwks = null

function parseJsonBase64Url(segment) {
  const json = Buffer.from(segment, 'base64url').toString('utf8')
  return JSON.parse(json)
}

async function fetchJwksKeys(forceRefresh = false, jwksUrl = APP_JWKS_URL) {
  const staticJwk = process.env.MEDIA_JWT_PUBLIC_JWKS_JSON
  if (staticJwk) {
    const parsed = JSON.parse(staticJwk)
    return Array.isArray(parsed.keys) ? parsed.keys : []
  }
  const now = Date.now()
  if (!forceRefresh && cachedJwks && now - cachedJwks.fetchedAt < 10_000) {
    return cachedJwks.keys
  }
  const response = await fetch(jwksUrl, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`JWKS_FETCH_FAILED:${response.status}`)
  }
  const payload = await response.json()
  const keys = Array.isArray(payload?.keys) ? payload.keys : []
  cachedJwks = { keys, fetchedAt: now }
  return keys
}

async function verifyMediaJwt(authHeader, requiredAction, mediaPath, options) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('MISSING_BEARER_TOKEN'), { status: 401 })
  }
  const token = authHeader.slice('Bearer '.length).trim()
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw Object.assign(new Error('MALFORMED_JWT'), { status: 401 })
  }

  let header
  let claims
  try {
    header = parseJsonBase64Url(parts[0])
    claims = parseJsonBase64Url(parts[1])
  } catch {
    throw Object.assign(new Error('INVALID_JWT_ENCODING'), { status: 401 })
  }

  if (header?.alg !== 'ES256' || typeof header?.kid !== 'string') {
    throw Object.assign(new Error('UNSUPPORTED_JWT_ALG'), { status: 401 })
  }

  let keys = await fetchJwksKeys(false, options.jwksUrl)
  let jwk = keys.find(entry => entry.kid === header.kid && entry.kty === 'EC')
  if (!jwk) {
    keys = await fetchJwksKeys(true, options.jwksUrl)
    jwk = keys.find(entry => entry.kid === header.kid && entry.kty === 'EC')
  }
  if (!jwk) {
    throw Object.assign(new Error('UNKNOWN_SIGNING_KID'), { status: 401 })
  }

  const keyObject = createPublicKey({ key: jwk, format: 'jwk' })
  const signatureOk = verify(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: keyObject, dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2], 'base64url'),
  )
  if (!signatureOk) {
    throw Object.assign(new Error('INVALID_JWT_SIGNATURE'), { status: 401 })
  }

  const nowSec = Math.floor(Date.now() / 1000)
  if (typeof claims?.exp !== 'number' || claims.exp <= nowSec) {
    throw Object.assign(new Error('JWT_EXPIRED'), { status: 401 })
  }
  if (typeof claims?.nbf === 'number' && claims.nbf > nowSec + 5) {
    throw Object.assign(new Error('JWT_NOT_YET_VALID'), { status: 401 })
  }
  if (claims?.aud !== options.expectedAudience) {
    throw Object.assign(new Error('JWT_AUDIENCE_MISMATCH'), { status: 403 })
  }
  if (options.expectedIssuer && claims?.iss !== options.expectedIssuer) {
    throw Object.assign(new Error('JWT_ISSUER_MISMATCH'), { status: 403 })
  }

  const permissions = Array.isArray(claims?.mediamtx_permissions) ? claims.mediamtx_permissions : []
  const allowed = permissions.some(
    entry =>
      entry
      && typeof entry === 'object'
      && entry.action === requiredAction
      && entry.path === mediaPath,
  )
  if (!allowed) {
    throw Object.assign(new Error('MEDIA_PERMISSION_DENIED'), { status: 403 })
  }

  return claims
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin
  if (origin && (origin === APP_ORIGIN || origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:'))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else {
    res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', chunk => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

function generateSyntheticAnswer(offerSdp) {
  return [
    'v=0',
    `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0 1',
    'a=msid-semantic: WMS *',
    'a=ice-ufrag:adaice01',
    'a=ice-pwd:adapassword0123456789abcdef',
    'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'c=IN IP4 0.0.0.0',
    'a=setup:active',
    'a=mid:0',
    'a=recvonly',
    'a=rtcp-mux',
    'a=rtpmap:96 H264/90000',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'c=IN IP4 0.0.0.0',
    'a=setup:active',
    'a=mid:1',
    'a=recvonly',
    'a=rtcp-mux',
    'a=rtpmap:111 opus/48000/2',
    '',
  ].join('\r\n')
}

export function createGatewayServer(config = {}) {
  const gatewayOptions = {
    expectedIssuer: config.expectedIssuer ?? process.env.MEDIA_JWT_ISSUER ?? process.env.APP_ORIGIN ?? EXPECTED_ISSUER,
    expectedAudience: config.expectedAudience ?? process.env.MEDIA_JWT_AUDIENCE ?? EXPECTED_AUDIENCE,
    jwksUrl: config.jwksUrl ?? process.env.APP_JWKS_URL ?? APP_JWKS_URL,
  }
  return http.createServer(async (req, res) => {
    setCorsHeaders(req, res)

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

    // Purge stale frames older than 30 seconds without heartbeat/frame update
    const cutoff = Date.now() - 30_000
    for (const [key, entry] of activeStreams.entries()) {
      if (entry.updatedAt < cutoff) {
        activeStreams.delete(key)
      }
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, {
        ok: true,
        activeRooms: [...activeStreams.keys()],
      })
      return
    }

    const match = MEDIA_PATH_RE.exec(url.pathname)
    if (!match) {
      sendJson(res, 404, { ok: false, error: { code: 'MEDIA_ENDPOINT_NOT_FOUND' } })
      return
    }

    const mediaPath = match[1]
    const endpoint = match[2]

    try {
      if (endpoint === 'whip' && req.method === 'POST') {
        const claims = await verifyMediaJwt(req.headers.authorization, 'publish', mediaPath, gatewayOptions)
        const contentType = req.headers['content-type'] || ''

        // Real WebRTC WHIP SDP Ingestion
        if (contentType.includes('application/sdp')) {
          const rawSdp = await readBody(req)
          const existing = activeStreams.get(mediaPath)
          if (existing && existing.activePublisher) {
            res.statusCode = 409
            res.setHeader('Content-Type', 'text/plain')
            res.end('DUPLICATE_ACTIVE_PUBLISHER')
            return
          }
          const sessionId = randomUUID()
          activeStreams.set(mediaPath, {
            whipSessionId: sessionId,
            activePublisher: true,
            seq: 1,
            width: 1280,
            height: 720,
            timestamp: Date.now(),
            updatedAt: Date.now(),
            publisherUserId: typeof claims.sub === 'string' ? claims.sub : undefined,
            sdp: rawSdp,
          })
          res.statusCode = 201
          res.setHeader('Content-Type', 'application/sdp')
          res.setHeader('Location', `/${mediaPath}/whip/${sessionId}`)
          res.end(generateSyntheticAnswer(rawSdp))
          return
        }

        const raw = await readBody(req)
        const body = JSON.parse(raw)
        if (
          !body
          || typeof body.sessionId !== 'string'
          || !body.sessionId.trim()
          || typeof body.dataUrl !== 'string'
          || !/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(body.dataUrl)
        ) {
          sendJson(res, 400, { ok: false, error: { code: 'INVALID_MEDIA_FRAME' } })
          return
        }

        const existing = activeStreams.get(mediaPath)
        if (existing && existing.sessionId && existing.sessionId !== body.sessionId && body.handover !== true) {
          sendJson(res, 409, {
            ok: false,
            error: { code: 'DUPLICATE_ACTIVE_PUBLISHER', sessionId: existing.sessionId },
          })
          return
        }

        activeStreams.set(mediaPath, {
          ...existing,
          sessionId: body.sessionId,
          activePublisher: true,
          seq: Number.isFinite(body.seq) ? Number(body.seq) : (existing?.seq ?? 0) + 1,
          width: Number.isFinite(body.width) ? Number(body.width) : 640,
          height: Number.isFinite(body.height) ? Number(body.height) : 360,
          timestamp: Number.isFinite(body.timestamp) ? Number(body.timestamp) : Date.now(),
          dataUrl: body.dataUrl,
          updatedAt: Date.now(),
          publisherUserId: typeof claims.sub === 'string' ? claims.sub : (existing?.publisherUserId ?? undefined),
        })
        sendJson(res, 200, {
          ok: true,
          mediaPath,
          sessionId: body.sessionId,
          seq: activeStreams.get(mediaPath)?.seq,
        })
        return
      }

      if (endpoint === 'whep' && req.method === 'POST') {
        await verifyMediaJwt(req.headers.authorization, 'read', mediaPath, gatewayOptions)
        const entry = activeStreams.get(mediaPath)
        if (!entry) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain')
          res.end('STREAM_NOT_LIVE')
          return
        }
        const rawSdp = await readBody(req)
        const viewerSessionId = randomUUID()
        res.statusCode = 201
        res.setHeader('Content-Type', 'application/sdp')
        res.setHeader('Location', `/${mediaPath}/whep/${viewerSessionId}`)
        res.end(generateSyntheticAnswer(rawSdp))
        return
      }

      if (endpoint === 'whep' && req.method === 'DELETE') {
        res.statusCode = 200
        res.end()
        return
      }

      if (endpoint === 'whip' && req.method === 'DELETE') {
        await verifyMediaJwt(req.headers.authorization, 'publish', mediaPath, gatewayOptions)
        activeStreams.delete(mediaPath)
        sendJson(res, 200, { ok: true, mediaPath, ended: true })
        return
      }

      if (endpoint === 'frame' && req.method === 'GET') {
        await verifyMediaJwt(req.headers.authorization, 'read', mediaPath, gatewayOptions)
        const entry = activeStreams.get(mediaPath)
        if (!entry) {
          sendJson(res, 404, { ok: false, error: { code: 'STREAM_NOT_LIVE' } })
          return
        }
        sendJson(res, 200, {
          ok: true,
          mediaPath,
          sessionId: entry.sessionId,
          seq: entry.seq,
          width: entry.width,
          height: entry.height,
          timestamp: entry.timestamp,
          dataUrl: entry.dataUrl,
        })
        return
      }

      sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED' } })
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 401
      const code = error instanceof Error ? error.message : 'MEDIA_GATEWAY_ERROR'
      sendJson(res, status, { ok: false, error: { code } })
    }
  })
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('live-media-gateway-sidecar.mjs')) {
  const server = createGatewayServer()
  server.listen(PORT, HOST, () => {
    console.log(`[ada-media-gateway] listening on http://${HOST}:${PORT} (jwks=${APP_JWKS_URL})`)
  })
}
