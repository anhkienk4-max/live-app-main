import { createOperationsCollectionHandler } from '@/lib/server/operationsCollectionHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = createOperationsCollectionHandler().GET
