'use client'

import { LazyDashboardAnalytics } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <LocalizedPageHeading title="analyticsTitle" subtitle="analyticsSubtitle" />
      <LazyDashboardAnalytics />
    </div>
  )
}
