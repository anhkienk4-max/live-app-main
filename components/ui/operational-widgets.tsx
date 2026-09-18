import * as React from 'react'
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  value: React.ReactNode
  delta?: React.ReactNode
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
}

/**
 * MetricCard - compact, operational, value + label + optional delta/context
 */
export function MetricCard({ label, value, delta, icon, trend, className, ...props }: MetricCardProps) {
  const trendColor = 
    trend === 'up' ? 'text-success' :
    trend === 'down' ? 'text-danger' : 'text-muted-foreground'
    
  return (
    <div className={cn("flex flex-col gap-1 p-4 rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props}>
      <div className="flex items-center justify-between gap-2 text-muted-foreground mb-1">
        <span className="text-sm font-medium leading-none">{label}</span>
        {icon && <span className="shrink-0">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {delta && (
          <span className={cn("text-xs font-medium", trendColor)}>
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}

export interface AttentionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  severity: 'high' | 'medium' | 'low'
  context: React.ReactNode
  action?: React.ReactNode
}

/**
 * AttentionItem - risk/exception oriented, severity, entity/context, next action
 */
export function AttentionItem({ severity, context, action, className, ...props }: AttentionItemProps) {
  const Icon = severity === 'high' ? XCircle : AlertCircle
  const bgClass = 
    severity === 'high' ? 'bg-danger/10 border-danger/20 text-danger-foreground' : 
    severity === 'medium' ? 'bg-warning/10 border-warning/20 text-warning-foreground' :
    'bg-muted border-muted-foreground/20 text-foreground'
  
  const iconClass = 
    severity === 'high' ? 'text-danger' : 
    severity === 'medium' ? 'text-warning' : 'text-muted-foreground'

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md border text-sm", bgClass, className)} {...props}>
      <div className="flex items-start sm:items-center gap-3">
        <Icon className={cn("size-4 shrink-0 mt-0.5 sm:mt-0", iconClass)} />
        <span className="font-medium">{context}</span>
      </div>
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  )
}

export interface DecisionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  context: React.ReactNode
  state?: React.ReactNode
  action?: React.ReactNode
}

/**
 * DecisionItem - decision/approval oriented, context, state, primary decision action
 */
export function DecisionItem({ context, state, action, className, ...props }: DecisionItemProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md border text-sm", className)} {...props}>
      <div className="flex items-start sm:items-center gap-3">
        <CheckCircle2 className="size-4 shrink-0 text-primary mt-0.5 sm:mt-0" />
        <div className="flex flex-col gap-1">
          <span className="font-medium">{context}</span>
          {state && <span className="text-muted-foreground text-xs">{state}</span>}
        </div>
      </div>
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  )
}
