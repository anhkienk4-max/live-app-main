#!/usr/bin/env node
/**
 * Local Supabase loopback proxy (GoTrue + PostgREST) with strict localhost CORS
 * for reproducible RC19 W4 local UI -> API -> DB verification.
 */

import http from 'node:http'

const proxyHost = '127.0.0.1'
const proxyPort = Number(process.env.LOCAL_PROXY_PORT || '15546')
const authPort = Number(process.env.LOCAL_AUTH_PORT || '15544')
const restPort = Number(process.env.LOCAL_REST_PORT || '15545')
const appOrigin = process.env.LOCAL_APP_ORIGIN || 'http://127.0.0.1:3102'

const allowedOrigins = new Set([
  appOrigin,
  appOrigin.replace('127.0.0.1', 'localhost'),
])

const allowedHeaders = new Set([
  'apikey',
  'authorization',
  'content-type',
  'x-client-info',
  'x-supabase-api-version',
  'accept-profile',
  'content-profile',
  'prefer',
  'range',
  'x-upsert',
  'x-client-runtime',
  'x-client-version',
])

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${proxyHost}:${proxyPort}`)
  const origin = req.headers.origin

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Range, Preference-Applied')
  }

  if (req.method === 'OPTIONS') {
    const requestedHeaders = String(req.headers['access-control-request-headers'] || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    if (!origin || !allowedOrigins.has(origin) || requestedHeaders.some((h) => !allowedHeaders.has(h))) {
      res.writeHead(403)
      return res.end()
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', requestedHeaders.join(', '))
    res.setHeader('Access-Control-Max-Age', '600')
    res.writeHead(204)
    return res.end()
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({
      ok: true,
      proxy: 'rc19-w4-local-cors-proxy',
      listen: `http://${proxyHost}:${proxyPort}`,
      auth_upstream: `http://127.0.0.1:${authPort}`,
      rest_upstream: `http://127.0.0.1:${restPort}`,
    }))
  }

  let targetPort
  let targetPath
  if (url.pathname === '/auth/v1' || url.pathname.startsWith('/auth/v1/')) {
    targetPort = authPort
    targetPath = (url.pathname.slice(8) || '/') + url.search
  } else if (url.pathname === '/rest/v1' || url.pathname.startsWith('/rest/v1/')) {
    targetPort = restPort
    targetPath = (url.pathname.slice(8) || '/') + url.search
  } else if (url.pathname === '/storage/v1' || url.pathname.startsWith('/storage/v1/')) {
    res.writeHead(503, { 'content-type': 'application/json' })
    return res.end('{"error":"LOCAL_STORAGE_API_UNAVAILABLE"}')
  } else {
    res.writeHead(404, { 'content-type': 'application/json' })
    return res.end('{"error":"UNSUPPORTED_LOCAL_PATH"}')
  }

  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: targetPort,
      path: targetPath,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
    res.end('{"error":"UPSTREAM_CONNECTION_FAILED"}')
  })

  req.pipe(upstream)
})

server.listen(proxyPort, proxyHost, () => {
  console.log(`RC19_W4_CORS_PROXY_LISTENING http://${proxyHost}:${proxyPort} -> auth:${authPort}, rest:${restPort}`)
})
