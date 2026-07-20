import { LazyLiveMonitoringDashboard } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
export default function LivePage() {
  return (
    <div className="space-y-6">
      <LocalizedPageHeading title="liveMonitor" subtitle="liveSubtitle" />
      <LazyLiveMonitoringDashboard />
    </div>
  )
}
