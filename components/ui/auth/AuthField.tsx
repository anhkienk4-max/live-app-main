import * as React from 'react'

interface AuthFieldProps {
  label: string
  error?: string | boolean | null
  children: React.ReactNode
  htmlFor?: string
}

export function AuthField({ label, error, children, htmlFor }: AuthFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label 
          htmlFor={htmlFor}
          className="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </label>
      </div>
      {children}
      {typeof error === 'string' && error && (
        <span className="text-xs font-medium text-destructive">{error}</span>
      )}
    </div>
  )
}
