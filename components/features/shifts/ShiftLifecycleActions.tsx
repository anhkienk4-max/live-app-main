'use client'

import * as React from 'react'
import { Shift, ShiftStatus } from '@/lib/types/database.types'
import { shiftService } from '@/lib/services/dataService'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { Play, Pause, CheckCircle, XCircle, Settings, PlayCircle } from 'lucide-react'

interface ShiftLifecycleActionsProps {
  shift: Shift
  onSuccess: (updatedShift: Shift) => void | Promise<void>
  className?: string
}

export function ShiftLifecycleActions({ shift, onSuccess, className = '' }: ShiftLifecycleActionsProps) {
  const { currentUser } = useCurrentUser()
  const { toast } = useToast()
  
  const [busy, setBusy] = React.useState(false)
  const [confirmAction, setConfirmAction] = React.useState<'cancel' | 'complete' | null>(null)

  if (!currentUser || !hasPermission(currentUser, 'shifts.edit')) {
    return null
  }

  const handleStatusChange = async (newStatus: ShiftStatus, reason?: string) => {
    setBusy(true)
    try {
      const updated = await shiftService.update(
        shift.id,
        { status: newStatus, version: shift.version },
        currentUser.id,
        { reason }
      )
      if (updated) {
        toast({ title: 'Success', description: 'Cập nhật trạng thái thành công', variant: 'success' })
        await onSuccess(updated)
      } else {
        toast({ title: 'Error', description: 'Failed to update shift status', variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to update shift status', variant: 'destructive' })
    } finally {
      setBusy(false)
      setConfirmAction(null)
    }
  }

  const handleConfirm = async (reason: string) => {
    if (confirmAction === 'cancel') {
      await handleStatusChange('cancelled', reason)
    } else if (confirmAction === 'complete') {
      await handleStatusChange('completed', reason)
    }
  }

  const dialogProps = {
    cancel: {
      title: 'Hủy ca',
      confirmText: 'Xác nhận hủy',
      requireReason: true,
      variant: 'destructive' as const
    },
    complete: {
      title: 'Hoàn thành Live',
      confirmText: 'Xác nhận hoàn thành',
      requireReason: false,
      variant: 'default' as const
    }
  }

  const activeDialog = confirmAction ? dialogProps[confirmAction] : null

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {shift.status === 'scheduled' && (
        <>
          <Button size="sm" disabled={busy} onClick={() => handleStatusChange('preparing')}>
            <Settings className="w-4 h-4 mr-2" />
            Bắt đầu chuẩn bị
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirmAction('cancel')}>
            <XCircle className="w-4 h-4 mr-2" />
            Hủy ca
          </Button>
        </>
      )}

      {shift.status === 'preparing' && (
        <>
          <Button size="sm" disabled={busy} onClick={() => handleStatusChange('live')}>
            <Play className="w-4 h-4 mr-2" />
            Bắt đầu Live
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirmAction('cancel')}>
            <XCircle className="w-4 h-4 mr-2" />
            Hủy ca
          </Button>
        </>
      )}

      {shift.status === 'live' && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => handleStatusChange('paused')}>
            <Pause className="w-4 h-4 mr-2" />
            Tạm dừng
          </Button>
          <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 text-white" disabled={busy} onClick={() => setConfirmAction('complete')}>
            <CheckCircle className="w-4 h-4 mr-2" />
            Hoàn thành Live
          </Button>
        </>
      )}

      {shift.status === 'paused' && (
        <>
          <Button size="sm" disabled={busy} onClick={() => handleStatusChange('live')}>
            <PlayCircle className="w-4 h-4 mr-2" />
            Tiếp tục Live
          </Button>
          <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 text-white" disabled={busy} onClick={() => setConfirmAction('complete')}>
            <CheckCircle className="w-4 h-4 mr-2" />
            Hoàn thành Live
          </Button>
        </>
      )}

      {activeDialog && (
        <LifecycleActionDialog
          open={!!confirmAction}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          title={activeDialog.title}
          confirmText={activeDialog.confirmText}
          requireReason={activeDialog.requireReason}
          variant={activeDialog.variant}
          impact={null}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}
