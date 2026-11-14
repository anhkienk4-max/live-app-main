'use client'

import * as React from 'react'
import { invalidatePageCache } from '@/lib/services/operationsPageCache'
import { SHIFT_DATA_CHANGED_EVENT, subscribeToShiftChanges } from '@/lib/services/shiftChangeSubscription'
import { createClient } from '@/lib/supabase/client'

export function ShiftChangeBridge({ userId, enabled }: { userId: string | null; enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled || !userId) return
    return subscribeToShiftChanges(createClient(), userId, () => {
      invalidatePageCache(undefined, [
        'shifts', 'open_shifts', 'my_shifts', 'live_shifts', 'calendar_window',
        'registration_reviews', 'swaps', 'reports', 'report_queue', 'analytics_reports',
      ])
      window.dispatchEvent(new Event(SHIFT_DATA_CHANGED_EVENT))
    })
  }, [enabled, userId])
  return null
}
