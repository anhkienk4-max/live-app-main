import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CommandToolbarProps = {
  label: string
  children: ReactNode
  className?: string
  loading?: boolean
  id?: string
}

/** Shared responsive landmark for scoped search, filters, refresh, and authorized actions.
 * Children retain control over Apply/Reset and permission-scoped export semantics.
 */
export function CommandToolbar({label,children,className,loading=false,id}:CommandToolbarProps) {
  return <section
    id={id}
    aria-label={label}
    aria-busy={loading}
    data-testid="command-toolbar"
    className={cn('min-w-0 w-full',className)}
  >{children}</section>
}
