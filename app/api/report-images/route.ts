import { createReportImageRouteHandler } from '@/lib/server/reportImageRouteHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const handler = createReportImageRouteHandler()

export const GET = handler.GET
export const POST = handler.POST
export const DELETE = handler.DELETE
