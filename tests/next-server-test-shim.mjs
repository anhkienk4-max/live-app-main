import { createRequire } from 'node:module'

// Node 22 hooks need explicit ESM exports for Next's CommonJS entry point.
const nextServer = createRequire(import.meta.url)('next/server.js')
export const {
  NextRequest, NextResponse, ImageResponse, userAgentFromString, userAgent,
  URLPattern, after, connection,
} = nextServer
export default nextServer
