import { createReleaseProvenanceHandler } from '@/lib/server/releaseProvenanceHandler'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const GET=createReleaseProvenanceHandler()
