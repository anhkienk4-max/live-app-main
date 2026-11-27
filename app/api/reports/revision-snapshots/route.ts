import { createReportRevisionSnapshotHandler } from '@/lib/server/reportRevisionSnapshotHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const handler = createReportRevisionSnapshotHandler()
export const GET = handler.GET
export const POST = handler.POST
