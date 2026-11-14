'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { getAuthMode } from '@/lib/auth/authMode'
import { currentUserService, getShiftRoleCapacities, shiftRegistrationService } from '@/lib/services/dataService'
import { readStaffingCandidates, type StaffingCandidateRow } from '@/lib/services/supabaseStaffingCandidateService'
import { SHIFT_DATA_CHANGED_EVENT } from '@/lib/services/shiftChangeSubscription'
import { staffingCandidates } from '@/lib/utils/staffingCandidates'
import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { AtomicStaffingReplacementDialog } from './AtomicStaffingReplacementDialog'

type Decision =
  | { kind: 'assign'; role: OperationalRole; userId: string }
  | { kind: 'approve' | 'reject'; registrationId: string }
  | { kind: 'remove'; registrationId: string }

type CandidateViewRow = Omit<StaffingCandidateRow, 'availability'> & {
  availability: StaffingCandidateRow['availability'] | 'unchecked'
  availableForAssignment: boolean
}
interface Props {
  shift: Shift
  users: User[]
  /** Parent re-reads authoritative paged shift summary and exposes the updated shift version. */
  onUpdated: () => Promise<void>
}

const roles: OperationalRole[] = ['host', 'support', 'technical']
const candidatePageSize = 20
const availabilityLabels: Record<CandidateViewRow['availability'], string> = {
  available: 'Không có lịch xung đột tại thời điểm kiểm tra',
  conflict: 'Trùng ca khác',
  already_on_shift: 'Đã đăng ký/phân công trong ca',
  unchecked: 'Chưa kiểm tra lịch (chế độ mock)',
}

export function StaffingActionPanel({ shift, users, onUpdated }: Props) {
  const { currentUser } = useCurrentUser()
  const ownerKey = currentUser ? `${currentUser.id}:${currentUser.system_permission ?? currentUser.role}` : ''
  const scope = `${ownerKey}:${shift.id}`
  const canAssign = Boolean(currentUser && hasPermission(currentUser, 'shifts.assign_staff'))
  const canReview = Boolean(currentUser && hasPermission(currentUser, 'shifts.approve_registration'))
  const [snapshot, setSnapshot] = React.useState<{ scope: string; version: number | undefined; rows: ShiftRegistration[] } | null>(null)
  const [candidateSnapshot, setCandidateSnapshot] = React.useState<{ key: string; items: CandidateViewRow[]; total: number } | null>(null)
  const [readError, setReadError] = React.useState<{ scope: string; message: string } | null>(null)
  const [candidateError, setCandidateError] = React.useState<{ key: string; message: string } | null>(null)
  const [feedback, setFeedback] = React.useState<{ scope: string; kind: 'error' | 'success' | 'warning'; message: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  // A synchronous lock blocks a second confirm before React has re-rendered.
  const mutationLock = React.useRef(false)
  const [role, setRole] = React.useState<OperationalRole>('host')
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [reviewNotes, setReviewNotes] = React.useState('')
  const [candidatePage, setCandidatePage] = React.useState(1)
  const [userId, setUserId] = React.useState('')
  const [decision, setDecision] = React.useState<{ scope: string; value: Decision } | null>(null)
  const [readRevision, setReadRevision] = React.useState(0)

  // Replacement & Emergency Replacement states
  const [replaceTarget, setReplaceTarget] = React.useState<ShiftRegistration | null>(null)

  const versionReady = Number.isInteger(shift.version) && (shift.version ?? 0) > 0
  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  React.useEffect(() => {
    if (!ownerKey || (!canAssign && !canReview)) return
    let active = true
    void shiftRegistrationService.getForShift(shift.id).then(rows => {
      if (active) { setSnapshot({ scope, version: shift.version, rows }); setReadError(null) }
    }).catch(failure => {
      if (active) {
        // Fail closed: never keep an actionable registration snapshot after a failed re-read.
        setSnapshot(null)
        setCandidateSnapshot(null)
        setDecision(null)
        setReadError({ scope, message: failure instanceof Error ? failure.message : 'Không thể tải đăng ký của ca.' })
      }
    })
    return () => { active = false }
  }, [ownerKey, scope, shift.id, shift.version, readRevision, canAssign, canReview])

  const normalizedSearch = debouncedSearch
  const searchSettled = normalizedSearch === search.trim()
  const candidateKey = `${scope}:${shift.version ?? 'no-version'}:${role}:${normalizedSearch}:${candidatePage}`
  const hasCurrentSnapshot = snapshot?.scope === scope && snapshot.version === shift.version
  const rows = React.useMemo(() => hasCurrentSnapshot ? snapshot!.rows : [], [hasCurrentSnapshot, snapshot])

  // Mock eligibility is pure derived data. Never synchronously set React state in
  // an effect for this path; real availability comes from the server RPC.
  const mockCandidateSnapshot = React.useMemo(() => {
    if (getAuthMode() !== 'mock' || !ownerKey || !canAssign || !hasCurrentSnapshot) return null
    const candidates = staffingCandidates(shift, role, users, rows)
      .filter(user => (user.full_name + ' ' + user.email).toLocaleLowerCase('vi').includes(normalizedSearch.toLocaleLowerCase('vi')))
    const items = candidates.slice((candidatePage - 1) * candidatePageSize, candidatePage * candidatePageSize)
      .map(user => ({ user_id: user.id, full_name: user.full_name, availability: 'unchecked' as const,
        availableForAssignment: true }))
    return { key: candidateKey, items, total: candidates.length }
  }, [ownerKey, canAssign, hasCurrentSnapshot, shift, role, users, rows, normalizedSearch, candidatePage, candidateKey])

  React.useEffect(() => {
    if (!ownerKey || !canAssign || !hasCurrentSnapshot || getAuthMode() !== 'supabase') return
    let active = true
    void readStaffingCandidates({ shiftId: shift.id, role, search: normalizedSearch, page: candidatePage, pageSize: candidatePageSize })
        .then(result => {
          if (!active) return
          setCandidateSnapshot({ key: candidateKey, total: result.total,
            items: result.items.map(item => ({ ...item, availableForAssignment: item.availability === 'available' })) })
          // A record deletion may leave the prior page past the end of the result set.
          if (candidatePage > 1 && (candidatePage - 1) * candidatePageSize >= result.total) {
            setCandidatePage(Math.max(1, Math.ceil(result.total / candidatePageSize)))
            setUserId('')
          }
          setCandidateError(null)
        }).catch(failure => {
          if (active) {
            // A failed server availability query invalidates the last candidate list.
            setCandidateSnapshot(null)
            setUserId('')
            setDecision(null)
            setCandidateError({ key: candidateKey, message: failure instanceof Error ? failure.message : 'Không thể kiểm tra lịch ứng viên.' })
          }
        })
    return () => { active = false }
  }, [ownerKey, canAssign, hasCurrentSnapshot, shift, rows, role, users, normalizedSearch, candidatePage, candidateKey])

  if (!canAssign && !canReview) return null

  const capacities = getShiftRoleCapacities(shift, rows)
  const currentCapacity = capacities.find(item => item.role === role)
  const pending = rows.filter(reg => reg.status === 'pending')
  const assigned = rows.filter(reg => reg.status === 'approved' || reg.status === 'manually_assigned')
  const candidateData = getAuthMode() === 'mock' ? mockCandidateSnapshot : (candidateSnapshot?.key === candidateKey ? candidateSnapshot : null)
  const candidate = candidateData?.items.find(item => item.user_id === userId && item.availableForAssignment)

  // CRITICAL FIX: Voluntary registration cutoff (shift.registration_locked) MUST NOT block Admin/Leader manual assignment.
  const canStartAssignment = canAssign && searchSettled && hasCurrentSnapshot && candidateData && versionReady &&
    shift.status === 'scheduled' &&
    Boolean(currentCapacity && currentCapacity.remaining > 0) && Boolean(candidate)

  // Clear, human-readable disabled reason explanation
  const getDisabledReason = (): string | null => {
    if (!canAssign) return 'Tài khoản không có quyền phân công nhân sự.'
    if (shift.status !== 'scheduled') return `Ca đang ở trạng thái "${shift.status}", không thể phân công mới.`
    if (!versionReady) return 'Thiếu phiên bản ca hợp lệ (v0 hoặc không xác định).'
    if (currentCapacity && currentCapacity.remaining <= 0) return `Đã đủ định biên cho vai trò này (${currentCapacity.approved}/${currentCapacity.required}). Hãy gỡ hoặc thay người nếu cần.`
    if (!searchSettled || !candidateData) return 'Đang kiểm tra khả dụng của nhân sự…'
    if (userId && !candidate) {
      const rawItem = candidateData?.items.find(item => item.user_id === userId)
      if (rawItem) return `Nhân sự không thể phân công: ${availabilityLabels[rawItem.availability] || 'Không khả dụng'}.`
    }
    if (!userId) return 'Vui lòng chọn nhân sự để phân công.'
    return null
  }

  const activeDecision = decision?.scope === scope ? decision.value : null

  const perform = async (requestedDecision = activeDecision) => {
    if (!currentUser || !requestedDecision || busy || mutationLock.current || !hasCurrentSnapshot) return
    mutationLock.current = true
    setBusy(true)
    setFeedback(null)
    let writeCommitted = false
    try {
      // Avoid starting a write based on an identity that changed after the dialog opened.
      const beforeActor = await currentUserService.getCurrent()
      if (!beforeActor || `${beforeActor.id}:${beforeActor.system_permission ?? beforeActor.role}` !== ownerKey) {
        throw new Error('LIST_IDENTITY_CHANGED')
      }
      let mutation: ShiftRegistration
      if (requestedDecision.kind === 'assign') {
        const item = candidateData?.items.find(row => row.user_id === requestedDecision.userId)
        if (!canStartAssignment || !item || !item.availableForAssignment ||
          requestedDecision.role !== role || requestedDecision.userId !== userId) {
          throw new Error('Danh sách ứng viên hoặc phiên bản ca đã thay đổi. Hãy tải lại.')
        }
        if (!Number.isInteger(shift.version)) {
          throw new Error('VERSION_MISSING_OR_INVALID: Ca trực thiếu phiên bản hợp lệ. Hãy tải lại.')
        }
        mutation = await shiftRegistrationService.assignManually(
          shift.id, item.user_id, requestedDecision.role, currentUser.id, shift.version,
        )
      } else if (requestedDecision.kind === 'remove') {
        const registration = rows.find(row => row.id === requestedDecision.registrationId && (row.status === 'approved' || row.status === 'manually_assigned'))
        if (!canAssign || !registration || !Number.isInteger(registration.version)) {
          throw new Error('VERSION_MISSING_OR_INVALID: Phân công thiếu phiên bản hợp lệ. Hãy tải lại.')
        }
        mutation = await shiftRegistrationService.removeAssignment(
          registration.id, currentUser.id, reviewNotes.trim() || undefined, registration.version,
        )
      } else {
        const registration = rows.find(row => row.id === requestedDecision.registrationId && row.status === 'pending')
        if (!canReview || !registration || !Number.isInteger(registration.version)) {
          throw new Error('VERSION_MISSING_OR_INVALID: Đơn hoặc phiên bản không hợp lệ. Hãy tải lại.')
        }
        if (requestedDecision.kind === 'approve') {
          mutation = await shiftRegistrationService.approve(registration.id, currentUser.id, reviewNotes.trim() || undefined, registration.version)
        } else {
          mutation = await shiftRegistrationService.reject(registration.id, currentUser.id, reviewNotes.trim() || undefined, registration.version)
        }
      }
      writeCommitted = true
      const afterActor = await currentUserService.getCurrent()
      if (!afterActor || `${afterActor.id}:${afterActor.system_permission ?? afterActor.role}` !== ownerKey) {
        throw new Error('LIST_IDENTITY_CHANGED')
      }
      await onUpdated()
      const updatedRows = await shiftRegistrationService.getForShift(shift.id)
      if (!updatedRows.some(row => row.id === mutation.id && row.status === mutation.status &&
        (row.version ?? 0) >= (mutation.version ?? 0))) {
        throw new Error('PERSISTENCE_RECHECK_FAILED')
      }
      setSnapshot({ scope, version: shift.version, rows: updatedRows })
      setCandidateSnapshot(null)
      setDecision(null)
      setUserId('')
      setReviewNotes('')
      setReadRevision(value => value + 1)
      setFeedback({
        scope,
        kind: 'success',
        message: 'Đã ghi nhận thay đổi. Danh sách ca đang được đồng bộ.',
      })
    } catch (failure) {
      // After a failed mutation or verification, require an authoritative re-read.
      setSnapshot(null)
      setDecision(null)
      setUserId('')
      setFeedback({ scope, kind: writeCommitted ? 'warning' : 'error', message: writeCommitted
        ? `Đã ghi nhận trên server nhưng chưa thể xác minh đồng bộ: ${failure instanceof Error ? failure.message : 'Lỗi đọc lại'}. Tải lại trước khi thao tác tiếp.`
        : failure instanceof Error ? failure.message : 'Không thể cập nhật phân công.' })
      setReadRevision(value => value + 1)
      setCandidateSnapshot(null)
      // A changed business identity must never trigger a refresh in the old scope.
      if (!(failure instanceof Error && failure.message === 'LIST_IDENTITY_CHANGED')) {
        await onUpdated().catch(() => undefined)
      }
    } finally {
      if (writeCommitted) {
        window.dispatchEvent(new Event(SHIFT_DATA_CHANGED_EVENT))
        try {
          window.localStorage.setItem(`${SHIFT_DATA_CHANGED_EVENT}:storage`,
            `${Date.now()}:${performance.now()}`)
        } catch { /* Same-tab event and reconciliation remain active. */ }
      }
      mutationLock.current = false
      setBusy(false)
    }
  }

  return (
    <section data-testid="staffing-action-panel" className="space-y-3 border-t pt-4 text-sm" aria-label="Điều phối nhân sự cho ca">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Phân công và xét duyệt</h3>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setReadRevision(value => value + 1); setCandidateSnapshot(null) }}>Tải lại</Button>
      </div>
      {readError?.scope === scope && <p role="alert" className="text-red-700">{readError.message}</p>}
      {feedback?.scope === scope && <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={feedback.kind === 'error' ? 'text-red-700' : feedback.kind === 'warning' ? 'text-amber-800' : 'text-green-700'}>{feedback.message}</p>}
      {!hasCurrentSnapshot ? (readError?.scope === scope ? <p role="alert">Không thể tải danh sách đơn. Hãy thử Tải lại.</p> : <p role="status">Đang tải đơn đăng ký ca…</p>) : <>
        {canReview && <div className="space-y-2">
          <h4 className="font-medium">Đơn chờ duyệt ({pending.length})</h4>
          {pending.slice(0, 20).map(registration => (
            <div key={registration.id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs">
              <span className="min-w-0 flex-1">{users.find(user => user.id === registration.user_id)?.full_name || registration.user_id} · {registration.operational_role} · v{registration.version ?? '?'}</span>
              <Button type="button" size="sm" variant="outline" disabled={busy || !Number.isInteger(registration.version)} onClick={() => { setReviewNotes(''); setDecision({ scope, value: { kind: 'reject', registrationId: registration.id } }) }}>Từ chối</Button>
              <Button type="button" size="sm" disabled={busy || !Number.isInteger(registration.version)} onClick={() => { setReviewNotes(''); setDecision({ scope, value: { kind: 'approve', registrationId: registration.id } }) }}>Duyệt</Button>
            </div>
          ))}
          {pending.length > 20 && <p className="text-xs text-slate-600">Còn {pending.length - 20} đơn. Mở tab Xét duyệt để xem toàn bộ.</p>}
        </div>}
        {canAssign && assigned.length > 0 && <div className="space-y-2 border-t pt-3">
          <h4 className="font-medium">Nhân sự đã phân công ({assigned.length})</h4>
          {assigned.map(registration => (
            <div key={registration.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
              <span className="min-w-0 flex-1">
                <strong>{users.find(user => user.id === registration.user_id)?.full_name || registration.user_id}</strong> · {registration.operational_role === 'host' ? 'Host' : registration.operational_role === 'support' ? 'Trợ livestream' : 'Kỹ thuật'} · {registration.status === 'manually_assigned' ? 'Chỉ định' : 'Đã duyệt'}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] text-amber-700 border-amber-200 hover:bg-amber-50 hover:text-amber-800"
                  disabled={busy}
                  data-testid={`replace-staff-${registration.id}`}
                  onClick={() => {
                    setReplaceTarget(registration)
                    setDecision(null)
                  }}
                >
                  Thay người
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  disabled={busy || !Number.isInteger(registration.version)}
                  data-testid={`remove-staff-${registration.id}`}
                  onClick={() => {
                    setReviewNotes('')
                    setReplaceTarget(null)
                    setDecision({ scope, value: { kind: 'remove', registrationId: registration.id } })
                  }}
                >
                  Gỡ phân công
                </Button>
              </div>
            </div>
          ))}
        </div>}

      </>}

      {replaceTarget && currentUser && <AtomicStaffingReplacementDialog
          open
          shift={shift}
          registration={replaceTarget}
          registrations={rows}
          users={users}
          currentUser={currentUser}
          snapshotReady={hasCurrentSnapshot && assigned.some(registration => registration.id === replaceTarget.id)}
          onOpenChange={isOpen => { if (!isOpen) setReplaceTarget(null) }}
          onUpdated={async () => {
            await onUpdated()
            setReadRevision(value => value + 1)
            setCandidateSnapshot(null)
          }}
        />}
      {hasCurrentSnapshot && <>
        {canAssign && <div className="space-y-2 border-t pt-3">
          <h4 className="font-medium">Bổ sung nhân sự</h4>
          <label className="block text-xs">Vai trò
            <select aria-label="Vai trò cần bổ sung" className="mt-1 w-full rounded border bg-white p-2 text-sm" value={role} onChange={event => { setRole(event.target.value as OperationalRole); setCandidatePage(1); setUserId(''); setDecision(null) }}>
              {roles.map(value => <option key={value} value={value}>{value === 'host' ? 'Host' : value === 'support' ? 'Trợ livestream' : 'Kỹ thuật'}</option>)}
            </select>
          </label>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Định biên: {currentCapacity?.approved ?? 0}/{currentCapacity?.required ?? 0} · Chờ: {currentCapacity?.pending ?? 0} · Thiếu: {currentCapacity?.remaining ?? 0}</span>
            {shift.registration_locked && (
              <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium">
                Cổng tự đăng ký đã khóa (Chỉ điều phối thủ công)
              </span>
            )}
          </div>
          <Input aria-label="Tìm ứng viên" placeholder="Tìm theo tên nhân sự" value={search} onChange={event => { setSearch(event.target.value); setCandidatePage(1); setUserId(''); setDecision(null) }} />
          {candidateError?.key === candidateKey && <p role="alert" className="text-red-700">{candidateError.message}</p>}
          {!candidateData || !searchSettled ? (candidateError?.key === candidateKey && searchSettled ? <p role="alert" className="text-xs text-red-700">Không thể tìm ứng viên. Nhấn Tải lại để thử lại.</p> : <p role="status" className="text-xs text-slate-600">Đang kiểm tra khả dụng của nhân sự…</p>) : <>
            <label className="block text-xs">Danh sách nhân sự (trang {candidatePage})
              <select aria-label="Chọn nhân sự để phân công" className="mt-1 w-full rounded border bg-white p-2 text-sm" value={candidate?.user_id ?? ''} onChange={event => { setUserId(event.target.value); setDecision(null) }}>
                <option value="">Chọn nhân sự ({candidateData.total} kết quả)</option>
                {candidateData.items.map(item => <option key={item.user_id} value={item.user_id} disabled={!item.availableForAssignment}>
                  {item.full_name} · {availabilityLabels[item.availability]}
                </option>)}
              </select>
            </label>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span>{Math.min((candidatePage - 1) * candidatePageSize + 1, candidateData.total)}–{Math.min(candidatePage * candidatePageSize, candidateData.total)} / {candidateData.total}</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy || candidatePage === 1} onClick={() => { setCandidatePage(page => page - 1); setUserId(''); setDecision(null) }}>Trước</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || candidatePage * candidatePageSize >= candidateData.total} onClick={() => { setCandidatePage(page => page + 1); setUserId(''); setDecision(null) }}>Sau</Button>
              </div>
            </div>
          </>}
          <p className="text-xs text-amber-800">Tình trạng lịch chỉ đúng tại thời điểm truy vấn. RPC ghi sẽ kiểm tra lại quyền, xung đột, định biên và phiên bản ca trước khi lưu.</p>
          <div className="space-y-1">
            <Button
              type="button"
              size="sm"
              disabled={busy || !canStartAssignment}
              onClick={() => { if (candidate) setDecision({ scope, value: { kind: 'assign', role, userId: candidate.user_id } }) }}
            >
              Phân công
            </Button>
            {!canStartAssignment && getDisabledReason() && (
              <p className="text-xs text-amber-800" data-testid="staffing-disabled-reason">
                {getDisabledReason()}
              </p>
            )}
          </div>
          {!versionReady && <p role="alert" className="text-xs text-red-700">Thiếu phiên bản ca. Không thể phân công an toàn.</p>}
        </div>}
        {activeDecision && <div data-testid="staffing-confirmation" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium">
            {activeDecision.kind === 'assign'
              ? `Xác nhận phân công ${candidateData?.items.find(item => item.user_id === activeDecision.userId)?.full_name ?? activeDecision.userId} vào vai trò ${activeDecision.role}`
              : activeDecision.kind === 'remove'
              ? `Xác nhận gỡ phân công nhân sự ${(() => { const reg = rows.find(r => r.id === activeDecision.registrationId); return reg ? (users.find(u => u.id === reg.user_id)?.full_name || reg.user_id) : 'này' })()}`
              : activeDecision.kind === 'approve'
              ? 'Xác nhận duyệt đơn'
              : 'Xác nhận từ chối đơn'} cho ca {shift.title || shift.id}? Hành động sẽ được ghi audit.
          </p>
          {(activeDecision.kind === 'remove' || activeDecision.kind === 'approve' || activeDecision.kind === 'reject') && (
            <Input aria-label="Ghi chú xét duyệt" maxLength={500} placeholder={activeDecision.kind === 'remove' ? "Lý do gỡ phân công (tùy chọn)" : "Ghi chú xét duyệt (tùy chọn)"} value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setDecision(null)}>Hủy</Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void perform()}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</Button>
          </div>
        </div>}
      </>}
    </section>
  )
}
