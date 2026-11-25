import { createMediaViewerGrantHandler } from '@/lib/server/mediaViewerGrantHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createMediaViewerGrantHandler()

export async function POST(request: Request): Promise<Response> {
  return handler.POST(request)
}

