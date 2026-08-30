'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export interface ActionItem {
  key: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
}

interface MobileActionMenuProps {
  actions: ActionItem[]
  breakpoint?: 'sm' | 'md' | 'lg' | 'always'
  align?: 'start' | 'center' | 'end'
}

export function MobileActionMenu({ actions, breakpoint = 'md', align = 'end' }: MobileActionMenuProps) {
  const { t } = useTranslation()
  if (!actions.length) return null

  const displayClass = breakpoint === 'always' ? 'flex' 
    : breakpoint === 'lg' ? 'flex lg:hidden' 
    : breakpoint === 'md' ? 'flex md:hidden' 
    : 'flex sm:hidden'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 w-11 md:h-9 md:w-9 shrink-0 ${displayClass}`} aria-label={t('actions')}>
        <MoreHorizontal className="h-5 w-5 md:h-4 md:w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {actions.map((action, i) => {
          if (action.separator) {
            return <DropdownMenuSeparator key={`sep-${i}`} />
          }
          return (
            <DropdownMenuItem 
              key={action.key} 
              disabled={action.disabled} 
              onClick={action.onClick}
              className={action.destructive ? 'text-destructive focus:text-destructive focus:bg-destructive/10' : ''}
            >
              {action.icon && <span className="mr-2">{action.icon}</span>}
              {action.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
