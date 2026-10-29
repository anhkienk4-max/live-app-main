import { createRbac01bAuditTeamCapabilityHandler } from '@/lib/server/rbac01bAuditTeamCapabilityHandler'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = createRbac01bAuditTeamCapabilityHandler().GET
