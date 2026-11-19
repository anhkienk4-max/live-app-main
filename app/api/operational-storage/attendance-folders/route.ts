import { createAttendanceFolderMaterializationHandler } from '@/lib/server/attendanceFolderMaterializationHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = createAttendanceFolderMaterializationHandler()
