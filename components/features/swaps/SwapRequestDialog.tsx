'use client'
import * as React from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Calendar, Clock, Moon, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import type { Shift, ShiftRegistration, User, UserDirectoryEntry, SwapExchangeCandidate } from '@/lib/types/database.types'
import { userService, shiftRegistrationService, shiftService, swapRequestService, isStaffedRegistration } from '@/lib/services/dataService'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange, resolveShiftDateTime } from '@/lib/utils/shiftUtils'

const EMPTY_SHIFT_ROWS: Shift[] = []

type CreatableSwapMode = 'replacement' | 'exchange'
export type ConflictVerificationStatus = 'idle' | 'checking' | 'verified_clear' | 'conflict' | 'unverified'
export type ConflictSnapshot = {
  key: string
  status: 'verified_clear' | 'conflict' | 'unverified'
  reason: string | null
  error: string | null
}

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
  const isStaffed = isStaffedRegistration(sourceRegistration)
  const [mode, setMode] = React.useState<CreatableSwapMode>('replacement')
  const [targetShiftId, setTargetShiftId] = React.useState('')
  const [counterpartId, setCounterpartId] = React.useState('')
  const [replacementId, setReplacementId] = React.useState('')
  const [conflictSnapshot, setConflictSnapshot] = React.useState<ConflictSnapshot | null>(null)
  const replacementConflictKey = [currentUser.id, sourceShift.id, replacementId].join(':')
  const conflict = open && mode === 'replacement' && replacementId && conflictSnapshot?.key === replacementConflictKey
    ? conflictSnapshot : null
  const conflictReason = conflict?.status === 'conflict' ? conflict.reason : null
  const replacementCheckStatus: ConflictVerificationStatus = !open || mode !== 'replacement' || !replacementId
    ? 'idle'
    : !conflict
      ? 'checking'
      : conflict.status
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

  const [exchangeConflictSnapshot, setExchangeConflictSnapshot] = React.useState<ConflictSnapshot | null>(null)
  const exchangeConflictKey = [currentUser.id, sourceShift.id, targetShiftId, counterpartId].join(':')
  const exchangeConflict = open && mode === 'exchange' && targetShiftId && counterpartId && exchangeConflictSnapshot?.key === exchangeConflictKey
    ? exchangeConflictSnapshot : null
  const exchangeConflictReason = exchangeConflict?.status === 'conflict' ? exchangeConflict.reason : null
  const exchangeCheckStatus: ConflictVerificationStatus = !open || mode !== 'exchange' || !targetShiftId || !counterpartId
    ? 'idle'
    : !exchangeConflict
      ? 'checking'
      : exchangeConflict.status

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

  // Conflict check for replacement in Dialog
  React.useEffect(() => {
    if (!open || mode !== 'replacement' || !replacementId) return
    let active = true
    const sourceTime = resolveShiftDateTime(sourceShift.date, sourceShift.start_time, sourceShift.end_time, sourceShift.timezone)
    if (!sourceTime?.valid) return
    void shiftService.getPage({
      page: 1, pageSize: 50, filters: {
        assignedUserIds: [replacementId],
        from: format(addDays(parseISO(sourceShift.date), -1), 'yyyy-MM-dd'),
        to: format(addDays(parseISO(sourceTime.endDate), 1), 'yyyy-MM-dd'),
      },
    }).then(result => {
      if (!active) return
      const assignedHere = result.items.some(s => s.id === sourceShift.id)
      const overlap = result.items.some(s => {
        if (s.id === sourceShift.id) return false
        const other = resolveShiftDateTime(s.date, s.start_time, s.end_time, s.timezone)
        return other?.valid && other.startAt < sourceTime.endAt && other.endAt > sourceTime.startAt
      })
      if (assignedHere) {
        setConflictSnapshot({ key: replacementConflictKey, status: 'conflict', reason: 'Nhân sự đã được phân công vào ca này', error: null })
      } else if (overlap) {
        setConflictSnapshot({ key: replacementConflictKey, status: 'conflict', reason: 'Nhân sự có ca khác trùng giờ', error: null })
      } else if (result.total > result.items.length) {
        setConflictSnapshot({ key: replacementConflictKey, status: 'unverified', reason: null, error: 'Chưa kiểm tra hết toàn bộ lịch; hệ thống sẽ xác minh khi gửi' })
      } else {
        setConflictSnapshot({ key: replacementConflictKey, status: 'verified_clear', reason: null, error: null })
      }
    }).catch(() => {
      if (active) setConflictSnapshot({ key: replacementConflictKey, status: 'unverified', reason: null, error: 'Không thể kiểm tra trước lịch; hệ thống sẽ xác minh khi gửi' })
    })
    return () => { active = false }
  }, [open, mode, replacementId, sourceShift, replacementConflictKey])

  // Two-sided conflict checking for Exchange in Dialog
  React.useEffect(() => {
    if (!open || mode !== 'exchange' || !targetShiftId || !counterpartId) return
    const counterpartCandidate = currentCandidate?.rows.find(item => item.registration_id === counterpartId)
    const targetShift = targetShifts.find(s => s.id === targetShiftId)
    if (!counterpartCandidate || !targetShift) return

    let active = true
    const sourceTime = resolveShiftDateTime(sourceShift.date, sourceShift.start_time, sourceShift.end_time, sourceShift.timezone)
    const targetTime = resolveShiftDateTime(targetShift.date, targetShift.start_time, targetShift.end_time, targetShift.timezone)
    if (!sourceTime?.valid || !targetTime?.valid) return

    Promise.all([
      shiftService.getPage({
        page: 1, pageSize: 50, filters: {
          assignedUserIds: [currentUser.id],
          from: format(addDays(parseISO(targetShift.date), -1), 'yyyy-MM-dd'),
          to: format(addDays(parseISO(targetTime.endDate), 1), 'yyyy-MM-dd'),
        },
      }),
      shiftService.getPage({
        page: 1, pageSize: 50, filters: {
          assignedUserIds: [counterpartCandidate.user_id],
          from: format(addDays(parseISO(sourceShift.date), -1), 'yyyy-MM-dd'),
          to: format(addDays(parseISO(sourceTime.endDate), 1), 'yyyy-MM-dd'),
        },
      }),
    ]).then(([requesterShifts, counterpartShifts]) => {
      if (!active) return
      const requesterConflict = requesterShifts.items.some(shift => {
        if (shift.id === sourceShift.id || shift.id === targetShift.id) return false
        const other = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
        return other?.valid && other.startAt < targetTime.endAt && other.endAt > targetTime.startAt
      })
      const counterpartConflict = counterpartShifts.items.some(shift => {
        if (shift.id === targetShift.id || shift.id === sourceShift.id) return false
        const other = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
        return other?.valid && other.startAt < sourceTime.endAt && other.endAt > sourceTime.startAt
      })

      if (requesterConflict) {
        setExchangeConflictSnapshot({ key: exchangeConflictKey, status: 'conflict', reason: 'Bạn đã có ca khác trùng giờ với ca đổi chéo', error: null })
      } else if (counterpartConflict) {
        setExchangeConflictSnapshot({ key: exchangeConflictKey, status: 'conflict', reason: 'Đối ứng có ca khác trùng giờ với ca của bạn', error: null })
      } else if (requesterShifts.total > requesterShifts.items.length || counterpartShifts.total > counterpartShifts.items.length) {
        setExchangeConflictSnapshot({ key: exchangeConflictKey, status: 'unverified', reason: null, error: 'Chưa kiểm tra hết toàn bộ lịch; hệ thống sẽ xác minh khi gửi' })
      } else {
        setExchangeConflictSnapshot({ key: exchangeConflictKey, status: 'verified_clear', reason: null, error: null })
      }
    }).catch(() => {
      if (active) setExchangeConflictSnapshot({ key: exchangeConflictKey, status: 'unverified', reason: null, error: 'Không thể kiểm tra trước lịch; hệ thống sẽ xác minh khi gửi' })
    })

    return () => { active = false }
  }, [open, mode, targetShiftId, counterpartId, currentCandidate, targetShifts, sourceShift, currentUser.id, exchangeConflictKey])

  const submit = async () => {
    if (submitLock.current) return
    if (!isStaffed) {
      toast({ title: t('error'), description: 'Ca trực chưa có lượt đăng ký được duyệt (approved/manually_assigned)', variant: 'destructive' })
      return
    }
    if (!reason.trim()) { toast({ title: t('error'), description: 'Cần nhập lý do đổi ca', variant: 'destructive' }); return }
    submitLock.current = true
    setBusy(true)
    try {
      if (mode === 'replacement') {
        if (!replacementId || directoryError || directoryLoading || !directory.some(user =>
          user.id === replacementId && user.id !== currentUser.id && user.operational_roles?.includes(sourceRegistration.operational_role)
        )) throw new Error('Chưa xác minh nhân sự thay thế phù hợp')
        if (replacementCheckStatus === 'checking') throw new Error('Đang kiểm tra lịch nhân sự thay thế')
        if (replacementCheckStatus === 'conflict') throw new Error(conflictReason ?? 'Nhân sự bị trùng lịch')
        if (replacementCheckStatus !== 'verified_clear') throw new Error(conflict?.error ?? 'Chưa xác minh được lịch trống của nhân sự thay thế')
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
        if (exchangeCheckStatus === 'checking') throw new Error('Đang kiểm tra lịch đổi ca hai bên')
        if (exchangeCheckStatus === 'conflict') throw new Error(exchangeConflictReason ?? 'Xung đột lịch ca đổi chéo')
        if (exchangeCheckStatus !== 'verified_clear') throw new Error(exchangeConflict?.error ?? 'Chưa xác minh được lịch không trùng ca của hai bên')
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
      toast({ title: t('success'), description: 'Đã gửi yêu cầu đổi ca', variant: 'success' })
      onSuccess()
      onOpenChange(false)
      setReason(''); setTargetShiftId(''); setCounterpartId(''); setReplacementId('')
    } catch (e) {
      toast({ title: t('error'), description: e instanceof Error ? e.message : 'Thao tác không thành công', variant: 'destructive' })
    } finally { submitLock.current = false; setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Tạo yêu cầu PASS / Đổi ca</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          {/* Source Shift Info Card */}
          <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-xs text-foreground">{sourceShift.title || 'Ca trực'}</span>
              <div className="flex items-center gap-1.5">
                <Badge variant="default" className="text-[10px] capitalize py-0 px-2 h-4">
                  {t(sourceRegistration.operational_role)}
                </Badge>
                {sourceShift.crosses_midnight && (
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 py-0 px-1 h-4">
                    <Moon className="h-2.5 w-2.5 mr-0.5 inline" />
                    Qua đêm
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {sourceShift.date}</span>
              <span className="inline-flex items-center gap-1 font-mono"><Clock className="h-3 w-3" /> {formatShiftTimeRange(sourceShift)}</span>
              {sourceShift.studio && <span>· Studio {sourceShift.studio}</span>}
              <span>({sourceShift.timezone || 'ICT / GMT+7'})</span>
            </div>
          </div>

          {!isStaffed && (
            <div role="alert" className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Ca trực chưa có lượt đăng ký được duyệt</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Chỉ ca trực có trạng thái được duyệt (Approved) hoặc phân công chính thức (Manually Assigned) mới đủ điều kiện tạo yêu cầu PASS/Đổi ca.
                Với ca trực chỉ gán Host/Support trực tiếp qua trường dữ liệu cũ, Quản lý hoặc Leader cần vào mục Phân ca (Staffing) để duyệt đăng ký hợp lệ trước khi thực hiện.
              </p>
            </div>
          )}

          <label className="text-xs font-medium block">Hình thức đổi ca
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
              <label className="text-xs font-medium block">Tìm nhân sự thay thế
                <Input className="mt-1 text-xs" aria-label="Tìm nhân sự thay thế"
                  value={staffSearch} onChange={event => { setStaffSearch(event.target.value); setReplacementId('') }}
                  placeholder="Nhập tên nhân sự..." />
              </label>
              {directoryLoading && <p role="status" className="text-xs text-muted-foreground">Đang tải danh bạ nhân sự...</p>}
              {directoryError && <p role="alert" className="text-xs text-red-600">Không tải được nhân sự: {directoryError}</p>}
              <label className="text-xs font-medium block">Nhân sự thay thế (đúng năng lực {t(sourceRegistration.operational_role)})
              <Select value={replacementId} disabled={busy || directoryLoading || Boolean(directoryError)} onValueChange={setReplacementId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn nhân sự thay thế" /></SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {directory.filter(u => u.id !== currentUser.id &&
                    u.operational_roles?.includes(sourceRegistration.operational_role) &&
                    (!staffSearch.trim() || u.full_name.toLowerCase().includes(staffSearch.trim().toLowerCase())))
                    .slice(0,50).map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              </label>
              {replacementId && replacementCheckStatus === 'checking' && (
                <p role="status" className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Đang kiểm tra lịch nhân sự...
                </p>
              )}
              {replacementCheckStatus === 'conflict' && conflict?.reason && (
                <div role="alert" className="p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{conflict.reason}</span>
                </div>
              )}
              {replacementCheckStatus === 'unverified' && (
                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>{conflict?.error || 'Chưa kiểm tra hết toàn bộ lịch; hệ thống sẽ xác minh khi gửi'}</span>
                </div>
              )}
              {replacementCheckStatus === 'verified_clear' && (
                <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Lịch trống - sẵn sàng nhận ca</span>
                </div>
              )}
              {replacementId && replacementCheckStatus !== 'conflict' && (
                <p className="text-xs text-muted-foreground">
                  Điều kiện cuối cùng được kiểm tra lại khi gửi và khi duyệt.
                </p>
              )}
            </div>
          ) : (
            <>
              <label className="text-xs font-medium block">Tìm ca muốn đổi chéo
                <Input className="mt-1 text-xs" value={targetSearchDraft} onChange={event => setTargetSearchDraft(event.target.value)}
                  aria-label="Tìm ca đổi chéo" placeholder="Tên ca, ngày, studio..." />
              </label>
              <Button type="button" size="sm" variant="outline" disabled={busy} className="text-xs"
                onClick={() => { setTargetSearch(targetSearchDraft.trim()); setTargetPage(1); setTargetShiftId(''); setCounterpartId('') }}>
                Tìm ca
              </Button>
              {targetLoading && <p role="status" className="text-xs text-muted-foreground">Đang tải trang ca...</p>}
              {targetError && <div role="alert" className="space-y-1 text-xs text-red-600">
                <p>Không thể tải danh sách ca: {targetError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setTargetRevision(n => n + 1)}>Thử lại</Button>
              </div>}
              <label className="text-xs font-medium block">Ca muốn đổi chéo
                <Select value={targetIsOnPage ? targetShiftId : ''} disabled={busy || targetLoading || Boolean(targetError)}
                  onValueChange={value => { setTargetShiftId(value); setCounterpartId('') }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn ca đổi chéo" /></SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {targetShifts.map(s=> (
                      <SelectItem key={s.id} value={s.id}>
                        {s.date} {s.start_time}-{s.end_time} · {s.title || 'Ca trực'} {s.crosses_midnight ? '(Qua đêm)' : ''}
                      </SelectItem>
                    ))}
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
                <label className="text-xs font-medium block">Người đổi chéo (cùng vai trò {t(sourceRegistration.operational_role)})
                  {targetCandidatesLoading && <p role="status" className="text-xs text-muted-foreground">Đang kiểm tra đăng ký...</p>}
                  {currentCandidate?.error && <p role="alert" className="text-xs text-red-600">Không thể kiểm tra người đổi chéo: {currentCandidate.error}</p>}
                  <Select value={counterpartId} disabled={targetCandidatesLoading || Boolean(currentCandidate?.error)} onValueChange={setCounterpartId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn người đổi chéo" /></SelectTrigger>
                    <SelectContent className="max-h-64 overflow-y-auto">
                      {targetRegistrations.map(candidate => <SelectItem key={candidate.registration_id} value={candidate.registration_id}>{candidate.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
              {counterpartId && exchangeCheckStatus === 'checking' && (
                <p role="status" className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Đang kiểm tra trùng lịch hai phía...
                </p>
              )}
              {exchangeCheckStatus === 'conflict' && exchangeConflict?.reason && (
                <div role="alert" className="p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{exchangeConflict.reason}</span>
                </div>
              )}
              {exchangeCheckStatus === 'unverified' && (
                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>{exchangeConflict?.error || 'Chưa kiểm tra hết toàn bộ lịch; hệ thống sẽ xác minh khi gửi'}</span>
                </div>
              )}
              {exchangeCheckStatus === 'verified_clear' && (
                <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Lịch hai bên hợp lệ - đã xác minh không trùng giờ</span>
                </div>
              )}
              {counterpartId && exchangeCheckStatus !== 'conflict' && (
                <p className="text-xs text-muted-foreground">
                  Điều kiện cuối cùng được kiểm tra lại khi gửi và khi duyệt.
                </p>
              )}
            </>
          )}
          <label className="text-xs font-medium block">Lý do đổi ca <span className="text-destructive">*</span>
            <Textarea className="mt-1 text-xs" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nhập lý do chi tiết (tối thiểu 10 ký tự)..." />
          </label>
          <Button
            onClick={submit}
            disabled={
              busy ||
              !isStaffed ||
              reason.trim().length < 10 ||
              (mode === 'replacement' && (
                directoryLoading ||
                Boolean(directoryError) ||
                !replacementId ||
                replacementCheckStatus !== 'verified_clear'
              )) ||
              (mode === 'exchange' && (
                !targetIsOnPage ||
                !currentCandidate ||
                Boolean(currentCandidate.error) ||
                !counterpartId ||
                exchangeCheckStatus !== 'verified_clear'
              ))
            }
            className="w-full"
          >
            {busy ? 'Đang gửi...' : 'Gửi yêu cầu'}
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
