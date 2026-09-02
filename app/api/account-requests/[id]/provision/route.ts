import { createAccountRequestProvisioningPostHandler } from '@/lib/server/accountRequestProvisioningRouteHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const post = createAccountRequestProvisioningPostHandler()

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  return post(request, id)
}
