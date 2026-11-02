'use client'

import * as React from 'react'
import { Shift, User, OperationalRole } from '@/lib/types/database.types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserCheck, Users, AlertCircle, CheckCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { shiftRegistrationService } from '@/lib/services/dataService'
import { useToast } from '@/components/ui/toast'

interface BulkStaffingAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedShiftIds: string[]
  shifts: Shift[]
  users: User[]
  onSuccess: (assignedShiftIds: string[]) => void
}

export function BulkStaffingAssignDialog({
  open,
  onOpenChange,
  selectedShiftIds,
  shifts,
  users,
  onSuccess,
}: BulkStaffingAssignDialogProps) {
  const { t, language } = useTranslation()
  const { currentUser } = useCurrentUser()
  const { toast } = useToast()

  const [selectedUserId, setSelectedUserId] = React.useState<string>('')
  const [selectedRole, setSelectedRole] = React.useState<OperationalRole>('host')
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState<{ current: number; total: number } | null>(null)
  const [result, setResult] = React.useState<{
    succeeded: string[]
    failed: Array<{ shiftId: string; error: string }>
  } | null>(null)

  const activeUsers = React.useMemo(() => {
    return users.filter(u => u.status === 'active' && (!u.account_status || u.account_status === 'active'))
  }, [users])

  const eligibleUsers = React.useMemo(() => {
    return activeUsers.filter(u => !u.operational_roles || u.operational_roles.includes(selectedRole))
  }, [activeUsers, selectedRole])

  React.useEffect(() => {
    if (open) {
      setSelectedUserId('')
      setResult(null)
      setProgress(null)
    }
  }, [open])

  const handleAssign = async () => {
    if (!currentUser || !selectedUserId || selectedShiftIds.length === 0) return
    setBusy(true)
    setResult(null)
    setProgress({ current: 0, total: selectedShiftIds.length })

    const succeeded: string[] = []
    const failed: Array<{ shiftId: string; error: string }> = []

    for (let i = 0; i < selectedShiftIds.length; i++) {
      const shiftId = selectedShiftIds[i]
      setProgress({ current: i + 1, total: selectedShiftIds.length })
      try {
        await shiftRegistrationService.assignManually(
          shiftId,
          selectedUserId,
          selectedRole,
          currentUser.id,
        )
        succeeded.push(shiftId)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Assignment failed'
        failed.push({ shiftId, error: message })
      }
    }

    setResult({ succeeded, failed })
    setBusy(false)

    if (failed.length === 0) {
      toast({
        title: language === 'vi' ? 'Phân bổ nhân sự thành công' : 'Staffing assigned',
        description: language === 'vi'
          ? `Đã phân bổ nhân sự cho ${succeeded.length} ca trực.`
          : `Assigned staff to ${succeeded.length} shifts.`,
        variant: 'success',
      })
      onSuccess(succeeded)
      onOpenChange(false)
    } else if (succeeded.length > 0) {
      toast({
        title: t('bulkStaffingPartialResult'),
        description: t('bulkStaffingResultSummary', { succeeded: succeeded.length, failed: failed.length }),
        variant: 'default',
      })
      onSuccess(succeeded)
    } else {
      toast({
        title: t('error'),
        description: failed[0]?.error || 'Failed to assign staff.',
        variant: 'destructive',
      })
    }
  }

  const selectedShiftsSummary = React.useMemo(() => {
    return shifts.filter(s => selectedShiftIds.includes(s.id))
  }, [shifts, selectedShiftIds])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="bulk-staffing-assign-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-blue-600" />
            {language === 'vi' ? 'Phân bổ nhân sự hàng loạt' : 'Bulk Staffing Assignment'}
          </DialogTitle>
          <DialogDescription>
            {language === 'vi'
              ? `Chỉ định nhân viên và vai trò cho ${selectedShiftIds.length} ca trực đã chọn.`
              : `Assign a staff member and operational role across ${selectedShiftIds.length} selected shifts.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
            <span className="font-semibold">{selectedShiftIds.length} ca trực được chọn:</span>
            <div className="mt-1 max-h-24 overflow-y-auto space-y-0.5 font-mono text-[11px]">
              {selectedShiftsSummary.slice(0, 5).map(s => (
                <div key={s.id} className="truncate">
                  • {s.date} ({s.start_time}–{s.end_time}) {s.title || s.brand_name || ''}
                </div>
              ))}
              {selectedShiftsSummary.length > 5 && (
                <div className="text-muted-foreground italic">
                  ...+{selectedShiftsSummary.length - 5} ca khác
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('role')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['host', 'support', 'technical'] as const).map(role => (
                <Button
                  key={role}
                  type="button"
                  variant={selectedRole === role ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 capitalize"
                  onClick={() => setSelectedRole(role)}
                >
                  {t(role)}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {language === 'vi' ? 'Chọn nhân sự' : 'Select Staff Member'}
            </label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              aria-label="Select Staff Member"
              data-testid="bulk-staffing-user-select"
            >
              <option value="">{language === 'vi' ? '— Chọn nhân sự —' : '— Select staff —'}</option>
              {eligibleUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.email})
                </option>
              ))}
            </select>
            {eligibleUsers.length === 0 && (
              <p className="text-xs text-amber-600">
                {language === 'vi'
                  ? `Không tìm thấy nhân sự phù hợp với vai trò ${t(selectedRole)}.`
                  : `No active staff found eligible for ${t(selectedRole)}.`}
              </p>
            )}
          </div>

          {progress && busy && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <div className="flex items-center justify-between font-medium">
                <span>{language === 'vi' ? 'Đang phân bổ...' : 'Assigning...'}</span>
                <span>{progress.current}/{progress.total}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {result && result.failed.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {result.succeeded.length} thành công, {result.failed.length} thất bại:
              </p>
              <ul className="mt-1 max-h-24 overflow-y-auto space-y-0.5 list-disc pl-4">
                {result.failed.map((f, idx) => (
                  <li key={idx}>
                    Ca {f.shiftId}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end">
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
            onClick={handleAssign}
            disabled={busy || !selectedUserId || selectedShiftIds.length === 0}
            data-testid="bulk-staffing-assign-confirm"
          >
            {busy ? t('loading') : (language === 'vi' ? 'Xác nhận phân bổ' : 'Confirm Assignment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
