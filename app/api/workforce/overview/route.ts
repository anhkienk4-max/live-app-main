import { createWorkforceOverviewHandler } from '@/lib/server/workforceOverviewHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = createWorkforceOverviewHandler().GET
