import * as React from 'react'
import { Clock } from 'lucide-react'

export function CurrentTimeIndicator() {
  
  return (
    <div className="relative flex items-center py-2 z-10">
      <div className="absolute left-0 flex items-center justify-center bg-primary text-primary-foreground rounded-full w-6 h-6 shadow-sm z-10" style={{ transform: 'translateX(-50%)' }}>
        <Clock className="w-3 h-3" />
      </div>
      <div className="w-full border-t-2 border-primary border-dashed shadow-sm"></div>
    </div>
  )
}
