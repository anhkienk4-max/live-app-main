import { createBrandCatalogHandler } from '@/lib/server/brandCatalogHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createBrandCatalogHandler()
export const GET = handler.GET
export const POST = handler.POST
