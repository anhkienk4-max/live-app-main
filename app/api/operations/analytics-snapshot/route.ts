import { createAnalyticsSnapshotHandler } from '@/lib/server/analyticsSnapshotHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const { GET } = createAnalyticsSnapshotHandler()
