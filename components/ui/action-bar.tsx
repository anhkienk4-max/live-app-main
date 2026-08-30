'use client'

/**
 * ActionBar — renders a PrioritizedAction[] with correct visual hierarchy.
 *
 * Desktop  : primary (filled) + secondary (outline) visible inline.
 *            Overflow and destructive visible in overflow DropdownMenu.
 *
 * Tablet   : primary visible. Secondary + overflow collapse into MobileActionMenu
 *            when `collapseSecondaryAt` breakpoint is met.
 *
 * Mobile   : primary visible as CTA. Everything else in MobileActionMenu.
 *
 * Destructive actions are always separated (via separator) in menus and
 * use the destructive Button variant when rendered inline.
 *
 * NO business logic here — all actions come in pre-built from builders.
 */

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import type { PrioritizedAction } from '@/lib/ui/action-priority'
import { toMobileMenuActions } from '@/lib/ui/action-priority'
import { useTranslation } from '@/lib/i18n'

interface ActionBarProps {
  actions: PrioritizedAction[]
  /**
   * Breakpoint at which secondary actions collapse into the overflow menu.
   * 'md' = collapse at 768px (default), 'lg' = collapse at 1024px.
   */
  collapseAt?: 'sm' | 'md' | 'lg'
  /** Layout direction of inline actions */
  direction?: 'row' | 'col'
  /** Compact mode — smaller buttons, less gap */
  compact?: boolean
  /** Hide text labels on inline buttons, showing only icons (best for data tables) */
  iconOnly?: boolean
  /** Make inline buttons flex-1 to stretch and fill available space */
  stretch?: boolean
  className?: string
}

export function ActionBar({
  actions,
  collapseAt = 'md',
  direction = 'row',
  compact = false,
  iconOnly = false,
  stretch = false,
  className = '',
}: ActionBarProps) {
  const { t } = useTranslation()
  const primary = actions.filter(a => a.tier === 'primary')
  const secondary = actions.filter(a => a.tier === 'secondary')
  const overflow = actions.filter(a => a.tier === 'overflow')
  const destructive = actions.filter(a => a.tier === 'destructive')

  // Actions that go into the desktop overflow menu
  const desktopOverflowActions = [...overflow]

  // Actions that go into the mobile menu (secondary + overflow + destructive)
  const mobileMenuActions = toMobileMenuActions(actions)

  const gapClass = compact ? 'gap-1' : 'gap-2'
  const dirClass = direction === 'col' ? 'flex-col' : 'flex-row flex-wrap'
  const collapseHide = collapseAt === 'lg' ? 'hidden lg:flex' : collapseAt === 'md' ? 'hidden md:flex' : 'hidden sm:flex'
  const collapseShow = collapseAt === 'lg' ? 'flex lg:hidden' : collapseAt === 'md' ? 'flex md:hidden' : 'flex sm:hidden'

  return (
    <div className={`flex items-center ${gapClass} ${className}`} data-testid="action-bar">
      {/* PRIMARY — always visible */}
      {primary.map(action => (
        <Button
          key={action.key}
          variant="default"
          size={iconOnly ? 'icon' : compact ? 'sm' : 'default'}
          disabled={action.disabled}
          onClick={action.onClick}
          className={stretch ? 'flex-1' : ''}
          data-testid={action.testId ?? `action-primary-${action.key}`}
          aria-label={action.ariaLabel ?? action.label}
          title={iconOnly ? action.label : undefined}
        >
          {action.icon && <span className={iconOnly ? '[&>svg]:size-4' : 'mr-1.5 [&>svg]:size-4'}>{action.icon}</span>}
          {!iconOnly && action.label}
        </Button>
      ))}

      {/* SECONDARY — visible on desktop, collapses on mobile */}
      {secondary.map(action => (
        <Button
          key={action.key}
          variant="outline"
          size={iconOnly ? 'icon' : compact ? 'sm' : 'default'}
          disabled={action.disabled}
          onClick={action.onClick}
          className={`${collapseHide} ${stretch ? 'flex-1' : ''}`}
          data-testid={action.testId ?? `action-secondary-${action.key}`}
          aria-label={action.ariaLabel ?? action.label}
          title={iconOnly ? action.label : undefined}
        >
          {action.icon && <span className={iconOnly ? '[&>svg]:size-4' : 'mr-1.5 [&>svg]:size-4'}>{action.icon}</span>}
          {!iconOnly && action.label}
        </Button>
      ))}

      {/* DESTRUCTIVE — visible on desktop inline, collapses on mobile */}
      {destructive.map(action => (
        <Button
          key={action.key}
          variant="destructive"
          size={iconOnly ? 'icon' : compact ? 'sm' : 'default'}
          disabled={action.disabled}
          onClick={action.onClick}
          className={collapseHide}
          data-testid={action.testId ?? `action-destructive-${action.key}`}
          aria-label={action.ariaLabel ?? action.label}
          title={iconOnly ? action.label : undefined}
        >
          {action.icon && <span className={iconOnly ? '[&>svg]:size-4' : 'mr-1.5 [&>svg]:size-4'}>{action.icon}</span>}
          {!iconOnly && action.label}
        </Button>
      ))}

      {/* OVERFLOW (desktop) — ••• dropdown for overflow + destructive */}
      {desktopOverflowActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground shrink-0 ${collapseHide} ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}
            aria-label={t('moreActions')}
            data-testid="action-overflow-trigger"
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflow.map(action => (
              <DropdownMenuItem
                key={action.key}
                disabled={action.disabled}
                onClick={action.onClick}
                data-testid={action.testId ?? `action-overflow-${action.key}`}
              >
                {action.icon && <span className="mr-2">{action.icon}</span>}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* MOBILE — MobileActionMenu contains secondary + overflow + destructive */}
      {mobileMenuActions.length > 0 && (
        <div className={collapseShow}>
          <MobileActionMenu
            actions={mobileMenuActions}
            breakpoint="always"
            align="end"
          />
        </div>
      )}
    </div>
  )
}
