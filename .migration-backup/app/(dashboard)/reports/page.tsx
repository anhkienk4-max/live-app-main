import { LazyReportsList } from '@/lib/utils/lazyComponents'
export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Reports</h1><p className="text-gray-600">Live session reports and analytics</p></div>
      <LazyReportsList />
    </div>
  )
}
