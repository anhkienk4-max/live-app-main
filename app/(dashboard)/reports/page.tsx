import { LazyReportsList } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
export default function ReportsPage() {
  return (
    <PageShell archetype="analytics" className="space-y-4 p-4 md:p-6">
      <LocalizedPageHeading title="reports" subtitle="reportsSubtitle" />
      <LazyReportsList />
    </PageShell>
  )
}
