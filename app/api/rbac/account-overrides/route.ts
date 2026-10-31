import { createRbac02AccountOverridesHandler } from '@/lib/server/rbac02AccountOverridesHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const handler = createRbac02AccountOverridesHandler()
export const GET = handler.GET
export const POST = handler.POST
