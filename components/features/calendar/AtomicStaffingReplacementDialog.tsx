'use client'

import * as React from 'react'
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { currentUserService, shiftRegistrationService } from '@/lib/services/dataService'
import { getAuthMode } from '@/lib/auth/authMode'
import { hasPermission } from '@/lib/permissions'
import { SHIFT_DATA_CHANGED_EVENT } from '@/lib/services/shiftChangeSubscription'
import { formatRegistrationErrorMessage } from '@/lib/utils/shiftRegistration'

interface Props {
  open: boolean
  shift: Shift
  registration: ShiftRegistration
  registrations: ShiftRegistration[]
  users: User[]
  currentUser: User
  snapshotReady?: boolean
  initialEmergency?: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => Promise<void>
}

type RoleLabel = Record<OperationalRole, string>
const roleLabel: RoleLabel = { host: 'Host', support: 'Trợ livestream', technical: 'Kỹ thuật' }

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : 'Không thể hoàn tất thay thế.'
  const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const code = `${errorCode} ${message}`.toUpperCase()
  if (code.includes('ACTOR_NOT_AUTHORIZED') || code.includes('OPERATION_NOT_ALLOWED') || code.includes('STAFFING_PERMISSION_REQUIRED') || code.includes('LEADER_BRAND_SCOPE_REQUIRED') || code.includes('42501')) return 'Tài khoản hoặc phạm vi Brand hiện tại không được phép thay nhân sự.'
  if (code.includes('EMERGENCY_REPLACEMENT_ADMIN_ONLY')) return 'Chỉ Admin mới được thực hiện thay thế khẩn cấp.'
  if (code.includes('STAFFING_SEGMENT_CAPACITY_EXCEEDED') || code.includes('CAPACITY_EXCEEDED')) return 'Định biên của phân đoạn đã thay đổi. Hãy tải lại danh sách nhân sự.'
  if (code.includes('SHIFT_CONFLICT') || code.includes('REGISTRATION_CONFLICT') || code.includes('SCHEDULE_CONFLICT')) return 'Nhân sự thay thế bị trùng ca.'
  if (code.includes('REPLACEMENT_EFFECTIVE_TIME_INVALID') || code.includes('EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT')) return 'Thời điểm hiệu lực không hợp lệ với chế độ thay thế hoặc phân đoạn đã chọn.'
  if (code.includes('SEGMENT_MISMATCH') || code.includes('ASSIGNMENT_SEGMENT_MISMATCH') || code.includes('ROLE_MISMATCH') || code.includes('ASSIGNMENT_ROLE_MISMATCH') || code.includes('REPLACEMENT_TARGET_IS_CURRENT_STAFF')) return 'Ca, phân đoạn, vai trò hoặc nhân sự đã chọn không còn hợp lệ. Hãy tải lại.'
  if (code.includes('SHIFT_VERSION_CONFLICT') || code.includes('REGISTRATION_VERSION_CONFLICT')) return 'Phân công đã được thay đổi bởi người khác. Hãy tải lại và xác nhận lại.'
  if (code.includes('IDEMPOTENCY_KEY_REUSED')) return 'Yêu cầu bị trùng khóa nhưng nội dung khác. Đóng rồi mở lại biểu mẫu trước khi gửi lại.'
  if (code.includes('ASSIGNMENT_NOT_ACTIVE') || code.includes('ASSIGNMENT_NOT_FOUND') || code.includes('SHIFT_NOT_FOUND') || code.includes('SHIFT_NOT_REPLACEABLE') || code.includes('EMERGENCY_REPLACEMENT_REQUIRED')) return 'Ca hoặc phân công không còn ở trạng thái có thể thay. Hãy tải lại roster.'
  if (code.includes('PGRST202') || code.includes('42883') || code.includes('ATOMIC_REPLACEMENT_REQUIRES_PERSISTED_RUNTIME')) return 'Backend thay thế nguyên tử chưa sẵn sàng trong runtime đã xác thực này.'
  if (code.includes('40P01') || code.includes('55P03')) return 'Giao dịch bị hủy trước khi lưu. Có thể gửi lại cùng yêu cầu để thử lại an toàn.'
  if (code.includes('57014')) return 'Giao dịch bị hủy do timeout. Hãy tải lại roster trước khi thao tác tiếp.'
  if (code.includes('FAILED TO FETCH') || code.includes('TIMEOUT') || code.includes('NETWORK')) return 'Chưa xác định được kết quả do mất kết nối. Hãy gửi lại cùng yêu cầu để kiểm tra bằng khóa idempotent.'
  if (code.includes('P0001')) return `Máy chủ từ chối thay thế và giữ nguyên phân công cũ: ${formatRegistrationErrorMessage(message)}`
  return formatRegistrationErrorMessage(message)
}

export function AtomicStaffingReplacementDialog({
  open, shift, registration, registrations, users, currentUser, snapshotReady = true, initialEmergency = false, onOpenChange, onUpdated,
}: Props) {
  const persistedRuntime = getAuthMode() === 'supabase'
  const [replacementUserId, setReplacementUserId] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [emergency, setEmergency] = React.useState(initialEmergency)
  const [emergencyAt, setEmergencyAt] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [capability, setCapability] = React.useState<'checking' | 'ready' | 'unavailable'>(persistedRuntime ? 'checking' : 'unavailable')
  const [capabilityMessage, setCapabilityMessage] = React.useState('')
  const [completed, setCompleted] = React.useState(false)
  const [committedUnverified, setCommittedUnverified] = React.useState(false)
  const [feedback, setFeedback] = React.useState<{ kind: 'error' | 'warning' | 'success'; message: string } | null>(null)
  const submitLock = React.useRef(false)
  const pendingRequest = React.useRef<{ signature: string; input: Parameters<typeof shiftRegistrationService.replaceAssignment>[0] } | null>(null)

  React.useEffect(() => {
    if (!open || !persistedRuntime) return
    let active = true
    void shiftRegistrationService.verifyReplacementCapability(shift.id, registration.operational_role)
      .then(() => { if (active) setCapability('ready') })
      .catch(error => {
        if (!active) return
        setCapability('unavailable')
        setCapabilityMessage(errorText(error))
      })
    return () => { active = false }
  }, [open, persistedRuntime, shift.id, registration.operational_role, currentUser.id, currentUser.system_permission, currentUser.role])

  const isAdmin = currentUser.system_permission === 'admin' || currentUser.role === 'admin'
  const canReplace = hasPermission(currentUser, 'shifts.assign_staff') &&
    ['admin', 'leader'].includes(currentUser.system_permission ?? currentUser.role)
  const targetHasVersions = Number.isInteger(shift.version) && (shift.version ?? 0) > 0 &&
    Number.isInteger(registration.version) && (registration.version ?? 0) > 0
  const segmentId = registration.staffing_segment_id ?? ''
  const assignedIds = new Set(registrations.filter(row =>
    row.id !== registration.id && ['approved', 'manually_assigned'].includes(row.status),
  ).map(row => row.user_id))
  const candidates = users.filter(user => user.status === 'active' &&
    user.id !== registration.user_id && user.operational_roles?.includes(registration.operational_role) &&
    !assignedIds.has(user.id))
  const validEmergencyTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(emergencyAt)
  const canSubmit = !busy && !completed && !committedUnverified && persistedRuntime && capability === 'ready' && canReplace &&
    (!emergency || isAdmin) && snapshotReady && targetHasVersions && Boolean(segmentId) &&
    candidates.some(user => user.id === replacementUserId) && reason.trim().length > 0 &&
    reason.trim().length <= 1000 && (!emergency || validEmergencyTime)

  const submit = async () => {
    if (!canSubmit || !replacementUserId) return
    submitLock.current = true
    setBusy(true)
    setFeedback(null)
    let committed = false
    try {
      const actorBefore = await currentUserService.getCurrent()
      if (!actorBefore || actorBefore.id !== currentUser.id ||
        (actorBefore.system_permission ?? actorBefore.role) !== (currentUser.system_permission ?? currentUser.role)) {
        throw new Error('LIST_IDENTITY_CHANGED')
      }

      const effectiveAt = emergency ? `${emergencyAt}:00+07:00` : new Date().toISOString()
      const signature = JSON.stringify([
        shift.id, segmentId, registration.id, replacementUserId, registration.operational_role,
        shift.version, registration.version, emergency ? effectiveAt : 'standard-server-time', reason.trim(), emergency,
      ])
      if (pendingRequest.current?.signature !== signature) {
        pendingRequest.current = {
          signature,
          input: {
            shiftId: shift.id,
            staffingSegmentId: segmentId,
            registrationId: registration.id,
            replacementUserId,
            role: registration.operational_role,
            expectedShiftVersion: shift.version!,
            expectedRegistrationVersion: registration.version!,
            effectiveAt,
            reason: reason.trim(),
            emergency,
            idempotencyKey: crypto.randomUUID(),
          },
        }
      }

      const result = await shiftRegistrationService.replaceAssignment(pendingRequest.current.input)
      if (result.shift_id !== shift.id || result.old_registration_id !== registration.id ||
        result.staffing_segment_id !== segmentId || result.registration.user_id !== replacementUserId ||
        result.registration.operational_role !== registration.operational_role || result.registration.status !== 'manually_assigned') {
        throw new Error('REPLACEMENT_RECEIPT_MISMATCH')
      }
      committed = true
      setCommittedUnverified(true)

      const actorAfter = await currentUserService.getCurrent()
      if (!actorAfter || actorAfter.id !== currentUser.id ||
        (actorAfter.system_permission ?? actorAfter.role) !== (currentUser.system_permission ?? currentUser.role)) {
        throw new Error('LIST_IDENTITY_CHANGED')
      }

      let refreshFailure: unknown = null
      try { await onUpdated() } catch (error) { refreshFailure = error }
      const rows = await shiftRegistrationService.getForShift(shift.id)
      const saved = rows.find(row => row.id === result.registration.id && row.user_id === replacementUserId &&
        row.staffing_segment_id === segmentId && row.operational_role === registration.operational_role &&
        row.status === 'manually_assigned' && (row.version ?? 0) >= (result.registration.version ?? 0))
      const oldStillActive = rows.some(row => row.id === registration.id &&
        ['approved', 'manually_assigned'].includes(row.status))
      if (!saved || oldStillActive) throw new Error('PERSISTENCE_RECHECK_FAILED')

      pendingRequest.current = null
      setCompleted(true)
      setCommittedUnverified(false)
      setFeedback(refreshFailure
        ? { kind: 'warning', message: 'Đã nhận receipt và xác minh phân công đã lưu; màn hình cha chưa tải lại được. Hãy tải lại ca.' }
        : { kind: 'success', message: `Đã xác minh thay thế ${users.find(user => user.id === registration.user_id)?.full_name ?? registration.user_id} → ${users.find(user => user.id === replacementUserId)?.full_name ?? replacementUserId} trên máy chủ.` })
    } catch (error) {
      setFeedback({ kind: committed ? 'warning' : 'error', message: committed
        ? `Máy chủ đã ghi nhận nhưng chưa xác minh được roster; không gửi yêu cầu mới. ${errorText(error)}`
        : errorText(error) })
    } finally {
      if (committed) {
        window.dispatchEvent(new Event(SHIFT_DATA_CHANGED_EVENT))
        try { window.localStorage.setItem(`${SHIFT_DATA_CHANGED_EVENT}:storage`, `${Date.now()}:${performance.now()}`) } catch { /* Same-tab refresh remains active. */ }
      }
      submitLock.current = false
      setBusy(false)
    }
  }

  const originalName = users.find(user => user.id === registration.user_id)?.full_name ?? registration.user_id
  const replacementName = users.find(user => user.id === replacementUserId)?.full_name ?? replacementUserId

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            {emergency ? <ShieldAlert className="h-4 w-4 text-red-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            {emergency ? 'Thay người khẩn cấp (Admin)' : 'Thay thế nhân sự'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3 text-xs">
          {!persistedRuntime && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">Thao tác chỉ hoạt động trong runtime Supabase đã xác thực. Chế độ mock luôn bị khóa.</p>}
          {persistedRuntime && capability === 'checking' && <p role="status">Đang xác minh RPC C4, tài khoản và phạm vi ca trên máy chủ…</p>}
          {persistedRuntime && capability === 'unavailable' && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">{capabilityMessage || 'Chưa xác minh được backend C4 cho ca này. Thay người vẫn bị khóa.'}</p>}
          {!snapshotReady && !completed && !committedUnverified && <p role="status">Đang đồng bộ roster đã lưu. Thao tác thay người đang khóa.</p>}
          {!segmentId && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-red-800">Phân công này chưa có segment ID đã lưu. Không thể thay thế an toàn.</p>}
          {!targetHasVersions && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-red-800">Thiếu phiên bản ca hoặc phân công đã lưu. Hãy tải lại ca.</p>}
          <p className="text-muted-foreground">
            Ca <strong>{shift.title || shift.id}</strong> · Segment <code>{segmentId || '—'}</code> · {roleLabel[registration.operational_role]}
          </p>
          {isAdmin && <div className="flex gap-2">
            <Button type="button" size="sm" variant={emergency ? 'outline' : 'default'} disabled={busy} onClick={() => { setEmergency(false); setFeedback(null) }}>Thay thường</Button>
            <Button type="button" size="sm" variant={emergency ? 'destructive' : 'outline'} disabled={busy} onClick={() => { setEmergency(true); setFeedback(null) }}>Khẩn cấp (Admin)</Button>
          </div>}
          <label className="block font-medium">Nhân sự thay thế · {roleLabel[registration.operational_role]}
            <select aria-label="Chọn nhân sự thay thế" className="mt-1 w-full rounded border bg-background p-2" value={replacementUserId} onChange={event => setReplacementUserId(event.target.value)}>
              <option value="">Chọn nhân sự đủ năng lực…</option>
              {candidates.map(user => <option key={user.id} value={user.id}>{user.full_name} ({user.email || user.id})</option>)}
            </select>
          </label>
          {emergency ? <label className="block font-medium">Thời điểm hiệu lực (+07:00)
            <Input className="mt-1" type="datetime-local" required value={emergencyAt} onChange={event => setEmergencyAt(event.target.value)} />
          </label> : <p className="text-muted-foreground">Thời điểm hiệu lực: thời gian ghi nhận bởi PostgreSQL khi xác nhận.</p>}
          <label className="block font-medium">Lý do bắt buộc
            <Input className="mt-1" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
          </label>
          {replacementUserId && <div className="rounded border bg-muted/20 p-3" data-testid="atomic-replacement-before-after">
            <p className="mb-1 font-semibold">Xác nhận thay đổi · v{shift.version} / v{registration.version}</p>
            <div className="flex flex-wrap items-center gap-2"><span className="text-red-700 line-through">{originalName}</span><ArrowRight className="h-3.5 w-3.5" /><span className="font-semibold text-green-700">{replacementName}</span><span>· {roleLabel[registration.operational_role]}</span></div>
            <p className="mt-1 break-all text-muted-foreground">{shift.id} · {segmentId}</p>
          </div>}
          {committedUnverified && <p role="alert" className="text-amber-800">Máy chủ đã trả receipt nhưng chưa xác minh đủ dữ liệu. Nút gửi bị khóa để tránh tạo thao tác thứ hai.</p>}
          {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={feedback.kind === 'error' ? 'text-red-700' : feedback.kind === 'warning' ? 'text-amber-800' : 'text-green-700'}>{feedback.message}</p>}
          <p className="text-[11px] text-muted-foreground">Thao tác giữ nguyên lịch sử phân công, ảnh/chấm công và Payroll. Chỉ một RPC nguyên tử được gửi; kết quả chỉ thành công sau khi roster đã được đọc lại từ máy chủ.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Đóng</Button>
            <Button type="button" size="sm" variant={emergency ? 'destructive' : 'default'} disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? 'Đang xác nhận…' : 'Xác nhận thay thế'}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
