"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "./input"

export function FilterBar({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)} {...props}>
      {children}
    </div>
  )
}

export function FilterBarSection({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} {...props}>
      {children}
    </div>
  )
}

interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void
}

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ className, onClear, value, ...props }, ref) => {
    return (
      <div className={cn("relative", className)}>
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          value={value}
          className="h-9 pl-9 pr-8"
          {...props}
        />
        {value && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
            <span className="sr-only">Clear search</span>
          </button>
        )}
      </div>
    )
  }
)
SearchField.displayName = "SearchField"

interface ActiveFilterChipProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: string
  onRemove?: () => void
}

export function ActiveFilterChip({ label, value, onRemove, className, ...props }: ActiveFilterChipProps) {
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md border bg-muted/50 pl-2 pr-1 text-xs font-medium text-foreground",
        className
      )}
      {...props}
    >
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-sm p-0.5 opacity-70 ring-offset-background hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="size-3" />
          <span className="sr-only">Remove {label} filter</span>
        </button>
      )}
    </div>
  )
}
