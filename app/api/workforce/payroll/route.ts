import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createWorkforcePayrollHandler()

export async function GET(request: Request): Promise<Response> {
  return handler.GET(request)
}

export async function POST(request: Request): Promise<Response> {
  return handler.POST(request)
}
