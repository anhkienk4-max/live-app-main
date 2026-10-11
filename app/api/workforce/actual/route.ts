import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createWorkforceActualHandler()
export const GET = handler.GET
export const POST = handler.POST
