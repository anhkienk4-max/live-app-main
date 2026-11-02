import { createScheduleSourceStorageHandler } from '@/lib/server/scheduleSourceStorageHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const handler = createScheduleSourceStorageHandler()

export const GET = handler.GET
export const POST = handler.POST
