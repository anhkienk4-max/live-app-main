import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// Loading component for lazy-loaded pages
const PageLoader = () => {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

function withSuspense<T extends object>(Component: React.ComponentType<T>) {
  return function WrappedComponent(props: T) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Component {...props} />
      </Suspense>
    )
  }
}

// Calendar view with lazy loading
const CalendarViewLazy = lazy(() =>
  import('@/components/features/calendar/CalendarView').then((mod) => ({ default: mod.CalendarView }))
)
export const LazyCalendarView = withSuspense(CalendarViewLazy)

// Analytics with lazy loading
const DashboardAnalyticsLazy = lazy(() =>
  import('@/components/features/analytics/DashboardAnalytics').then((mod) => ({ default: mod.DashboardAnalytics }))
)
export const LazyDashboardAnalytics = withSuspense(DashboardAnalyticsLazy)

// Reports list with lazy loading
const ReportsListLazy = lazy(() =>
  import('@/components/features/reports/ReportsList').then((mod) => ({ default: mod.ReportsList }))
)
export const LazyReportsList = withSuspense(ReportsListLazy)

// Live monitoring with lazy loading
const LiveMonitoringDashboardLazy = lazy(() =>
  import('@/components/features/live/LiveMonitoringDashboard').then((mod) => ({ default: mod.LiveMonitoringDashboard }))
)
export const LazyLiveMonitoringDashboard = withSuspense(LiveMonitoringDashboardLazy)

// Swaps list with lazy loading
const SwapRequestListLazy = lazy(() =>
  import('@/components/features/swaps/SwapRequestList').then((mod) => ({ default: mod.SwapRequestList }))
)
export const LazySwapRequestList = withSuspense(SwapRequestListLazy)
