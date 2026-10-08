import { LazyLiveMonitoringDashboard } from '@/lib/utils/lazyComponents'
import { PageShell } from '@/components/ui/archetypes'
export default function LivePage() {
  return (
    <PageShell archetype="command" className="space-y-3 p-4">
      <LazyLiveMonitoringDashboard />
    </PageShell>
  )
}
