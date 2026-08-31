import { LazyReportsList } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
export default function ReportsPage() {
  return (
    <PageShell archetype="workflow" className="space-y-6">
      <LocalizedPageHeading title="reports" subtitle="reportsSubtitle" />
      <LazyReportsList />
    </PageShell>
  )
}
