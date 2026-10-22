'use client'
import * as React from 'react'
import type { Shift, ShiftRegistration, User, UserDirectoryEntry, SwapExchangeCandidate } from '@/lib/types/database.types'
import { userService, shiftRegistrationService, shiftService, swapRequestService } from '@/lib/services/dataService'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useTranslation } from '@/lib/i18n'

const EMPTY_SHIFT_ROWS: Shift[] = []

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
  const submitLock = React.useRef(false)
  const [targetSearchDraft, setTargetSearchDraft] = React.useState('')
  const [targetSearch, setTargetSearch] = React.useState('')
  const [targetPage, setTargetPage] = React.useState(1)
  const [targetRevision, setTargetRevision] = React.useState(0)
  const pageSize = 20
  const targetKey = [currentUser.id, sourceShift.id, targetSearch, targetPage, targetRevision].join(':')
  const [targetSnapshot, setTargetSnapshot] = React.useState<{key: string; items: Shift[]; total: number; error: string | null} | null>(null)
  const [counterpartSnapshot, setCounterpartSnapshot] = React.useState<{key: string; rows: SwapExchangeCandidate[]; error: string | null} | null>(null)
  const candidateKey = [currentUser.id, sourceRegistration.operational_role, targetShiftId].join(':')
  const currentCandidate = mode === 'exchange' && targetShiftId && counterpartSnapshot?.key === candidateKey
    ? counterpartSnapshot : null
  const targetRegistrations = currentCandidate?.rows ?? []
  const targetCandidatesLoading = mode === 'exchange' && Boolean(targetShiftId) && !currentCandidate

  const [directorySnapshot, setDirectorySnapshot] = React.useState<{ownerId: string; users: UserDirectoryEntry[]; error: string | null} | null>(null)
  const [staffSearch, setStaffSearch] = React.useState('')
  const directory = open && directorySnapshot?.ownerId === currentUser.id && !directorySnapshot.error
    ? directorySnapshot.users : []
  const directoryError = open && directorySnapshot?.ownerId === currentUser.id ? directorySnapshot.error : null
  const directoryLoading = open && directorySnapshot?.ownerId !== currentUser.id
  React.useEffect(() => {
    if (!open) return
    let active = true
    void userService.getDirectory().then(users => {
      if (active) setDirectorySnapshot({ownerId: currentUser.id, users, error: null})
    }).catch(error => {
      if (active) setDirectorySnapshot({
        ownerId: currentUser.id, users: [], error: error instanceof Error ? error.message : 'STAFF_DIRECTORY_LOAD_FAILED',
      })
    })
    return () => { active = false }
  }, [open, currentUser.id])
  // The Shift Detail entry point passes shifts=[]; never enumerate all shifts.
  // Query an explicitly bounded, identity-scoped page instead.
  React.useEffect(() => {
    if (!open || mode !== 'exchange' || shifts.length > 0) return
    let active = true
    void shiftService.getPage({
      page: targetPage, pageSize,
      filters: {statuses: ['scheduled'], search: targetSearch.trim(), from: new Date().toISOString().slice(0, 10)},
    }).then(result => {
      if (!active) return
      setTargetSnapshot({key: targetKey, items: result.items, total: result.total, error: null})
    }).catch(error => {
      if (!active) return
      setTargetSnapshot({key: targetKey, items: [], total: 0, error: error instanceof Error ? error.message : 'TARGET_SHIFT_LOAD_FAILED'})
    })
    return () => { active = false }
  }, [open, mode, shifts.length, targetPage, targetSearch, targetKey])

  const currentTarget = shifts.length > 0 || targetSnapshot?.key === targetKey
  const targetLoading = open && mode === 'exchange' && shifts.length === 0 && !currentTarget
  const targetError = shifts.length === 0 && targetSnapshot?.key === targetKey ? targetSnapshot.error : null
  const sourceRows = shifts.length > 0 ? shifts : targetSnapshot?.key === targetKey ? targetSnapshot.items : EMPTY_SHIFT_ROWS
  const targetShifts = React.useMemo(
    () => sourceRows.filter(shift => shift.id !== sourceShift.id && shift.status === 'scheduled' && !shift.deleted_at && !shift.archived_at)
      .filter(shift => shifts.length === 0 || !targetSearch || [shift.id, shift.title ?? '', shift.date, shift.studio ?? ''].some(field => field.toLowerCase().includes(targetSearch.trim().toLowerCase())))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id))
      .slice(0, pageSize),
    [sourceRows, sourceShift.id, targetSearch, shifts.length],
  )
  const targetTotal = shifts.length > 0 ? targetShifts.length : targetSnapshot?.key === targetKey ? targetSnapshot.total : 0
  const maxPage = Math.max(1, Math.ceil(targetTotal / pageSize))
  const targetIsOnPage = targetShifts.some(shift => shift.id === targetShiftId)

  React.useEffect(() => {
    if (!open || mode !== 'exchange' || !targetShiftId || !targetIsOnPage) return
    let active = true
    void shiftRegistrationService.getExchangeCandidates(targetShiftId, sourceRegistration.operational_role).then(candidates => {
      if (active) setCounterpartSnapshot({key: candidateKey, rows: candidates.filter(candidate => candidate.user_id !== currentUser.id), error: null})
    }).catch(error => {
      if (active) setCounterpartSnapshot({key: candidateKey, rows: [], error: error instanceof Error ? error.message : 'COUNTERPART_LOAD_FAILED'})
    })
    return () => { active = false }
  }, [open, mode, targetShiftId, targetIsOnPage, candidateKey, currentUser.id, sourceRegistration.operational_role])

  const submit = async () => {
    if (submitLock.current) return
    if (!reason.trim()) { toast({ title: t('error'), description: 'Reason required', variant: 'destructive' }); return }
    submitLock.current = true
    setBusy(true)
    try {
      if (mode === 'replacement') {
        if (!replacementId || directoryError || directoryLoading || !directory.some(user =>
          user.id === replacementId && user.id !== currentUser.id && user.operational_roles?.includes(sourceRegistration.operational_role)
        )) throw new Error('Chưa xác minh nhân sự thay thế phù hợp')
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
        if (!targetShiftId || !counterpartId || !targetIsOnPage ||
            !currentCandidate || currentCandidate.error ||
            !currentCandidate.rows.some(candidate => candidate.registration_id === counterpartId)) {
          throw new Error('Chưa xác minh được ca và người đổi chéo. Vui lòng tải lại.')
        }
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
    } finally { submitLock.current = false; setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Đổi ca</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="text-sm text-muted-foreground">Source: {sourceShift.date} {sourceShift.start_time}-{sourceShift.end_time} · {sourceRegistration.operational_role}</div>
          <label className="text-xs font-medium">Mode
            <Select value={mode} onValueChange={v => { setMode(v as CreatableSwapMode); setCounterpartId(''); setTargetShiftId(''); setTargetPage(1) }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="replacement">Thế ca</SelectItem>
                <SelectItem value="exchange">Đổi chéo</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {mode === 'replacement' ? (
            <div className="space-y-2">
              <label className="text-xs font-medium">Tìm nhân sự thay thế
                <Input className="mt-1" aria-label="Tìm nhân sự thay thế"
                  value={staffSearch} onChange={event => { setStaffSearch(event.target.value); setReplacementId('') }}
                  placeholder="Tên nhân sự..." />
              </label>
              {directoryLoading && <p role="status" className="text-xs text-muted-foreground">Đang tải danh bạ nhân sự...</p>}
              {directoryError && <p role="alert" className="text-xs text-red-600">Không tải được nhân sự: {directoryError}</p>}
              <label className="text-xs font-medium">Nhân sự thay thế
              <Select value={replacementId} disabled={busy || directoryLoading || Boolean(directoryError)} onValueChange={setReplacementId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {directory.filter(u => u.id !== currentUser.id &&
                    u.operational_roles?.includes(sourceRegistration.operational_role) &&
                    (!staffSearch.trim() || u.full_name.toLowerCase().includes(staffSearch.trim().toLowerCase())))
                    .slice(0,50).map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              </label>
            </div>
          ) : (
            <>
              <label className="text-xs font-medium">Tìm ca muốn đổi chéo
                <Input className="mt-1" value={targetSearchDraft} onChange={event => setTargetSearchDraft(event.target.value)}
                  aria-label="Tìm ca đổi chéo" placeholder="Tên ca, ngày, studio..." />
              </label>
              <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={() => { setTargetSearch(targetSearchDraft.trim()); setTargetPage(1); setTargetShiftId(''); setCounterpartId('') }}>
                Tìm ca
              </Button>
              {targetLoading && <p role="status" className="text-xs text-muted-foreground">Đang tải trang ca...</p>}
              {targetError && <div role="alert" className="space-y-1 text-xs text-red-600">
                <p>Không thể tải danh sách ca: {targetError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setTargetRevision(n => n + 1)}>Thử lại</Button>
              </div>}
              <label className="text-xs font-medium">Ca muốn đổi chéo
                <Select value={targetIsOnPage ? targetShiftId : ''} disabled={busy || targetLoading || Boolean(targetError)}
                  onValueChange={value => { setTargetShiftId(value); setCounterpartId('') }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select target" /></SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {targetShifts.map(s=> <SelectItem key={s.id} value={s.id}>{s.date} {s.start_time} {s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              {shifts.length === 0 && <div className="flex items-center justify-between text-xs">
                <Button type="button" size="sm" variant="outline" disabled={targetPage <= 1 || targetLoading || busy}
                  onClick={() => { setTargetPage(p => Math.max(1,p-1)); setTargetShiftId(''); setCounterpartId('') }}>Trang trước</Button>
                <span>Trang {targetPage}/{maxPage} · {targetTotal} ca</span>
                <Button type="button" size="sm" variant="outline" disabled={targetPage >= maxPage || targetLoading || busy}
                  onClick={() => { setTargetPage(p => p+1); setTargetShiftId(''); setCounterpartId('') }}>Trang sau</Button>
              </div>}
              {targetIsOnPage && (
                <label className="text-xs font-medium">Người đổi chéo
                  {targetCandidatesLoading && <p role="status" className="text-xs text-muted-foreground">Đang kiểm tra đăng ký...</p>}
                  {currentCandidate?.error && <p role="alert" className="text-xs text-red-600">Không thể kiểm tra người đổi chéo: {currentCandidate.error}</p>}
                  <Select value={counterpartId} disabled={targetCandidatesLoading || Boolean(currentCandidate?.error)} onValueChange={setCounterpartId}>
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
          <Button onClick={submit} disabled={busy || (mode === 'replacement' && (directoryLoading || Boolean(directoryError) || !replacementId)) ||
            (mode === 'exchange' && (!targetIsOnPage || !currentCandidate || Boolean(currentCandidate.error) || !counterpartId))} className="w-full">{busy ? 'Submitting...' : 'Submit'}</Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
