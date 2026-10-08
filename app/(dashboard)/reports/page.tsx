import { LazyReportsList } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
export default function ReportsPage() {
  return (
    <PageShell archetype="analytics" className="space-y-3 p-4">
      <header className="[&_h1]:mb-1 [&_h1]:text-lg [&_h1]:font-semibold [&_p]:text-xs"><LocalizedPageHeading title="reports" subtitle="reportsSubtitle" /></header>
      <LazyReportsList />
    </PageShell>
  )
}
