import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createWorkforcePayrollHandler()
export const GET = handler.GET
export const POST = handler.POST
