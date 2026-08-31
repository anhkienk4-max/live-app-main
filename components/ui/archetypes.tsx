import * as React from 'react'
import { cn } from '@/lib/utils'
import type { PageArchetype } from '@/lib/ui/archetypes'

// -----------------------------------------------------------------------------
// Archetype Primitives
// -----------------------------------------------------------------------------

export interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  archetype: PageArchetype
}

/**
 * PageShell establishes the max-width and layout strategy for the archetype.
 */
export function PageShell({ archetype, className, children, ...props }: PageShellProps) {
  const maxWidthClass = React.useMemo(() => {
    switch (archetype) {
      case 'schedule':
      case 'queue':
      case 'analytics':
      case 'directory':
        return 'max-w-[1440px]' // wider workspace
      case 'command':
      case 'workflow':
      case 'configuration':
        return 'max-w-[1280px]' // focused workspace
      case 'auth':
        return 'max-w-md'
      default:
        return 'max-w-7xl'
    }
  }, [archetype])

  return (
    <div data-page-archetype={archetype} className={cn('w-full mx-auto', maxWidthClass, className)} {...props}>
      <div className={cn('flex flex-col w-full', archetype === 'auth' ? '' : 'py-6')}>
        {children}
      </div>
    </div>
  )
}

/**
 * PageHeader groups title, context, and primary actions.
 */
export function PageHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function PageHeaderContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      {children}
    </div>
  )
}

export function PageActions({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      {children}
    </div>
  )
}

/**
 * PageSection for grouping content vertically within a page.
 */
export function PageSection({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn('mb-8 flex flex-col gap-4', className)} {...props}>
      {children}
    </section>
  )
}

export function PageSectionHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between', className)} {...props}>
      {children}
    </div>
  )
}

export function PageSectionBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('w-full', className)} {...props}>
      {children}
    </div>
  )
}

export type PageStateKind = 'loading' | 'empty' | 'error' | 'partial' | 'success'

export interface PageStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  kind: PageStateKind
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

/** Shared state semantics; pages remain responsible for their domain-specific copy and actions. */
export function PageState({ kind, title, description, action, className, ...props }: PageStateProps) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      data-page-state={kind}
      className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}
      {...props}
    >
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function EmptyState(props: Omit<PageStateProps, 'kind'>) {
  return <PageState kind="empty" {...props} />
}

// -----------------------------------------------------------------------------
// Archetype-Specific Regions
// -----------------------------------------------------------------------------

/**
 * SplitWorkspace supports a main pane and an optional side pane (e.g. Schedule details, Queue triage).
 * Stacks naturally on mobile.
 */
export function SplitWorkspace({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col lg:flex-row gap-6', className)} {...props}>
      {children}
    </div>
  )
}

interface WorkspacePaneProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'main' | 'detail'
}

export function WorkspacePane({ side = 'main', className, children, ...props }: WorkspacePaneProps) {
  return (
    <div
      className={cn(
        'flex flex-col',
        side === 'main' ? 'flex-1 min-w-0' : 'w-full lg:w-80 xl:w-96 shrink-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * MetricRegion provides a grid optimized for analytical and command dashboards.
 */
export function MetricRegion({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6', className)} {...props}>
      {children}
    </div>
  )
}
