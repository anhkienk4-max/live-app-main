import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Shift, Brand, Platform, ShiftRegistration, User } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { OperationalStatusStrip } from '@/components/ui/operational-status'
import { OperationalAttention, deriveShiftAttention } from '@/lib/ui/operational-attention'
import { getShiftRoleCapacities, isStaffedRegistration } from '@/lib/services/dataService'
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
  users = [],
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
      <DialogContent className="flex flex-col gap-0 p-0 pt-4 fixed top-0 right-0 left-auto bottom-0 translate-x-0 translate-y-0 h-full max-h-screen sm:max-h-screen sm:h-full w-full sm:w-[420px] sm:max-w-[420px] rounded-none sm:rounded-none border-r-0 border-y-0 border-l shadow-xl overflow-y-auto duration-200 data-open:animate-in data-open:slide-in-from-right data-open:zoom-in-100 data-closed:animate-out data-closed:slide-out-to-right data-closed:zoom-out-100">
        <DialogHeader className="min-w-0 shrink-0 text-left p-4 pr-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <ShiftStatusBadge status={shift.status} className="w-fit" />
              <DialogTitle className="text-base font-bold tracking-tight [overflow-wrap:anywhere]">
                {shift.title || `${brandName} · ${platformName}`}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="min-w-0 p-4 space-y-4">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 text-sm">
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
            <section className="space-y-2"><h3 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" />{t('staffing')}</h3>{capacities.map(capacity => {
              const names = [...new Set(shiftRegistrations.filter(row => row.operational_role === capacity.role && isStaffedRegistration(row)).map(row => row.user_id))].map(id => users.find(user => user.id === id)?.full_name).filter(Boolean)
              return <div key={capacity.role} className="rounded-md border bg-slate-50 p-2 text-xs"><div className="flex justify-between gap-2"><span className="font-medium">{t(capacity.role)}</span><span>{capacity.approved}/{capacity.required}</span></div><p className="mt-1 break-words text-muted-foreground">{names.join(', ') || t('notAssigned')}</p></div>
            })}</section>
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

        <DialogFooter className="mx-0 mb-0 mt-auto shrink-0 border-t flex-row gap-2 sm:justify-between w-full">
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
