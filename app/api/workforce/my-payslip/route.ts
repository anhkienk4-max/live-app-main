import { createMyPayslipHandler } from '@/lib/server/myPayslipHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createMyPayslipHandler()

export async function GET(request: Request): Promise<Response> {
  return handler.GET(request)
}
