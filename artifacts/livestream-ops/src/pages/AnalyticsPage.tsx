import { LazyDashboardAnalytics } from '@/lib/utils/lazyComponents'

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics & Performance</h1>
        <p className="text-gray-600 mt-2">Track revenue, performance, and campaign metrics</p>
      </div>
      <LazyDashboardAnalytics />
    </div>
  )
}
