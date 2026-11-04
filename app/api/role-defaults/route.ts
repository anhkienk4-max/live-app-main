import { createRbac01RoleDefaultsHandler } from '@/lib/server/rbac01RoleDefaultsHandler'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const handler=createRbac01RoleDefaultsHandler()
export const GET=handler.GET
export const POST=handler.POST
