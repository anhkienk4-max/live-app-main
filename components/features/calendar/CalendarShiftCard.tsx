'use client'

import * as React from 'react'
import { Shift, Brand, Platform, ShiftRegistration, OperationalRole, User } from '@/lib/types/database.types'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'
import { AlertCircle, Clock } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'

interface CalendarShiftCardProps {
  shift: Shift
  brand?: Brand
  platform?: Platform
  registrations?: ShiftRegistration[]
  users?: User[]
  variant: 'compact' | 'standard' | 'expanded'
  onClick?: (shift: Shift) => void
  onRegister?: (shiftId: string, role: OperationalRole) => Promise<void>
}

export function CalendarShiftCard({
  shift,
  brand,
  platform,
  registrations = [],
  users = [],
  variant,
  onClick,
  onRegister,
}: CalendarShiftCardProps) {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()

  const timeRange = formatShiftTimeRange(shift)
  const brandName = brand?.name || t('unknownBrand')
  const platformName = platform?.name
  const campaignName = shift.campaign_id ? 'Campaign Active' : undefined // In real, we'd lookup campaign

  // Resolve staffing
  const hostLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  const supportLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'support', t)
  const technicalLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'technical', t)

  const hasMissingStaff =
    hostLabels.some((l) => l.isUnassigned) ||
    supportLabels.some((l) => l.isUnassigned) ||
    technicalLabels.some((l) => l.isUnassigned)

  const isCompleted = shift.status === 'completed'
  const isCancelled = shift.status === 'cancelled'
  const isLive = shift.status === 'live'

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(shift)
    }
  }

  // A11y Label
  const a11yLabel = `${timeRange} ${brandName} ${platformName || ''}, ${shift.status}, ${hasMissingStaff ? t('staffingIncomplete') : ''}`

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={a11yLabel}
      onClick={() => onClick?.(shift)}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-sm border border-border/50 bg-background text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isCancelled && "opacity-50 grayscale",
        isLive && "border-primary/50 bg-primary/5",
        variant === 'compact' && "p-1.5 text-xs gap-1",
        variant === 'standard' && "p-2 text-sm gap-1.5",
        variant === 'expanded' && "p-3 text-sm gap-2 rounded-md border-border shadow-sm"
      )}
    >
      {/* Time & Status row */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          "font-medium text-foreground/80 flex items-center gap-1",
          variant === 'compact' ? "text-[10px]" : "text-xs"
        )}>
          {variant !== 'compact' && <Clock className="h-3 w-3 opacity-70" />}
          {timeRange}
        </span>
        <ShiftStatusBadge status={shift.status} className={cn(variant === 'compact' && "scale-75 origin-right")} />
      </div>

      {/* Brand & Platform */}
      <div className="flex flex-col gap-0.5">
        <div className="font-semibold leading-tight text-foreground line-clamp-1">
          {brandName} {platformName ? `· ${platformName}` : ''}
        </div>
        {(variant === 'standard' || variant === 'expanded') && campaignName && (
          <div className="text-xs text-muted-foreground line-clamp-1">{campaignName}</div>
        )}
      </div>

      {/* Expanded Only - Studio */}
      {variant === 'expanded' && (
        <div className="text-xs text-muted-foreground mt-1">
          {shift.studio || t('noStudioAssigned')}
        </div>
      )}

      {/* Staffing */}
      {variant === 'compact' ? (
        // Compact Staffing
        <div className="flex items-center gap-1 mt-0.5">
          {hasMissingStaff && <AlertCircle className="h-3 w-3 text-destructive" />}
          <span className="text-[10px] text-muted-foreground truncate">
            {hostLabels.length > 0 ? `H:${hostLabels.filter(l => !l.isUnassigned).length}/${hostLabels.length}` : ''}
            {supportLabels.length > 0 ? ` S:${supportLabels.filter(l => !l.isUnassigned).length}/${supportLabels.length}` : ''}
          </span>
        </div>
      ) : (
        // Standard / Expanded Staffing
        <div className="mt-1 space-y-1">
          {[
            { label: 'Host', data: hostLabels },
            { label: 'Support', data: supportLabels },
            { label: 'Tech', data: technicalLabels }
          ].map(role => role.data.length > 0 && (
            <div key={role.label} className="flex items-start justify-between text-xs gap-2">
              <span className="text-muted-foreground min-w-10">{role.label}</span>
              <span className="text-foreground text-right flex-1 line-clamp-1">
                {role.data.some(l => l.isUnassigned) ? (
                  <span className="text-destructive font-medium flex items-center justify-end gap-1">
                    {role.data.filter(l => !l.isUnassigned).length}/{role.data.length}
                    <AlertCircle className="h-3 w-3" />
                  </span>
                ) : (
                  role.data.map(l => l.name).join(', ')
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded Only - Actions */}
      {variant === 'expanded' && hasMissingStaff && !isCompleted && !isCancelled && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <div className="text-xs font-medium text-destructive mb-2">{t('staffingIncomplete')}</div>
          {currentUser && hasPermission(currentUser, 'shifts.assign_staff') && (
            <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={(e) => {
              e.stopPropagation()
              // Handle action
            }}>
              {t('manageStaffing')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
