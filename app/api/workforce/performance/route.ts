import { createWorkforcePerformanceHandler } from '@/lib/server/workforcePerformanceHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = createWorkforcePerformanceHandler().GET
