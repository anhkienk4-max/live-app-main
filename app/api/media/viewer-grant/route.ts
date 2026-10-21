import {createMediaViewerGrantHandler} from '@/lib/server/mediaViewerGrantHandler'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const POST=createMediaViewerGrantHandler().POST
