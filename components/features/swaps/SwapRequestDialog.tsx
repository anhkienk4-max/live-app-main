'use client'
import * as React from 'react'
import type { Shift, ShiftRegistration, User, UserDirectoryEntry, SwapExchangeCandidate } from '@/lib/types/database.types'
import { userService, shiftRegistrationService, shiftService, swapRequestService } from '@/lib/services/dataService'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { useTranslation } from '@/lib/i18n'

type CreatableSwapMode = 'replacement' | 'exchange'

export function SwapRequestDialog({
  open,
  onOpenChange,
  sourceShift,
  sourceRegistration,
  shifts,
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
  const [mode, setMode] = React.useState<CreatableSwapMode>('replacement')
  const [targetShiftId, setTargetShiftId] = React.useState('')
  const [counterpartId, setCounterpartId] = React.useState('')
  const [replacementId, setReplacementId] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [targetRegistrations, setTargetRegistrations] = React.useState<SwapExchangeCandidate[]>([])

  const [directory, setDirectory] = React.useState<UserDirectoryEntry[]>([])
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void userService.getDirectory().then(next => { if (!cancelled) setDirectory(next) })
      .catch(() => { if (!cancelled) setDirectory([]) })
    return () => { cancelled = true }
  }, [open])
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
    void shiftRegistrationService.getExchangeCandidates(targetShiftId, sourceRegistration.operational_role).then(candidates => {
      if (!cancelled) setTargetRegistrations(candidates.filter(candidate => candidate.user_id !== currentUser.id))
    }).catch(() => { if (!cancelled) setTargetRegistrations([]) })
    return () => { cancelled = true }
  }, [currentUser.id, mode, sourceRegistration.operational_role, targetShiftId])

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
            <Select value={mode} onValueChange={v => { setMode(v as CreatableSwapMode); setCounterpartId(''); setTargetRegistrations([]) }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="replacement">Thế ca</SelectItem>
                <SelectItem value="exchange">Đổi chéo</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {mode === 'replacement' ? (
            <label className="text-xs font-medium">Replacement
              <Select value={replacementId} onValueChange={setReplacementId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {directory.filter(u=>u.id !== currentUser.id && u.operational_roles?.includes(sourceRegistration.operational_role)).map(u=> <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
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
                      {targetRegistrations.map(candidate => <SelectItem key={candidate.registration_id} value={candidate.registration_id}>{candidate.full_name}</SelectItem>)}
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
