import * as React from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AuthStatusType = 'error' | 'success' | 'warning' | 'info'

interface AuthStatusStateProps {
  type: AuthStatusType
  message: string
  testId?: string
  className?: string
}

export function AuthStatusState({ type, message, testId, className }: AuthStatusStateProps) {
  if (!message) return null

  const Icon = {
    error: AlertCircle,
    success: CheckCircle2,
    warning: AlertCircle,
    info: Info,
  }[type]

  const styles = {
    error: 'border-destructive/50 bg-destructive/10 text-destructive',
    success: 'border-green-200 bg-green-50 text-green-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  }[type]

  return (
    <div 
      className={cn("flex items-center gap-3 rounded-lg border p-4 text-sm shadow-sm", styles, className)}
      data-testid={testId}
      role="alert"
    >
      <Icon className="size-5 shrink-0" />
      <p className="font-medium leading-relaxed">{message}</p>
    </div>
  )
}
