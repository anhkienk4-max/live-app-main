'use client'

import * as React from 'react'
import { Shift, Brand, Platform, User, BulkShiftDeletionResult } from '@/lib/types/database.types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Trash2, AlertTriangle, XCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { shiftService } from '@/lib/services/dataService'
import { useToast } from '@/components/ui/toast'

interface BulkDeleteShiftsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedShifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  users?: User[]
  onSuccess: (deletedIds: string[]) => void
}

export function BulkDeleteShiftsDialog({
  open,
  onOpenChange,
  selectedShifts,
  brands,
  platforms,
  onSuccess,
}: BulkDeleteShiftsDialogProps) {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const { toast } = useToast()
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<BulkShiftDeletionResult | null>(null)

  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || brandId
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || platformId

  const handleConfirm = async () => {
    if (!currentUser || selectedShifts.length === 0) return
    setBusy(true)
    try {
      const shiftIds = selectedShifts.map(s => s.id)
      const deletionReason = reason.trim() || t('bulkDeleteDefaultReason')
      const outcomeResult = await shiftService.bulkRemove(shiftIds, currentUser.id, deletionReason)
      setResult(outcomeResult)

      const succeededIds = outcomeResult.outcomes.filter(o => o.success).map(o => o.shift_id)

      if (outcomeResult.failed === 0) {
        toast({
          title: t('shiftDeleted'),
          description: t('bulkDeleteSuccess', { count: outcomeResult.succeeded }),
          variant: 'success',
        })
        onSuccess(succeededIds)
        onOpenChange(false)
      } else if (outcomeResult.succeeded > 0) {
        toast({
          title: t('bulkStaffingPartialResult'),
          description: t('bulkDeletePartial', { succeeded: outcomeResult.succeeded, failed: outcomeResult.failed }),
           variant: 'default',
        })
        onSuccess(succeededIds)
      } else {
        toast({
          title: t('error'),
          description: t('bulkDeletePartial', { succeeded: 0, failed: outcomeResult.failed }),
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to remove selected shifts.'
      toast({
        title: t('error'),
        description: message,
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="bulk-delete-shifts-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            <DialogTitle>{t('bulkDeleteShiftsTitle')}</DialogTitle>
          </div>
          <DialogDescription>
            {t('bulkDeleteShiftsConfirm', { count: selectedShifts.length })}
          </DialogDescription>
        </DialogHeader>

        {result && result.failed > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 mb-3 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {t('bulkDeletePartial', { succeeded: result.succeeded, failed: result.failed })}
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
              {result.outcomes.filter(o => !o.success).map(o => (
                <div key={o.shift_id} className="flex items-center gap-1 text-red-700">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{o.shift_title || o.shift_id}: {o.error_message || o.error_code}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          <div className="rounded-md border bg-slate-50/50 p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
               {t('allShifts')} ({selectedShifts.length})
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {selectedShifts.map(shift => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between gap-3 bg-white p-2.5 rounded border text-sm"
                  data-testid={`bulk-delete-summary-${shift.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">
                      {shift.title || `${getBrandName(shift.brand_id)} · ${getPlatformName(shift.platform_id)}`}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span>{format(new Date(shift.date), 'MMM d, yyyy')}</span>
                      <span>•</span>
                      <span>{formatShiftTimeRange(shift)}</span>
                    </div>
                  </div>
                  <Badge variant={shift.status === 'live' ? 'destructive' : shift.status === 'completed' ? 'default' : 'secondary'} className="text-xs shrink-0">
                    {shift.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">{t('bulkDeleteReasonLabel')}</label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t('bulkDeleteDefaultReason')}
              disabled={busy}
              data-testid="bulk-delete-reason-input"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={busy || selectedShifts.length === 0}
            data-testid="confirm-bulk-delete-btn"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {busy ? t('loading') : t('deleteSelectedCount', { count: selectedShifts.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
