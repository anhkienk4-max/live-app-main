/**
 * Lazy-loaded page components for performance optimization
 * Heavy pages are loaded on-demand to reduce initial bundle size
 */

'use client'

import dynamic from 'next/dynamic'
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

// Calendar view with lazy loading (heavy with multiple views and date calculations)
export const LazyCalendarView = dynamic(
  () => import('@/components/features/calendar/CalendarView').then((mod) => ({ default: mod.CalendarView })),
  {
    loading: () => <PageLoader />,
    ssr: false, // Calendar has client-side date logic
  }
)

// Analytics with lazy loading (heavy with Recharts library)
export const LazyDashboardAnalytics = dynamic(
  () => import('@/components/features/analytics/DashboardAnalytics').then((mod) => ({ default: mod.DashboardAnalytics })),
  {
    loading: () => <PageLoader />,
    ssr: false, // Charts are client-side only
  }
)

// Reports list with lazy loading
export const LazyReportsList = dynamic(
  () => import('@/components/features/reports/ReportsList').then((mod) => ({ default: mod.ReportsList })),
  {
    loading: () => <PageLoader />,
  }
)

// Live monitoring with lazy loading
export const LazyLiveMonitoringDashboard = dynamic(
  () => import('@/components/features/live/LiveMonitoringDashboard').then((mod) => ({ default: mod.LiveMonitoringDashboard })),
  {
    loading: () => <PageLoader />,
  }
)

// Swaps list with lazy loading
export const LazySwapRequestList = dynamic(
  () => import('@/components/features/swaps/SwapRequestList').then((mod) => ({ default: mod.SwapRequestList })),
  {
    loading: () => <PageLoader />,
  }
)
