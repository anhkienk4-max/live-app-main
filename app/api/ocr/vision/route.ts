import { createVisionOcrPostHandler } from '@/lib/server/visionOcrRouteHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = createVisionOcrPostHandler()
