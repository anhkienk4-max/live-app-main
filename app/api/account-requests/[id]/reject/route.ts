import { createAccountRequestReviewPostHandler } from '@/lib/server/accountRequestRouteHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const post = createAccountRequestReviewPostHandler('reject')

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  return post(request, id)
}
