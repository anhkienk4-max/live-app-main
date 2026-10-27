import { GET as getCorrectionContext, POST as submitCorrection } from '@/lib/server/selfAttendancePhotoCorrectionHandler'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60
export const GET=getCorrectionContext
export const POST=submitCorrection
