'use client'

import { LazyDashboardAnalytics } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'

export default function AnalyticsPage() {
  return (
    <PageShell archetype="analytics" className="space-y-6">
      <LocalizedPageHeading title="analyticsTitle" subtitle="analyticsSubtitle" />
      <LazyDashboardAnalytics />
    </PageShell>
  )
}
