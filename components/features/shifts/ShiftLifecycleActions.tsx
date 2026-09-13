'use client'

import * as React from 'react'
import type { Shift, ShiftStatus } from '@/lib/types/database.types'
import { shiftService } from '@/lib/services/dataService'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

interface ShiftLifecycleActionsProps {
  shift: Shift
  onSuccess: (updatedShift: Shift) => void | Promise<void>
  className?: string
}

export function ShiftLifecycleActions({ shift, onSuccess, className = '' }: ShiftLifecycleActionsProps) {
  const { currentUser } = useCurrentUser()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [busy, setBusy] = React.useState(false)
  const [confirmAction, setConfirmAction] = React.useState<'cancel' | 'complete' | null>(null)

  if (!currentUser || !hasPermission(currentUser, 'shifts.edit')) return null

  const handleStatusChange = async (newStatus: ShiftStatus, reason?: string) => {
    setBusy(true)
    try {
      const updated = await shiftService.update(
        shift.id,
        { status: newStatus, version: shift.version },
        currentUser.id,
        { reason },
      )
      if (updated) {
        toast({ title: 'Success', description: 'Cập nhật trạng thái thành công', variant: 'success' })
        await onSuccess(updated)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update shift status',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
      setConfirmAction(null)
    }
  }

  const handleSelect = (value: string) => {
    const nextStatus = value as ShiftStatus
    if (nextStatus === 'cancelled') setConfirmAction('cancel')
    else if (nextStatus === 'completed') setConfirmAction('complete')
    else void handleStatusChange(nextStatus)
  }

  const handleConfirm = async (reason: string) => {
    if (confirmAction === 'cancel') await handleStatusChange('cancelled', reason)
    if (confirmAction === 'complete') await handleStatusChange('completed', reason)
  }

  const handleReturnToAutomatic = async () => {
    setBusy(true)
    try {
      const updated = await shiftService.returnToAutomatic(shift.id, currentUser.id, shift.version)
      if (updated) await onSuccess(updated)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to return shift to automatic status',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const statusOptions: ShiftStatus[] = shift.status === 'cancelled'
    ? ['cancelled']
    : shift.status === 'completed'
      ? shift.status_mode === 'auto'
        ? ['scheduled', 'preparing', 'live', 'paused', 'completed']
        : ['completed']
      : shift.status === 'scheduled'
        ? ['scheduled', 'preparing', 'cancelled']
        : shift.status === 'preparing'
          ? ['scheduled', 'preparing', 'live', 'paused', 'cancelled']
          : shift.status === 'live'
            ? ['live', 'paused', 'completed']
            : ['live', 'paused', 'completed']

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <Select value={shift.status} onValueChange={handleSelect} disabled={busy}>
        <SelectTrigger className="h-8 w-[150px]" aria-label={t('status')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map(status => (
            <SelectItem key={status} value={status}>{t(status as TranslationKey)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant="outline">
        {t(shift.status_mode === 'manual' ? 'statusManual' : 'statusAutomatic')}
      </Badge>
      {shift.status_mode === 'manual' && shift.status !== 'cancelled' && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleReturnToAutomatic()}>
          {t('returnToAutomatic')}
        </Button>
      )}
      {confirmAction && (
        <LifecycleActionDialog
          open
          onOpenChange={open => !open && setConfirmAction(null)}
          title={confirmAction === 'cancel' ? 'Hủy ca' : 'Hoàn thành Live'}
          confirmText={confirmAction === 'cancel' ? 'Xác nhận hủy' : 'Xác nhận hoàn thành'}
          requireReason={confirmAction === 'cancel'}
          requireImpact={false}
          variant={confirmAction === 'cancel' ? 'destructive' : 'default'}
          impact={null}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}
