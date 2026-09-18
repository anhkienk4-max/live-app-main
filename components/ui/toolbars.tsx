import * as React from 'react'
import { cn } from '@/lib/utils'

export function LocalToolbar({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-2 border-y mb-4 bg-muted/20', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export interface StickyActionFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  primaryAction?: React.ReactNode
  secondaryAction?: React.ReactNode
  destructiveAction?: React.ReactNode
  contextMessage?: React.ReactNode
}

export function StickyActionFooter({ primaryAction, secondaryAction, destructiveAction, contextMessage, className, ...props }: StickyActionFooterProps) {
  return (
    <div className={cn("sticky bottom-0 z-50 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t bg-background/95 backdrop-blur shadow-sm", className)} {...props}>
      <div className="text-sm text-muted-foreground">
        {contextMessage}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {destructiveAction && (
          <div className="mr-auto sm:mr-4">
            {destructiveAction}
          </div>
        )}
        {secondaryAction}
        {primaryAction}
      </div>
    </div>
  )
}
