'use client'

import * as React from 'react'
import { Shift, Brand, Platform, Campaign, ShiftRegistration, User } from '@/lib/types/database.types'
import { format } from 'date-fns'
import { useTranslation } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'
import { AlertCircle, Clock, MapPin, Users, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'

interface ShiftPreviewDrawerProps {
  shift: Shift | null
  brand?: Brand
  platform?: Platform
  campaign?: Campaign
  registrations?: ShiftRegistration[]
  users?: User[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onViewFullDetail: (shiftId: string) => void
  onManageStaffing?: (shiftId: string) => void
}

export function ShiftPreviewDrawer({
  shift,
  brand,
  platform,
  campaign,
  registrations = [],
  users = [],
  open,
  onOpenChange,
  onViewFullDetail,
  onManageStaffing,
}: ShiftPreviewDrawerProps) {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()

  if (!shift) return null

  const timeRange = formatShiftTimeRange(shift)
  const brandName = brand?.name || t('unknownBrand')

  const hostLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  const supportLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'support', t)
  const technicalLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'technical', t)

  const missingStaff = [
    ...hostLabels.filter(l => l.isUnassigned).map(() => 'Host'),
    ...supportLabels.filter(l => l.isUnassigned).map(() => 'Support'),
    ...technicalLabels.filter(l => l.isUnassigned).map(() => 'Technical'),
  ]
  const hasMissingStaff = missingStaff.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full overflow-y-auto flex flex-col p-0 !top-0 !right-0 !left-auto !translate-x-0 !translate-y-0 !h-screen !rounded-none !max-h-screen !w-full sm:!max-w-[520px] data-closed:!slide-out-to-right data-open:!slide-in-from-right data-open:!zoom-in-100 data-closed:!zoom-out-100">

        {/* Header */}
        <div className="px-6 py-4 border-b bg-muted/20 mt-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2 className="text-lg font-semibold leading-tight">
              {brandName} {platform?.name ? `· ${platform.name}` : ''}
            </h2>
            <ShiftStatusBadge status={shift.status} />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{format(new Date(shift.date), 'EEEE, MMM d, yyyy')}</span>
            <span>•</span>
            <span>{timeRange}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 space-y-6">

          {/* Summary */}
          <section className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('summary')}</h3>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div className="text-muted-foreground">{t('campaign')}</div>
              <div className="font-medium">{campaign?.name || '—'}</div>

              <div className="text-muted-foreground">{t('studio')}</div>
              <div className="font-medium flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {shift.studio || '—'}
              </div>
            </div>
          </section>

          {/* Staffing */}
          <section className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              {t('staffing')}
            </h3>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Host', data: hostLabels },
                { label: 'Support', data: supportLabels },
                { label: 'Technical', data: technicalLabels }
              ].map(role => role.data.length > 0 && (
                <div key={role.label} className="grid grid-cols-2 py-1">
                  <div className="text-muted-foreground">{role.label}</div>
                  <div className="font-medium">
                    {role.data.some(l => l.isUnassigned) ? (
                      <span className="text-destructive flex items-center gap-1">
                        {role.data.filter(l => !l.isUnassigned).length} / {role.data.length} {t('assigned')}
                        <AlertCircle className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="space-y-1 block">
                        {role.data.map((l, i) => (
                          <div key={i} className="flex items-center gap-1">
                            {l.name}
                            {l.isImportedOnly && <span className="text-[10px] text-muted-foreground border px-1 rounded-sm ml-1">Imported</span>}
                          </div>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Alerts */}
          {hasMissingStaff && shift.status !== 'completed' && shift.status !== 'cancelled' && (
            <section className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-destructive">{t('needsAttention')}</h4>
                  <p className="text-xs text-destructive/90 mt-1">
                    Missing {missingStaff.length} role(s): {Array.from(new Set(missingStaff)).join(', ')}
                  </p>
                </div>
              </div>
            </section>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-background flex flex-col gap-2 shrink-0">
          {hasMissingStaff && currentUser && hasPermission(currentUser, 'shifts.assign_staff') && (
            <Button
              variant="default"
              className="w-full"
              onClick={() => onManageStaffing?.(shift.id)}
            >
              {t('manageStaffing')}
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => onViewFullDetail(shift.id)}
          >
            {t('viewFullDetail')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}
