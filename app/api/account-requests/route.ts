import {
  createAccountRequestGetHandler,
  createAccountRequestPostHandler,
} from '@/lib/server/accountRequestRouteHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = createAccountRequestPostHandler()
export const GET = createAccountRequestGetHandler()
