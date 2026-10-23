'use client'

import * as React from 'react'

type ListFeedbackProps = {
  kind: 'loading' | 'empty' | 'error'
  title: string
  description: string
  onRetry?: () => void
}

/** A scoped result state. Empty never implies deleted records or successful synchronization. */
export function ListFeedback({kind,title,description,onRetry}:ListFeedbackProps) {
  return (
    <div role={kind==='error'?'alert':'status'} aria-live={kind==='error'?'assertive':'polite'}
      data-state={kind} className="rounded-lg border border-border bg-muted/20 px-4 py-5">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground break-words">{description}</p>
      </div>
      {kind==='error' && onRetry &&
        <button type="button" className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm
          font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={onRetry}>Thử lại</button>}
    </div>
  )
}
