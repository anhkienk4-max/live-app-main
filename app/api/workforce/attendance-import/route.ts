import { createHistoricalAttendanceHandler } from '@/lib/server/historicalAttendanceHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Fail-closed until explicitly approved by the owner and DB schema parity verified.
const handler = createHistoricalAttendanceHandler({
  isEnabled: () => process.env.FEATURE_ATTENDANCE_IMPORT === 'true',
})
export const GET = handler.GET
export const POST = handler.POST
