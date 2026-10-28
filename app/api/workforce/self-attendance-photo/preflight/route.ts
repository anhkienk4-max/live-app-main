import { GET_PREFLIGHT } from '@/lib/server/selfAttendancePhotoHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin-only read-only provider health. No POST, no folder creation and no upload.
export const GET = GET_PREFLIGHT
