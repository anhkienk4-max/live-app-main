import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Shift, Brand, Platform, ShiftRegistration, User } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { OperationalStatusStrip } from '@/components/ui/operational-status'
import { OperationalAttention, deriveShiftAttention } from '@/lib/ui/operational-attention'
import { getShiftRoleCapacities } from '@/lib/services/dataService'
import { formatShiftTimeRange, getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { ExternalLink, Calendar as CalendarIcon, MapPin, Users } from 'lucide-react'

export interface ShiftPreviewDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift | null
  brands: Brand[]
  platforms: Platform[]
  registrations: ShiftRegistration[]
  users?: User[]
  onViewFullShift: (shift: Shift) => void
  onPrimaryAction?: (shift: Shift) => void
}

export function ShiftPreviewDrawer({
  open,
  onOpenChange,
  shift,
  brands,
  platforms,
  registrations,
  onViewFullShift,
  onPrimaryAction
}: ShiftPreviewDrawerProps) {
  const { t } = useTranslation()

  if (!shift) return null

  const brandName = brands.find(b => b.id === shift.brand_id)?.name ?? ''
  const platformName = platforms.find(p => p.id === shift.platform_id)?.name ?? ''
  
  const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
  const capacities = getShiftRoleCapacities(shift, shiftRegistrations)
  let pendingCount = 0
  const staffed = { host: 0, support: 0, technical: 0 }
  const required = { host: 0, support: 0, technical: 0 }
  capacities.forEach(c => {
    pendingCount += c.pending
    if (c.role === 'host' || c.role === 'support' || c.role === 'technical') {
      staffed[c.role] = c.approved
      required[c.role] = c.required
    }
  })

  const todayDate = getCurrentBusinessDate()
  const attention: OperationalAttention[] = deriveShiftAttention({
    shiftId: shift.id,
    shiftDate: shift.date,
    shiftStatus: shift.status,
    pendingCount,
    isUpcoming: shift.date >= todayDate,
    required,
    staffed,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed top-0 right-0 left-auto bottom-0 translate-x-0 translate-y-0 h-full max-h-screen sm:max-h-screen sm:h-full w-full sm:w-[420px] sm:max-w-[420px] rounded-none sm:rounded-none border-r-0 border-y-0 border-l shadow-xl overflow-y-auto duration-200 data-open:animate-in data-open:slide-in-from-right data-open:zoom-in-100 data-closed:animate-out data-closed:slide-out-to-right data-closed:zoom-out-100">
        <DialogHeader className="text-left pb-2 mt-4 px-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <ShiftStatusBadge status={shift.status} className="w-fit" />
              <DialogTitle className="text-xl font-bold tracking-tight">
                {shift.title || `${brandName} · ${platformName}`}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-6">
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{shift.date}, {formatShiftTimeRange(shift)}</span>
            </div>
            {(brandName || platformName) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground">Brand/Platform:</span>
                <span className="truncate">{brandName} {platformName ? `(${platformName})` : ''}</span>
              </div>
            )}
            {shift.studio && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{shift.studio}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-muted-foreground">
              <Users className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span>{t('host' as TranslationKey)}: {staffed.host}/{required.host}</span>
                <span>{t('support' as TranslationKey)}: {staffed.support}/{required.support}</span>
                <span>{t('technical' as TranslationKey)}: {staffed.technical}/{required.technical}</span>
              </div>
            </div>
          </div>

          {shift.product_notes && (
            <div className="mt-4 text-sm text-muted-foreground bg-muted/40 p-3 rounded-lg border">
              {shift.product_notes}
            </div>
          )}

          {attention.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold tracking-tight">{t('needsAttention' as TranslationKey) || 'Needs Attention'}</h4>
              <OperationalStatusStrip items={attention} />
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t flex-row gap-2 mt-4 sm:justify-between w-full">
          {onPrimaryAction && (
             <Button onClick={() => onPrimaryAction(shift)} className="flex-1">
               {t('takeAction' as TranslationKey) || 'Take Action'}
             </Button>
          )}
          <Button variant={onPrimaryAction ? "outline" : "default"} onClick={() => onViewFullShift(shift)} className="flex-1">
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('viewFullShift' as TranslationKey) || 'View Full Shift'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
