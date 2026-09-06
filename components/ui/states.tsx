"use client"

import * as React from "react"
import { AlertCircle, Clock, ShieldAlert, FileX2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface StateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
}

function BaseState({ title, description, icon, action, className, children, ...props }: StateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)} {...props}>
      {icon && <div className="mb-4">{icon}</div>}
      {title && <h3 className="mb-1 font-medium">{title}</h3>}
      {description && <p className="mb-4 text-sm text-muted-foreground">{description}</p>}
      {children}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function EmptyState({ icon, className, ...props }: StateProps) {
  return (
    <BaseState
      icon={icon || <FileX2 className="size-10 text-muted-foreground/50" strokeWidth={1.5} />}
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export function NoResultState(props: StateProps) {
  return (
    <EmptyState
      {...props}
      title={props.title}
    />
  )
}

export function InlineError({ title, description, className, ...props }: StateProps) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-danger/20 bg-danger-surface p-4 text-sm text-danger-foreground", className)} {...props}>
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex flex-col gap-1">
        {title && <span className="font-medium">{title}</span>}
        {description && <span>{description}</span>}
      </div>
    </div>
  )
}

export function PageError({ title, description, action, className, ...props }: StateProps) {
  return (
    <BaseState
      icon={<XCircle className="size-12 text-danger" strokeWidth={1.5} />}
      title={title}
      description={description}
      action={action}
      className={className}
      {...props}
    />
  )
}

export function PartialResult({ title, description, className, ...props }: StateProps) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-warning/20 bg-warning-surface p-4 text-sm text-warning-foreground", className)} {...props}>
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex flex-col gap-1">
        {title && <span className="font-medium">{title}</span>}
        {description && <span>{description}</span>}
      </div>
    </div>
  )
}

export function StaleState({ title, description, className, ...props }: StateProps) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-warning/20 bg-warning-surface p-4 text-sm text-warning-foreground", className)} {...props}>
      <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex flex-col gap-1">
        {title && <span className="font-medium">{title}</span>}
        {description && <span>{description}</span>}
      </div>
    </div>
  )
}

export function ConflictState({ title, description, className, ...props }: StateProps) {
  return (
    <BaseState
      icon={<AlertCircle className="size-10 text-warning" strokeWidth={1.5} />}
      title={title}
      description={description}
      className={className}
      {...props}
    />
  )
}

export function PermissionState({ title, description, action, className, ...props }: StateProps) {
  return (
    <BaseState
      icon={<ShieldAlert className="size-10 text-muted-foreground/50" strokeWidth={1.5} />}
      title={title}
      description={description}
      action={action}
      className={className}
      {...props}
    />
  )
}

export function UnknownOutcomeState({ title, description, className, ...props }: StateProps) {
  return (
    <BaseState
      icon={<AlertCircle className="size-10 text-warning" strokeWidth={1.5} />}
      title={title}
      description={description}
      className={className}
      {...props}
    />
  )
}

export function DataFreshness({ timestamp, label, className }: { timestamp: React.ReactNode, label?: React.ReactNode, className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Clock className="size-3.5" />
      <span>{label && <>{label}: </>}{timestamp}</span>
    </div>
  )
}
