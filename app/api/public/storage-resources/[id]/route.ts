import { createPublicStorageResourceHandler } from '@/lib/server/publicStorageResourceHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = createPublicStorageResourceHandler()
