import { createRbacCapabilitiesHandler } from '@/lib/server/rbacCapabilitiesHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = createRbacCapabilitiesHandler()
