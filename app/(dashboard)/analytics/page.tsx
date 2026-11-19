'use client'

import { LazyDashboardAnalytics } from '@/lib/utils/lazyComponents'

export default function AnalyticsPage() {
  return (
    <div className="ada-workspace-page min-w-0 space-y-4 p-4 md:p-6">
      <LazyDashboardAnalytics />
    </div>
  )
}
