import { createHistoricalAttendanceHandler } from '@/lib/server/historicalAttendanceHandler'
import { isFeatureEnabled } from '@/lib/flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createHistoricalAttendanceHandler({ isEnabled: () => isFeatureEnabled('attendance_import') })
export const GET = handler.GET
export const POST = handler.POST
