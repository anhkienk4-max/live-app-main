import { LazyLiveMonitoringDashboard } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
export default function LivePage() {
  return (
    <PageShell archetype="command" className="space-y-6">
      <LocalizedPageHeading title="liveMonitor" subtitle="liveSubtitle" />
      <LazyLiveMonitoringDashboard />
    </PageShell>
  )
}
