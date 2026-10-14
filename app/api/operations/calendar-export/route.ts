import { createCalendarExportHandler } from '@/lib/server/calendarExportHandler'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = createCalendarExportHandler().POST
