import { createReportExternalSummaryHandler } from '@/lib/server/reportExternalSummaryHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createReportExternalSummaryHandler()
export const GET = handler.GET
export const POST = handler.POST
