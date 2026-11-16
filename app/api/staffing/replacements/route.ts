import { createStaffingReplacementHandler } from '@/lib/server/staffingReplacementHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = createStaffingReplacementHandler()
