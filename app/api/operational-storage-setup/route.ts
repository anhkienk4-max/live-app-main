import { createOperationalStorageSetupHandler } from '@/lib/server/operationalStorageSetupHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createOperationalStorageSetupHandler()
export const GET = handler.GET
export const POST = handler.POST
