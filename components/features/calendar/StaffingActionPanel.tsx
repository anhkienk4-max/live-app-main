'use client'

import * as React from 'react'
import { AlertTriangle, ArrowRight, ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { getAuthMode } from '@/lib/auth/authMode'
import { currentUserService, getShiftRoleCapacities, shiftRegistrationService, shiftService } from '@/lib/services/dataService'
import { readStaffingCandidates, type StaffingCandidateRow } from '@/lib/services/supabaseStaffingCandidateService'
import { SHIFT_DATA_CHANGED_EVENT } from '@/lib/services/shiftChangeSubscription'
import { staffingCandidates } from '@/lib/utils/staffingCandidates'
import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'

type Decision =
  | { kind: 'assign'; role: OperationalRole; userId: string }
  | { kind: 'approve' | 'reject'; registrationId: string }
  | { kind: 'remove'; registrationId: string }
  | { kind: 'replace'; registrationId: string; targetUserId: string; replacementUserId: string; role: OperationalRole; reason: string; segment?: string }
  | { kind: 'emergency_replace'; registrationId: string; targetUserId: string; replacementUserId: string; role: OperationalRole; effectiveTime: string; segment?: string; reason: string }

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
  const isAdmin = currentUser?.system_permission === 'admin'
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
  const [replaceTarget, setReplaceTarget] = React.useState<{ registration: ShiftRegistration; isEmergency: boolean } | null>(null)
  const [replaceUserId, setReplaceUserId] = React.useState('')
  const [replaceReason, setReplaceReason] = React.useState('')
  const [emergencyEffectiveTime, setEmergencyEffectiveTime] = React.useState('')
  const [emergencySegment, setEmergencySegment] = React.useState('')

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

  const perform = async () => {
    if (!currentUser || !activeDecision || busy || mutationLock.current || !hasCurrentSnapshot) return
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
      if (activeDecision.kind === 'assign') {
        const item = candidateData?.items.find(row => row.user_id === activeDecision.userId)
        if (!canStartAssignment || !item || !item.availableForAssignment ||
          activeDecision.role !== role || activeDecision.userId !== userId) {
          throw new Error('Danh sách ứng viên hoặc phiên bản ca đã thay đổi. Hãy tải lại.')
        }
        mutation = await shiftRegistrationService.assignManually(
          shift.id, item.user_id, activeDecision.role, currentUser.id, shift.version,
        )
      } else if (activeDecision.kind === 'replace' || activeDecision.kind === 'emergency_replace') {
        const registration = rows.find(row => row.id === activeDecision.registrationId && (row.status === 'approved' || row.status === 'manually_assigned'))
        if (!canAssign || !registration || (registration.version !== undefined && !Number.isInteger(registration.version))) {
          throw new Error('Phân công hoặc phiên bản không hợp lệ. Hãy tải lại.')
        }
        if (!activeDecision.reason.trim()) {
          throw new Error('Lý do thay người là bắt buộc.')
        }
        const isEmergency = activeDecision.kind === 'emergency_replace'
        const reasonText = isEmergency
          ? `[Thay người khẩn cấp] ${activeDecision.effectiveTime ? `Hiệu lực: ${activeDecision.effectiveTime} · ` : ''}${activeDecision.segment ? `Phiên: ${activeDecision.segment} · ` : ''}${activeDecision.reason.trim()}`
          : `[Thay người] ${activeDecision.segment ? `Phiên: ${activeDecision.segment} · ` : ''}${activeDecision.reason.trim()}`

        // Step 1: Remove old assignment atomically
        await shiftRegistrationService.removeAssignment(
          registration.id,
          currentUser.id,
          reasonText,
          registration.version ?? 1,
        )

        // Step 2: Fetch latest shift state or increment version to prevent concurrency abort
        const freshShift = await shiftService.getById(shift.id).catch(() => null)
        const targetShiftVersion = freshShift?.version ?? (shift.version ? shift.version + 1 : undefined)

        // Step 3: Assign replacement staff member
        mutation = await shiftRegistrationService.assignManually(
          shift.id,
          activeDecision.replacementUserId,
          activeDecision.role,
          currentUser.id,
          targetShiftVersion,
        )
      } else if (activeDecision.kind === 'remove') {
        const registration = rows.find(row => row.id === activeDecision.registrationId && (row.status === 'approved' || row.status === 'manually_assigned'))
        if (!canAssign || !registration || (registration.version !== undefined && !Number.isInteger(registration.version))) {
          throw new Error('Phân công hoặc phiên bản không hợp lệ. Hãy tải lại.')
        }
        mutation = await shiftRegistrationService.removeAssignment(
          registration.id, currentUser.id, reviewNotes.trim() || undefined, registration.version ?? 1,
        )
      } else {
        const registration = rows.find(row => row.id === activeDecision.registrationId && row.status === 'pending')
        if (!canReview || !registration || (registration.version !== undefined && !Number.isInteger(registration.version))) {
          throw new Error('Đơn hoặc phiên bản không hợp lệ. Hãy tải lại.')
        }
        if (activeDecision.kind === 'approve') {
          mutation = await shiftRegistrationService.approve(registration.id, currentUser.id, reviewNotes.trim() || undefined, registration.version ?? 1)
        } else {
          mutation = await shiftRegistrationService.reject(registration.id, currentUser.id, reviewNotes.trim() || undefined, registration.version ?? 1)
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
      setReplaceTarget(null)
      setReplaceUserId('')
      setReplaceReason('')
      setEmergencySegment('')
      setEmergencyEffectiveTime('')
      setUserId('')
      setReviewNotes('')
      setReadRevision(value => value + 1)
      setFeedback({
        scope,
        kind: 'success',
        message: activeDecision.kind === 'emergency_replace'
          ? 'Đã thực hiện thay người khẩn cấp. Lịch sử phân công và dữ liệu chấm công đã được cập nhật.'
          : activeDecision.kind === 'replace'
          ? 'Đã thay thế nhân sự thành công. Danh sách ca đang được đồng bộ.'
          : 'Đã ghi nhận thay đổi. Danh sách ca đang được đồng bộ.',
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
              <Button type="button" size="sm" variant="outline" disabled={busy || (registration.version !== undefined && !Number.isInteger(registration.version))} onClick={() => { setReviewNotes(''); setDecision({ scope, value: { kind: 'reject', registrationId: registration.id } }) }}>Từ chối</Button>
              <Button type="button" size="sm" disabled={busy || (registration.version !== undefined && !Number.isInteger(registration.version))} onClick={() => { setReviewNotes(''); setDecision({ scope, value: { kind: 'approve', registrationId: registration.id } }) }}>Duyệt</Button>
            </div>
          ))}
          {pending.length > 20 && <p className="text-xs text-slate-600">Còn {pending.length - 20} đơn. Mở tab Xét duyệt để xem toàn bộ.</p>}
        </div>}
        {canAssign && assigned.length > 0 && <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Nhân sự đã phân công ({assigned.length})</h4>
            {isAdmin && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-red-200 bg-red-50/50 text-[11px] text-red-700 hover:bg-red-100 hover:text-red-800"
                data-testid="admin-emergency-replace-btn"
                disabled={busy}
                onClick={() => {
                  setReplaceTarget({ registration: assigned[0], isEmergency: true })
                  setReplaceUserId('')
                  setReplaceReason('')
                  setEmergencySegment('')
                  setEmergencyEffectiveTime(new Date().toTimeString().slice(0, 5))
                  setDecision(null)
                }}
              >
                <AlertTriangle className="mr-1 h-3 w-3 text-red-600" />
                Thay người khẩn cấp (Admin)
              </Button>
            )}
          </div>
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
                  disabled={busy || (registration.version !== undefined && !Number.isInteger(registration.version))}
                  data-testid={`replace-staff-${registration.id}`}
                  onClick={() => {
                    setReplaceTarget({ registration, isEmergency: false })
                    setReplaceUserId('')
                    setReplaceReason('')
                    setEmergencySegment('')
                    setEmergencyEffectiveTime('')
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
                  disabled={busy || (registration.version !== undefined && !Number.isInteger(registration.version))}
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

        {/* Replacement Dialog / Form when replaceTarget is active */}
        {replaceTarget && (
          <div data-testid="staffing-replace-panel" className={`space-y-3 rounded-lg border p-3 ${replaceTarget.isEmergency ? 'border-red-300 bg-red-50/60' : 'border-amber-300 bg-amber-50/60'}`}>
            <div className="flex items-center justify-between">
              <h4 className={`font-semibold text-xs flex items-center gap-1.5 ${replaceTarget.isEmergency ? 'text-red-800' : 'text-amber-900'}`}>
                {replaceTarget.isEmergency ? <ShieldAlert className="h-4 w-4 text-red-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                {replaceTarget.isEmergency ? 'Quy trình Thay người khẩn cấp (Admin)' : 'Thay thế nhân sự đã phân công'}
              </h4>
              <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setReplaceTarget(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Target selector if emergency and multiple assigned */}
            {replaceTarget.isEmergency && assigned.length > 1 && (
              <label className="block text-xs font-medium text-slate-700">
                Nhân sự cần thay thế
                <select
                  aria-label="Chọn nhân sự cần thay thế"
                  className="mt-1 w-full rounded border bg-white p-1.5 text-xs"
                  value={replaceTarget.registration.id}
                  onChange={e => {
                    const found = assigned.find(r => r.id === e.target.value)
                    if (found) {
                      setReplaceTarget({ registration: found, isEmergency: true })
                      setReplaceUserId('')
                    }
                  }}
                >
                  {assigned.map(r => (
                    <option key={r.id} value={r.id}>
                      {users.find(u => u.id === r.user_id)?.full_name || r.user_id} · {r.operational_role}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Replacement candidate selector */}
            <label className="block text-xs font-medium text-slate-700">
              Nhân sự thay thế ({replaceTarget.registration.operational_role === 'host' ? 'Host' : replaceTarget.registration.operational_role === 'support' ? 'Trợ livestream' : 'Kỹ thuật'})
              <select
                aria-label="Chọn nhân sự thay thế"
                className="mt-1 w-full rounded border bg-white p-1.5 text-xs"
                value={replaceUserId}
                onChange={e => setReplaceUserId(e.target.value)}
              >
                <option value="">Chọn nhân sự thay thế…</option>
                {users
                  .filter(u => u.status === 'active' && u.operational_roles?.includes(replaceTarget.registration.operational_role) && !assigned.some(a => a.user_id === u.id))
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email || u.id})
                    </option>
                  ))}
              </select>
            </label>

            {/* Emergency extra fields: Effective Time & Segment */}
            {replaceTarget.isEmergency && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="block font-medium text-slate-700">
                  Thời điểm áp dụng
                  <Input
                    type="time"
                    className="mt-1 h-8 text-xs bg-white"
                    value={emergencyEffectiveTime}
                    onChange={e => setEmergencyEffectiveTime(e.target.value)}
                  />
                </label>
                <label className="block font-medium text-slate-700">
                  Phiên ca (Segment)
                  <Input
                    placeholder="VD: K01 hoặc Toàn bộ ca"
                    className="mt-1 h-8 text-xs bg-white"
                    value={emergencySegment}
                    onChange={e => setEmergencySegment(e.target.value)}
                  />
                </label>
              </div>
            )}

            {/* Mandatory Reason */}
            <label className="block text-xs font-medium text-slate-700">
              Lý do thay người (bắt buộc)
              <Input
                placeholder={replaceTarget.isEmergency ? 'VD: MC vắng mặt đột xuất, chuyển giao vai trò' : 'Lý do thay thế nhân sự…'}
                className="mt-1 h-8 text-xs bg-white"
                value={replaceReason}
                onChange={e => setReplaceReason(e.target.value)}
                maxLength={500}
              />
            </label>

            {/* Before / After Diff */}
            {replaceUserId && (
              <div className="rounded border border-slate-200 bg-white p-2 text-xs">
                <span className="font-semibold text-slate-600 block mb-1">Đối chiếu thay đổi (Before / After):</span>
                <div className="flex items-center gap-2">
                  <span className="text-red-700 line-through">
                    {users.find(u => u.id === replaceTarget.registration.user_id)?.full_name || replaceTarget.registration.user_id}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-green-700 font-semibold">
                    {users.find(u => u.id === replaceUserId)?.full_name || replaceUserId}
                  </span>
                  <span className="text-slate-500">
                    ({replaceTarget.registration.operational_role === 'host' ? 'Host' : replaceTarget.registration.operational_role === 'support' ? 'Trợ livestream' : 'Kỹ thuật'})
                  </span>
                </div>
              </div>
            )}

            {replaceTarget.isEmergency && (
              <p className="text-[11px] text-red-700">
                Lưu ý: Thay người khẩn cấp sẽ ghi nhận vào audit log và liên kết đồng bộ với chấm công thực tế.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setReplaceTarget(null)}>
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || !replaceUserId || !replaceReason.trim()}
                className={replaceTarget.isEmergency ? 'bg-red-700 hover:bg-red-800 text-white' : ''}
                onClick={() => {
                  setDecision({
                    scope,
                    value: replaceTarget.isEmergency
                      ? {
                          kind: 'emergency_replace',
                          registrationId: replaceTarget.registration.id,
                          targetUserId: replaceTarget.registration.user_id,
                          replacementUserId: replaceUserId,
                          role: replaceTarget.registration.operational_role,
                          effectiveTime: emergencyEffectiveTime,
                          segment: emergencySegment,
                          reason: replaceReason.trim(),
                        }
                      : {
                          kind: 'replace',
                          registrationId: replaceTarget.registration.id,
                          targetUserId: replaceTarget.registration.user_id,
                          replacementUserId: replaceUserId,
                          role: replaceTarget.registration.operational_role,
                          segment: emergencySegment,
                          reason: replaceReason.trim(),
                        },
                  })
                }}
              >
                Xác nhận thay người
              </Button>
            </div>
          </div>
        )}

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
              : activeDecision.kind === 'replace'
              ? `Xác nhận thay thế ${users.find(u => u.id === activeDecision.targetUserId)?.full_name || activeDecision.targetUserId} bằng ${users.find(u => u.id === activeDecision.replacementUserId)?.full_name || activeDecision.replacementUserId} (Vai trò: ${activeDecision.role})`
              : activeDecision.kind === 'emergency_replace'
              ? `Xác nhận THAY NGƯỜI KHẨN CẤP: ${users.find(u => u.id === activeDecision.targetUserId)?.full_name || activeDecision.targetUserId} -> ${users.find(u => u.id === activeDecision.replacementUserId)?.full_name || activeDecision.replacementUserId} (Hiệu lực: ${activeDecision.effectiveTime || 'Ngay lập tức'})`
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
