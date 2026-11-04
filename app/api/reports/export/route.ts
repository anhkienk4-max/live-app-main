import { createReportExportHandler } from '@/lib/server/reportExportHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = createReportExportHandler().POST
