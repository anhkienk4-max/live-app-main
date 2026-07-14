import { LazyLiveMonitoringDashboard } from '@/lib/utils/lazyComponents'

export default function LivePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Live Monitoring</h1>
        <p className="text-gray-600">Operational command center for active livestreams</p>
      </div>
      <LazyLiveMonitoringDashboard />
    </div>
  )
}
