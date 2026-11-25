import { createWorkforceIncidentMonthlyHandler } from '@/lib/server/workforceIncidentMonthlyHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = createWorkforceIncidentMonthlyHandler().GET
