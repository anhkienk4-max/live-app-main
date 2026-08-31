import * as React from 'react'
import { cn } from '@/lib/utils'

export type ProgressiveDisclosureLevel =
  | 'always_visible'
  | 'secondary_visible'
  | 'expandable'
  | 'detail_only'
  | 'overflow'
  | 'contextual'
  | 'role_hidden'

export interface ProgressiveDisclosureProps extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, 'open'> {
  children: React.ReactNode
  level: Exclude<ProgressiveDisclosureLevel, 'always_visible' | 'role_hidden'>
  summary: React.ReactNode
  defaultOpen?: boolean
}

/**
 * A small, native disclosure primitive for secondary or advanced information.
 * Native <details>/<summary> supplies keyboard and screen-reader semantics while
 * keeping disclosure state local to the surface that owns the information.
 */
export function ProgressiveDisclosure({
  children,
  className,
  defaultOpen = false,
  level,
  summary,
  ...props
}: ProgressiveDisclosureProps) {
  const contentId = React.useId()

  return (
    <details
      className={cn('rounded-lg border', className)}
      data-disclosure-level={level}
      open={defaultOpen}
      {...props}
    >
      <summary
        aria-controls={contentId}
        className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
        data-disclosure-summary="true"
      >
        <span className="min-w-0">{summary}</span>
        <span aria-hidden="true" className="text-muted-foreground">⌄</span>
      </summary>
      <div className="border-t px-4 pb-4 pt-4" id={contentId}>
        {children}
      </div>
    </details>
  )
}
