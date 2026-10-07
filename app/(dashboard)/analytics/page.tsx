'use client'

import { LazyDashboardAnalytics } from '@/lib/utils/lazyComponents'

export default function AnalyticsPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <LazyDashboardAnalytics />
    </div>
  )
}
