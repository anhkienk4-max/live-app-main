import { createScheduleSourceStorageHandler } from '@/lib/server/scheduleSourceStorageHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const handler = createScheduleSourceStorageHandler()

export async function GET(request: Request): Promise<Response> {
  return handler.GET(request)
}

export async function POST(request: Request): Promise<Response> {
  return handler.POST(request)
}
