'use client'

import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { normalizeMultiSelect, toggleMultiSelect } from '@/lib/utils/multiSelectFilter'

export interface MultiSelectFilterOption {
  value: string
  label: string
}

export function getMultiSelectOptionLabel(option: MultiSelectFilterOption) {
  return typeof option.label === 'string' && option.label.trim() ? option.label : option.value
}

export interface MultiSelectFilterProps {
  label: string
  options: MultiSelectFilterOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  testId?: string
}

export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  placeholder = 'All',
  className,
  testId,
}: MultiSelectFilterProps) {
  const [query, setQuery] = React.useState('')
  const selected = normalizeMultiSelect(value)
  const selectedSet = new Set(selected)
  const normalizedOptions = options
    .filter((option, index, all) =>
      option.value !== 'all' && all.findIndex(candidate => candidate.value === option.value) === index,
    )
    .map(option => ({ ...option, label: getMultiSelectOptionLabel(option) }))
  const visibleOptions = normalizedOptions.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()))
  const selectedOptions = normalizedOptions.filter(option => selectedSet.has(option.value))
  const allSelected = selected.length === 0 || (normalizedOptions.length > 0 && normalizedOptions.every(option => selectedSet.has(option.value)))
  const optionValues = normalizedOptions.map(option => option.value)

  const update = (next: string[]) => onChange(normalizeMultiSelect(next))

  return (
    <div className={cn('min-w-0 space-y-1', className)} data-testid={testId}>
      <span className="block text-xs font-medium text-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between gap-2 bg-background font-normal"
              aria-label={label}
              aria-haspopup="menu"
            />
          }
        >
          <span className="min-w-0 truncate">
            {selected.length === 0 ? placeholder : selectedOptions.length <= 2
              ? selectedOptions.map(option => option.label).join(', ')
              : `${selected.length} selected`}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))]">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center justify-between gap-2">
              <span>{label}</span>
              {selected.length > 0 && <span className="text-xs font-normal">{selected.length} selected</span>}
            </DropdownMenuLabel>
            <div className="px-1.5 pb-1.5">
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => event.stopPropagation()}
                placeholder={`Search ${label.toLowerCase()}`}
                aria-label={`Search ${label}`}
                className="h-8"
              />
            </div>
            <div className="flex gap-1 px-1.5 pb-1.5">
              <DropdownMenuItem
                closeOnClick={false}
                disabled={normalizedOptions.length === 0 || allSelected}
                onClick={() => update([])}
                className="flex-1 justify-center"
              >
                <Check className="h-3.5 w-3.5" /> Select all
              </DropdownMenuItem>
              <DropdownMenuItem
                closeOnClick={false}
                disabled={selected.length === 0}
                onClick={() => update([])}
                className="flex-1 justify-center"
              >
                <X className="h-3.5 w-3.5" /> Clear all
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-y-auto">
              {visibleOptions.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matching options</p>
              ) : visibleOptions.map(option => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={allSelected || selectedSet.has(option.value)}
                  closeOnClick={false}
                  onCheckedChange={() => update(toggleMultiSelect(selected, option.value, optionValues))}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </div>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {selectedOptions.length > 0 && (
        <div className="flex max-w-full flex-wrap gap-1" aria-label={`${label} selections`}>
          {selectedOptions.slice(0, 3).map(option => (
            <Badge key={option.value} variant="secondary" className="max-w-full gap-1 text-[10px]">
              <span className="max-w-28 truncate">{option.label}</span>
              <button
                type="button"
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => update(toggleMultiSelect(selected, option.value))}
                aria-label={`Remove ${option.label} from ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selectedOptions.length > 3 && <span className="self-center text-[10px] text-muted-foreground">+{selectedOptions.length - 3} more</span>}
        </div>
      )}
    </div>
  )
}
