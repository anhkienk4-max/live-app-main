import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Shared client-data loading skeleton for page initial fetches.
 * Represents common page content (stat cards + list rows) instead of a blank
 * "Loading..." text, so the UI never flashes empty while Supabase data loads.
 */
export function ContentSkeleton() {
  return (
    <div className="space-y-6 p-6" data-testid="content-skeleton">
      <div className="grid gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={`stat-${index}`} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-8 w-64" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={`row-${index}`} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}
