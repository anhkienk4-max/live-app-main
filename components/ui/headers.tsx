import * as React from 'react'
import { cn } from '@/lib/utils'
import { useRoleLens } from '@/components/providers/RoleLensProvider'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n'

// -----------------------------------------------------------------------------
// Base Header Components
// -----------------------------------------------------------------------------

export function PageHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between', className)}
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
    <div className={cn('flex flex-wrap items-center gap-2', className)} {...props}>
      {children}
    </div>
  )
}

export function PageHeaderScope({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { scopeLabelKey } = useRoleLens()
  const { t } = useTranslation()
  return (
    <div className={cn('flex items-center', className)} {...props}>
      <Badge variant="outline" className="text-xs font-normal">
        {t(scopeLabelKey)}
      </Badge>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Specific Header Types
// -----------------------------------------------------------------------------

export interface ObjectHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  subtitle?: React.ReactNode
  status?: React.ReactNode
  metadata?: React.ReactNode
  actions?: React.ReactNode
}

/**
 * ObjectHeader - entity identity + status + metadata + object actions
 */
export function ObjectHeader({ title, subtitle, status, metadata, actions, className, ...props }: ObjectHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 pb-4 mb-4 border-b", className)} {...props}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {status && <div>{status}</div>}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
      {metadata && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {metadata}
        </div>
      )}
    </div>
  )
}

export interface OperationalHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  riskLevel?: 'low' | 'medium' | 'high'
  liveState?: React.ReactNode
  actions?: React.ReactNode
}

/**
 * OperationalHeader - live/current operational state + risk + time-sensitive actions
 */
export function OperationalHeader({ title, riskLevel, liveState, actions, className, ...props }: OperationalHeaderProps) {
  const riskClass = 
    riskLevel === 'high' ? 'border-danger/30 bg-danger/5 text-danger-foreground' :
    riskLevel === 'medium' ? 'border-warning/30 bg-warning/5 text-warning-foreground' : ''
    
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border", riskClass, className)} {...props}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {liveState && <div>{liveState}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
