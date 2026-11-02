import { createDashboardScreenshotRouteHandler } from '@/lib/server/dashboardScreenshotRouteHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = createDashboardScreenshotRouteHandler().GET
