import * as React from 'react'
import { cn } from '@/lib/utils'

interface AuthPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function AuthPanel({ children, className, ...props }: AuthPanelProps) {
  return (
    <div 
      className={cn(
        "w-full max-w-[400px] flex flex-col space-y-6 mx-auto",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
