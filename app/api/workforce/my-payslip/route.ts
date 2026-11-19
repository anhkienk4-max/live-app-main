import { createMyPayslipHandler } from '@/lib/server/myPayslipHandler'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const handler=createMyPayslipHandler()
export const GET=handler.GET
