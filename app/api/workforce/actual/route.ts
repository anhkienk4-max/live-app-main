import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createWorkforceActualHandler()

export async function GET(request: Request): Promise<Response> {
  return handler.GET(request)
}

export async function POST(request: Request): Promise<Response> {
  return handler.POST(request)
}
