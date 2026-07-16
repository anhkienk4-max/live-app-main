import { LazyReportsList } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <LocalizedPageHeading title="reports" subtitle="reportsSubtitle" />
      <LazyReportsList />
    </div>
  )
}
