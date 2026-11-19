import { createStorageResourceRegistryHandler } from '@/lib/server/storageResourceRegistryHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createStorageResourceRegistryHandler()
export const GET = handler.GET
export const POST = handler.POST
