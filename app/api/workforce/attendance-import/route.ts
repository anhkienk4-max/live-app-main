import { createHistoricalAttendanceHandler } from '@/lib/server/historicalAttendanceHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createHistoricalAttendanceHandler()
export const GET = handler.GET
export const POST = handler.POST
