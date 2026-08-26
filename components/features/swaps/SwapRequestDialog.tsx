'use client'
import * as React from 'react'
import type { Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { isStaffedRegistration, shiftRegistrationService, shiftService, swapRequestService } from '@/lib/services/dataService'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useTranslation } from '@/lib/i18n'

type SwapMode = 'replacement' | 'move' | 'exchange'

export function SwapRequestDialog({
  open,
  onOpenChange,
  sourceShift,
  sourceRegistration,
  shifts,
  users,
  currentUser,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceShift: Shift
  sourceRegistration: ShiftRegistration
  shifts: Shift[]
  users: User[]
  currentUser: User
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [mode, setMode] = React.useState<SwapMode>('move')
  const [targetShiftId, setTargetShiftId] = React.useState('')
  const [counterpartId, setCounterpartId] = React.useState('')
  const [replacementId, setReplacementId] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [targetRegistrations, setTargetRegistrations] = React.useState<ShiftRegistration[]>([])

  const [loadedShifts, setLoadedShifts] = React.useState<Shift[]>([])
  React.useEffect(() => {
    if (shifts.length > 0) return
    let cancelled = false
    void shiftService.getAll().then(next => { if (!cancelled) setLoadedShifts(next) })
    return () => { cancelled = true }
  }, [shifts.length])
  const allShifts = shifts.length > 0 ? shifts : loadedShifts
  const targetShifts = React.useMemo(() => allShifts.filter(s => s.id !== sourceShift.id && s.status === 'scheduled'), [allShifts, sourceShift.id])
  React.useEffect(() => {
    let cancelled = false
    if (mode !== 'exchange' || !targetShiftId) return () => { cancelled = true }
    void shiftRegistrationService.getForShift(targetShiftId).then(registrations => {
      if (!cancelled) setTargetRegistrations(registrations.filter(registration =>
        isStaffedRegistration(registration) &&
        registration.operational_role === sourceRegistration.operational_role &&
        registration.user_id !== currentUser.id &&
        users.some(user => user.id === registration.user_id && user.status === 'active'),
      ))
    }).catch(() => {
      if (!cancelled) setTargetRegistrations([])
    })
    return () => { cancelled = true }
  }, [currentUser.id, mode, sourceRegistration.operational_role, targetShiftId, users])

  const counterpartOptions = React.useMemo(() => targetRegistrations
    .map(registration => ({ registration, user: users.find(user => user.id === registration.user_id) }))
    .filter((entry): entry is { registration: ShiftRegistration; user: User } => Boolean(entry.user)), [targetRegistrations, users])

  const submit = async () => {
    if (!reason.trim()) { toast({ title: t('error'), description: 'Reason required', variant: 'destructive' }); return }
    setBusy(true)
    try {
      if (mode === 'replacement') {
        if (!replacementId) throw new Error('Replacement required')
        await swapRequestService.create({
          shift_id: sourceShift.id,
          requester_id: currentUser.id,
          operational_role: sourceRegistration.operational_role,
          source_registration_id: sourceRegistration.id,
          replacement_staff_id: replacementId,
          reason: reason.trim(),
          mode: 'replacement',
        } as unknown as never)
      } else if (mode === 'move') {
        if (!targetShiftId) throw new Error('Target required')
        await swapRequestService.create({
          requester_id: currentUser.id,
          operational_role: sourceRegistration.operational_role,
          source_registration_id: sourceRegistration.id,
          target_shift_id: targetShiftId,
          reason: reason.trim(),
          shift_id: sourceShift.id,
          mode: 'move',
        } as unknown as never)
      } else {
        if (!targetShiftId || !counterpartId) throw new Error('Target and counterpart required')
        await swapRequestService.create({
          requester_id: currentUser.id,
          operational_role: sourceRegistration.operational_role,
          source_registration_id: sourceRegistration.id,
          target_shift_id: targetShiftId,
          counterpart_registration_id: counterpartId,
          reason: reason.trim(),
          shift_id: sourceShift.id,
          mode: 'exchange',
        } as unknown as never)
      }
      toast({ title: t('success'), description: 'Swap request submitted', variant: 'success' })
      onSuccess()
      onOpenChange(false)
      setReason(''); setTargetShiftId(''); setCounterpartId(''); setReplacementId('')
    } catch (e) {
      toast({ title: t('error'), description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Đổi ca</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="text-sm text-muted-foreground">Source: {sourceShift.date} {sourceShift.start_time}-{sourceShift.end_time} · {sourceRegistration.operational_role}</div>
          <label className="text-xs font-medium">Mode
            <Select value={mode} onValueChange={v => { setMode(v as SwapMode); setCounterpartId(''); setTargetRegistrations([]) }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="replacement">Thay người</SelectItem>
                <SelectItem value="move">Chuyển ca</SelectItem>
                <SelectItem value="exchange">Đổi ca</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {mode === 'replacement' ? (
            <label className="text-xs font-medium">Replacement
              <Select value={replacementId} onValueChange={setReplacementId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {users.filter(u=>u.status === 'active' && u.id !== currentUser.id && u.operational_roles?.includes(sourceRegistration.operational_role)).map(u=> <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          ) : (
            <>
              <label className="text-xs font-medium">Target shift
                <Select value={targetShiftId} onValueChange={value => { setTargetShiftId(value); setCounterpartId(''); setTargetRegistrations([]) }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select target" /></SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {targetShifts.map(s=> <SelectItem key={s.id} value={s.id}>{s.date} {s.start_time} {s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              {mode === 'exchange' && (
                <label className="text-xs font-medium">Counterpart registration
                  <Select value={counterpartId} onValueChange={setCounterpartId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select counterpart" /></SelectTrigger>
                    <SelectContent className="max-h-64 overflow-y-auto">
                      {counterpartOptions.map(({ registration, user }) => <SelectItem key={registration.id} value={registration.id}>{user.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
            </>
          )}
          <label className="text-xs font-medium">Reason
            <Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason" />
          </label>
          <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Submitting...' : 'Submit'}</Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
