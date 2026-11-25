import { createMediaJwksHandler } from '@/lib/server/mediaJwksHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createMediaJwksHandler()

export async function GET(): Promise<Response> {
  return handler.GET()
}

