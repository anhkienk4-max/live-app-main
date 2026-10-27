import { LazyReportsList } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
import { Suspense } from 'react'
export default function ReportsPage() {
  return (
    <PageShell archetype="analytics" className="ada-reports-page space-y-3 p-4 sm:p-6" data-testid="reports-page">
      <header className="[&_h1]:mb-1 [&_h1]:text-lg [&_h1]:font-semibold [&_p]:text-xs"><LocalizedPageHeading title="reports" subtitle="reportsSubtitle" /></header>
      <Suspense><LazyReportsList /></Suspense>
    </PageShell>
  )
}
