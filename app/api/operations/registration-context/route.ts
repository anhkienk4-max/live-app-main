import { createRegistrationReviewContextHandler } from '@/lib/server/registrationReviewContextHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const { GET } = createRegistrationReviewContextHandler()
