'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ActionBar } from '@/components/ui/action-bar'
import type { PrioritizedAction } from '@/lib/ui/action-priority'

export interface BottomActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  actions: PrioritizedAction[]
  /** If true, the bar is always visible. If false, it only appears on mobile (sm or md). */
  alwaysVisible?: boolean
  /** Hides the action bar if there are no primary actions to show. */
  hideEmpty?: boolean
  /** Breakpoint where this shows up (if not alwaysVisible). Usually 'md' (shows below 768px). */
  showBelow?: 'sm' | 'md' | 'lg'
}

/**
 * A fixed action bar anchored to the bottom of the viewport. 
 * Uses safe-area-inset-bottom to avoid mobile home indicators.
 * Best used on forms, live monitoring, or task-oriented screens.
 */
export function BottomActionBar({
  actions,
  alwaysVisible = false,
  hideEmpty = true,
  showBelow = 'md',
  className,
  ...props
}: BottomActionBarProps) {
  const hasActions = actions.length > 0
  const primaryCount = actions.filter(a => a.tier === 'primary').length

  if (!hasActions) return null
  if (hideEmpty && primaryCount === 0) return null

  const displayClass = alwaysVisible 
    ? 'flex' 
    : showBelow === 'lg' ? 'flex lg:hidden'
    : showBelow === 'md' ? 'flex md:hidden'
    : 'flex sm:hidden'

  return (
    <>
      {/* Spacer to prevent content from being hidden behind the fixed bar */}
      <div className={cn(displayClass, 'h-24 w-full shrink-0 pointer-events-none')} aria-hidden="true" />
      
      {/* Fixed Bottom Bar */}
      <div 
        className={cn(
          displayClass,
          'fixed bottom-0 left-0 right-0 z-50 flex-col',
          'bg-background border-t border-border shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)]',
          'p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]', // Safe area support
          className
        )}
        data-testid="bottom-action-bar"
        {...props}
      >
        <div className="w-full max-w-[1440px] mx-auto">
          <ActionBar 
            actions={actions} 
            collapseAt="md" // Ensure it collapses secondary items into menu
            compact={false}
            stretch={true}  // Make the primary button stretch full width
          />
        </div>
      </div>
    </>
  )
}

export interface ResponsiveActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  actions: PrioritizedAction[]
  /** Breakpoint at which the actions are grouped into a mobile overflow. Default: 'md' (768px). */
  collapseAt?: 'sm' | 'md' | 'lg'
}

/**
 * ResponsiveActions renders actions inline horizontally on desktop.
 * On mobile, it automatically collapses secondary, overflow, and destructive actions into an ActionOverflow menu.
 */
export function ResponsiveActions({
  actions,
  collapseAt = 'md',
  className,
  ...props
}: ResponsiveActionsProps) {
  if (!actions || actions.length === 0) return null

  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      <ActionBar actions={actions} collapseAt={collapseAt} />
    </div>
  )
}

