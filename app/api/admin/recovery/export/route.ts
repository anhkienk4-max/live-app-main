import { NextRequest, NextResponse } from 'next/server'
import { currentUserService } from '@/lib/services/dataService'
import { hasPermission } from '@/lib/permissions'
import { exportEmergencyOperationalData } from '@/lib/services/recoveryService'

export async function GET(request: NextRequest) {
  const user = await currentUserService.getCurrent()
  if (!user || !hasPermission(user, 'staff.manage')) {
    return NextResponse.json({ error: 'Admin permission required' }, { status: 403 })
  }
  try {
    const data = await exportEmergencyOperationalData(user)
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Export failed' }, { status: 500 })
  }
}