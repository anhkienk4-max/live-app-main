import { LazyReportsList } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
import { Suspense } from 'react'
export default function ReportsPage() {
  return (
    <PageShell archetype="analytics" className="space-y-6">
      <LocalizedPageHeading title="reports" subtitle="reportsSubtitle" />
      <Suspense><LazyReportsList /></Suspense>
    </PageShell>
  )
}
