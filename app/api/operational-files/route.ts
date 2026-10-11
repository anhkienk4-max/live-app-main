import { createOperationalFileRouteHandler } from '@/lib/server/operationalFileRouteHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const handler = createOperationalFileRouteHandler()

export const GET = handler.GET
export const POST = handler.POST
export const DELETE = handler.DELETE
