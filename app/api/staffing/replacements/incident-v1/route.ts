import { createStaffingIncidentReplacementHandler } from '@/lib/server/staffingIncidentReplacementHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = createStaffingIncidentReplacementHandler()
