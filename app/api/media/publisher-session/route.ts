import { createMediaPublisherSessionHandler } from '@/lib/server/mediaPublisherSessionHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createMediaPublisherSessionHandler()
export const GET = handler.GET
export const POST = handler.POST
