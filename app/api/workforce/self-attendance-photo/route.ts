import { GET as readPhoto, POST as checkInPhoto } from '@/lib/server/selfAttendancePhotoHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = readPhoto
export const POST = checkInPhoto
