import { createWorkforceCapabilitiesHandler } from '@/lib/server/workforceCapabilitiesHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = createWorkforceCapabilitiesHandler().GET
