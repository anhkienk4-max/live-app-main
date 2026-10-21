'use client'

import * as React from 'react'
import { SHIFT_DATA_CHANGED_EVENT } from '@/lib/services/shiftChangeSubscription'

export function useShiftChangeRefresh(onRefresh: () => void | Promise<void>) {
  const refreshRef = React.useRef(onRefresh)
  React.useEffect(() => { refreshRef.current = onRefresh }, [onRefresh])
  React.useEffect(() => {
    const listener = () => { void refreshRef.current() }
    window.addEventListener(SHIFT_DATA_CHANGED_EVENT, listener)
    return () => window.removeEventListener(SHIFT_DATA_CHANGED_EVENT, listener)
  }, [])
}
