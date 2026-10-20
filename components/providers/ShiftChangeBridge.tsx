'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { invalidatePageCache } from '@/lib/services/operationsPageCache'
import { SHIFT_DATA_CHANGED_EVENT, subscribeToShiftChanges } from '@/lib/services/shiftChangeSubscription'
import { createClient } from '@/lib/supabase/client'

export function ShiftChangeBridge({ userId, enabled }: { userId: string | null; enabled: boolean }) {
  const router = useRouter()
  React.useEffect(() => {
    if (!enabled || !userId) return
    return subscribeToShiftChanges(createClient(), userId, () => {
      invalidatePageCache()
      window.dispatchEvent(new Event(SHIFT_DATA_CHANGED_EVENT))
      router.refresh()
    })
  }, [enabled, router, userId])
  return null
}
