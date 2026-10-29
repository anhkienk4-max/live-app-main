import { createAttendancePhotoReviewHandler } from '@/lib/server/attendancePhotoReviewHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createAttendancePhotoReviewHandler()
export const GET = handler.GET
export const POST = handler.POST
