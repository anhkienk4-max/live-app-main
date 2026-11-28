'use client'

import * as React from 'react'
import type {
  Shift,
  ShiftOperationalNote,
  ShiftOperationalNoteCategory,
  ShiftRegistration,
  User,
} from '@/lib/types/database.types'
import { shiftNoteService } from '@/lib/services/shiftNoteService'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { format } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'
import { useTranslation } from '@/lib/i18n'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileEdit,
  FileText,
  MessageSquarePlus,
  RefreshCw,
  Save,
  Send,
  ShoppingBag,
  Users,
  XCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ShiftOperationalNotesSectionProps {
  shift: Shift
  currentUser: User | null
  registrations: ShiftRegistration[]
}

interface CategoryTemplate {
  category: ShiftOperationalNoteCategory
  labelVi: string
  labelEn: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  defaultTextVi: string
  defaultTextEn: string
}

const CATEGORY_TEMPLATES: CategoryTemplate[] = [
  {
    category: 'normal',
    labelVi: 'Bình thường',
    labelEn: 'Normal',
    icon: CheckCircle2,
    colorClass: 'border-green-200 bg-green-50 text-green-800',
    defaultTextVi: 'Ca diễn ra bình thường, đầy đủ thiết bị và đúng tiến độ.',
    defaultTextEn: 'Shift completed normally with all equipment and on schedule.',
  },
  {
    category: 'attendance',
    labelVi: 'Đi trễ / Về sớm',
    labelEn: 'Attendance',
    icon: Clock,
    colorClass: 'border-amber-200 bg-amber-50 text-amber-800',
    defaultTextVi: 'Nhân sự đi trễ 15 phút do sự cố giao thông.',
    defaultTextEn: 'Staff arrived 15 minutes late due to traffic.',
  },
  {
    category: 'swap',
    labelVi: 'Đổi ca / PASS',
    labelEn: 'Swap / PASS',
    icon: Users,
    colorClass: 'border-blue-200 bg-blue-50 text-blue-800',
    defaultTextVi: 'Đổi ca: đã xác nhận nhân sự thay thế cho ca trực.',
    defaultTextEn: 'Shift swap confirmed with substitute staff.',
  },
  {
    category: 'incident',
    labelVi: 'Sự cố kỹ thuật',
    labelEn: 'Incident',
    icon: AlertTriangle,
    colorClass: 'border-red-200 bg-red-50 text-red-800',
    defaultTextVi: 'Sự cố kỹ thuật âm thanh / đường truyền 10 phút, đã khắc phục.',
    defaultTextEn: 'Technical audio/network glitch for 10 mins, resolved.',
  },
  {
    category: 'sales',
    labelVi: 'Doanh số / SKU',
    labelEn: 'Sales / Product',
    icon: ShoppingBag,
    colorClass: 'border-purple-200 bg-purple-50 text-purple-800',
    defaultTextVi: 'Bán vượt chỉ tiêu 120%, cháy hàng một số SKU chính.',
    defaultTextEn: 'Exceeded sales target by 120%, top SKUs sold out.',
  },
  {
    category: 'other',
    labelVi: 'Khác',
    labelEn: 'Other',
    icon: FileText,
    colorClass: 'border-slate-200 bg-slate-50 text-slate-700',
    defaultTextVi: '',
    defaultTextEn: '',
  },
]

const SHIFT_NOTE_DRAFT_CACHE = new Map<string, string>()

export function ShiftOperationalNotesSection({
  shift,
  currentUser,
  registrations,
}: ShiftOperationalNotesSectionProps) {
  const { language } = useTranslation()
  const { toast } = useToast()
  const isVi = language === 'vi'
  const draftKey = currentUser ? `${shift.id}:${currentUser.id}` : ''

  const [notes, setNotes] = React.useState<ShiftOperationalNote[]>([])
  const [loading, setLoading] = React.useState(true)
  const [schemaUnavailable, setSchemaUnavailable] = React.useState(false)
  const [category, setCategory] = React.useState<ShiftOperationalNoteCategory>('normal')
  const [noteText, setNoteText] = React.useState(() => draftKey ? (SHIFT_NOTE_DRAFT_CACHE.get(draftKey) ?? '') : '')
  const [submitting, setSubmitting] = React.useState(false)
  const [affectedUserId, setAffectedUserId] = React.useState('')
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null)
  const [editingVersion, setEditingVersion] = React.useState<number>(1)
  const [saveState, setSaveState] = React.useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [actionInProgress, setActionInProgress] = React.useState<string | null>(null)
  const [reviewDialog, setReviewDialog] = React.useState<{
    note: ShiftOperationalNote
    action: 'request_correction' | 'reject'
  } | null>(null)
  const [reviewReason, setReviewReason] = React.useState('')
  const idempotencyKeyRef = React.useRef<string>('')
  const reviewActionIdempotencyKeysRef = React.useRef<Map<string, string>>(new Map())

  const getReviewActionKey = (actionKey: string) => {
    let key = reviewActionIdempotencyKeysRef.current.get(actionKey)
    if (!key) {
      key = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      reviewActionIdempotencyKeysRef.current.set(actionKey, key)
    }
    return key
  }

  const assignedStaff = React.useMemo(() => {
    const list: Array<{ id: string; name: string; role?: string }> = []
    const seen = new Set<string>()
    for (const r of registrations) {
      if (['approved', 'manually_assigned', 'confirmed'].includes(r.status) && !seen.has(r.user_id)) {
        seen.add(r.user_id)
        list.push({ id: r.user_id, name: r.imported_name || r.user_id, role: r.operational_role })
      }
    }
    if (shift.host_id && !seen.has(shift.host_id)) {
      seen.add(shift.host_id)
      list.push({ id: shift.host_id, name: 'Host: ' + shift.host_id, role: 'host' })
    }
    if (shift.support_id && !seen.has(shift.support_id)) {
      seen.add(shift.support_id)
      list.push({ id: shift.support_id, name: 'Trợ livestream: ' + shift.support_id, role: 'support' })
    }
    if (shift.technical_id && !seen.has(shift.technical_id)) {
      seen.add(shift.technical_id)
      list.push({ id: shift.technical_id, name: 'Kỹ thuật: ' + shift.technical_id, role: 'technical' })
    }
    return list
  }, [registrations, shift.host_id, shift.support_id, shift.technical_id])

  const isAssignedStaff = Boolean(
    currentUser &&
      (registrations.some(
        r =>
          r.user_id === currentUser.id &&
          r.shift_id === shift.id &&
          ['approved', 'manually_assigned'].includes(r.status),
      ) ||
        shift.host_id === currentUser.id ||
        shift.support_id === currentUser.id ||
        shift.technical_id === currentUser.id),
  )

  const isLeaderOrAdmin = Boolean(
    currentUser &&
      (currentUser.role === 'admin' ||
        currentUser.role === 'leader' ||
        currentUser.system_permission === 'admin' ||
        currentUser.system_permission === 'leader'),
  )

  const canAddNote = (isAssignedStaff || isLeaderOrAdmin) && !schemaUnavailable

  const loadNotes = React.useCallback(async () => {
    try {
      setLoading(true)
      const data = await shiftNoteService.getForShift(shift.id)
      setNotes(data)
      setSchemaUnavailable(false)
      if (draftKey && SHIFT_NOTE_DRAFT_CACHE.has(draftKey)) {
        setNoteText(SHIFT_NOTE_DRAFT_CACHE.get(draftKey)!)
      } else {
        const myDraft = data.find(n => (n.status === 'draft' || (n as unknown as { workflow_state?: string }).workflow_state === 'draft') && (n.author_id === currentUser?.id || n.author_id === (currentUser as unknown as { business_user_id?: string })?.business_user_id))
        if (myDraft) {
          setNoteText(myDraft.note)
          setCategory(myDraft.category)
          setEditingNoteId(myDraft.id)
          setEditingVersion(myDraft.version ?? 1)
          if (myDraft.affected_user_id) setAffectedUserId(myDraft.affected_user_id)
          if (draftKey) SHIFT_NOTE_DRAFT_CACHE.set(draftKey, myDraft.note)
        }
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('SCHEMA_NOT_DEPLOYED') ||
          (err as { code?: string }).code === 'SCHEMA_NOT_DEPLOYED')
      ) {
        setSchemaUnavailable(true)
      } else {
        toast({
          title: isVi ? 'Lỗi' : 'Error',
          description: err instanceof Error ? err.message : 'Không thể tải ghi chú.',
          variant: 'destructive',
        })
      }
    } finally {
      setLoading(false)
    }
  }, [shift.id, isVi, toast, draftKey, currentUser])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of notes for shift
    void loadNotes()
  }, [loadNotes])

  const handleApplyTemplate = (tmpl: CategoryTemplate) => {
    setCategory(tmpl.category)
    setSaveState('dirty')
    const text = isVi ? tmpl.defaultTextVi : tmpl.defaultTextEn
    if (text) {
      setNoteText(text)
    }
  }

  const handleSaveNote = async (asDraft: boolean) => {
    if (!currentUser || !noteText.trim()) return

    const currentIdempotencyKey = idempotencyKeyRef.current || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`)
    idempotencyKeyRef.current = currentIdempotencyKey

    setSubmitting(true)
    setSaveState('saving')
    try {
      if (asDraft) {
        const res = await shiftNoteService.saveDraft({
          noteId: editingNoteId,
          expectedVersion: editingNoteId ? editingVersion : null,
          shiftId: shift.id,
          businessDate: shift.date,
          category,
          note: noteText.trim(),
          affectedUserId: affectedUserId || null,
          idempotencyKey: currentIdempotencyKey,
        })
        toast({
          title: isVi ? 'Thành công' : 'Success',
          description: isVi ? 'Đã lưu nháp ghi chú trên server.' : 'Draft saved to server.',
          variant: 'success',
        })
        if (draftKey) SHIFT_NOTE_DRAFT_CACHE.set(draftKey, noteText.trim())
        if (res?.note?.id) {
          setEditingNoteId(res.note.id)
          setEditingVersion(res.note.version ?? 1)
        }
        setSaveState('saved')
      } else {
        await shiftNoteService.submitNote({
          noteId: editingNoteId,
          expectedVersion: editingNoteId ? editingVersion : null,
          shiftId: shift.id,
          businessDate: shift.date,
          category,
          note: noteText.trim(),
          affectedUserId: affectedUserId || null,
          idempotencyKey: currentIdempotencyKey,
        })
        toast({
          title: isVi ? 'Thành công' : 'Success',
          description: isVi ? 'Đã ghi nhận ghi chú vận hành.' : 'Operational note submitted.',
          variant: 'success',
        })
        if (draftKey) SHIFT_NOTE_DRAFT_CACHE.delete(draftKey)
        setSaveState('saved')
        setNoteText('')
        setEditingNoteId(null)
        setEditingVersion(1)
        setAffectedUserId('')
      }
      idempotencyKeyRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`
      await loadNotes()
    } catch (err: unknown) {
      setSaveState('error')
      const isSchemaError =
        err instanceof Error &&
        (err.message.includes('SCHEMA_NOT_DEPLOYED') ||
          err.message.includes('D2_WORKFLOW_UNAVAILABLE') ||
          (err as { code?: string }).code === 'SCHEMA_NOT_DEPLOYED' ||
          (err as { code?: string }).code === 'D2_WORKFLOW_UNAVAILABLE')
      if (isSchemaError) {
        setSchemaUnavailable(true)
      }
      const isConflict =
        err instanceof Error &&
        (err.message.includes('NOTE_VERSION_CONFLICT') ||
          (err as { code?: string }).code === 'NOTE_VERSION_CONFLICT')
      toast({
        title: isVi ? 'Lỗi' : 'Error',
        description: isConflict
          ? isVi
            ? 'Xung đột phiên bản (CAS): ghi chú đã được sửa đổi bởi người khác. Vui lòng tải lại trước khi lưu.'
            : 'Version conflict (CAS): this note was modified elsewhere. Please refresh before saving.'
          : err instanceof Error ? err.message : 'Không thể lưu ghi chú.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleApproveNote = async (note: ShiftOperationalNote) => {
    setActionInProgress(note.id)
    const actionKey = `approve-${note.id}`
    const idempotencyKey = getReviewActionKey(actionKey)
    try {
      await shiftNoteService.approveNote({
        noteId: note.id,
        expectedVersion: note.version || 1,
        idempotencyKey,
      })
      reviewActionIdempotencyKeysRef.current.delete(actionKey)
      toast({
        title: isVi ? 'Thành công' : 'Success',
        description: isVi ? 'Đã phê duyệt ghi chú.' : 'Note approved.',
        variant: 'success',
      })
      await loadNotes()
    } catch (err: unknown) {
      const isConflict = err instanceof Error && err.message.includes('NOTE_VERSION_CONFLICT')
      toast({
        title: isVi ? 'Lỗi' : 'Error',
        description: isConflict
          ? isVi ? 'Xung đột phiên bản (CAS): ghi chú đã bị thay đổi.' : 'Version conflict: note modified.'
          : err instanceof Error ? err.message : 'Không thể duyệt ghi chú.',
        variant: 'destructive',
      })
    } finally {
      setActionInProgress(null)
    }
  }

  const handleConfirmReviewDialog = async () => {
    if (!reviewDialog) return
    const { note, action } = reviewDialog
    setActionInProgress(note.id)
    const actionKey = `${action}-${note.id}`
    const idempotencyKey = getReviewActionKey(actionKey)
    try {
      if (action === 'request_correction') {
        await shiftNoteService.requestCorrection({
          noteId: note.id,
          expectedVersion: note.version || 1,
          note: reviewReason.trim() || null,
          idempotencyKey,
        })
      } else {
        await shiftNoteService.rejectNote({
          noteId: note.id,
          expectedVersion: note.version || 1,
          reason: reviewReason.trim() || null,
          idempotencyKey,
        })
      }
      reviewActionIdempotencyKeysRef.current.delete(actionKey)
      toast({
        title: isVi ? 'Thành công' : 'Success',
        description: action === 'request_correction'
          ? (isVi ? 'Đã yêu cầu chỉnh sửa ghi chú.' : 'Correction requested.')
          : (isVi ? 'Đã từ chối ghi chú.' : 'Note rejected.'),
        variant: 'success',
      })
      setReviewDialog(null)
      setReviewReason('')
      await loadNotes()
    } catch (err: unknown) {
      toast({
        title: isVi ? 'Lỗi' : 'Error',
        description: err instanceof Error ? err.message : 'Thao tác thất bại.',
        variant: 'destructive',
      })
    } finally {
      setActionInProgress(null)
    }
  }

  const handleResumeDraft = (note: ShiftOperationalNote) => {
    setEditingNoteId(note.id)
    setEditingVersion(note.version || 1)
    setNoteText(note.note)
    setCategory(note.category)
    setAffectedUserId(note.affected_user_id || '')
    // eslint-disable-next-line react-hooks/purity -- event callback resetting idempotency key
    idempotencyKeyRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`
    setSaveState('idle')
  }

  const handleCancelEditing = () => {
    setEditingNoteId(null)
    setEditingVersion(1)
    setNoteText('')
    if (draftKey) SHIFT_NOTE_DRAFT_CACHE.delete(draftKey)
    setCategory('normal')
    setAffectedUserId('')
    setSaveState('idle')
  }

  const formatNoteTime = (isoString: string) => {
    try {
      return format(new Date(isoString), 'HH:mm · dd/MM/yyyy', {
        locale: isVi ? vi : enUS,
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="space-y-4" data-testid="shift-operational-notes-section">
      {schemaUnavailable ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900" data-testid="shift-notes-schema-unavailable">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              {isVi
                ? 'Tính năng Ghi chú vận hành chưa được triển khai trên môi trường này.'
                : 'Operational Notes feature is not yet deployed in this environment.'}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground">
            {isVi
              ? 'Bản di chuyển cơ sở dữ liệu P1 (20261107000000_rc19_shift_operational_notes.sql) đang chờ Owner Review và xác minh môi trường.'
              : 'P1 database migration (20261107000000_rc19_shift_operational_notes.sql) is pending Owner Review and environment verification.'}
          </p>
        </div>
      ) : (
        <>
          {canAddNote ? (
            <Card className="border border-slate-200 shadow-xs">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                {editingNoteId
                  ? isVi ? `Sửa bản nháp (v${editingVersion})` : `Edit Draft (v${editingVersion})`
                  : isVi ? 'Thêm ghi chú vận hành' : 'Add Operational Note'}
              </span>
              <div className="flex items-center gap-2">
                {saveState === 'dirty' && (
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">
                    {isVi ? 'Chưa lưu' : 'Unsaved'}
                  </Badge>
                )}
                {saveState === 'saving' && (
                  <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300 bg-blue-50">
                    {isVi ? 'Đang lưu...' : 'Saving...'}
                  </Badge>
                )}
                {saveState === 'saved' && (
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 bg-emerald-50">
                    {isVi ? 'Đã lưu' : 'Saved'}
                  </Badge>
                )}
                {saveState === 'error' && (
                  <Badge variant="outline" className="text-[10px] text-red-600 border-red-300 bg-red-50">
                    {isVi ? 'Lỗi' : 'Error'}
                  </Badge>
                )}
                <span className="text-xs font-normal text-muted-foreground">
                  {isVi ? 'Gắn với ca trực' : 'Attached to shift'} #{shift.id}
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-3">
            {/* Quick templates chips */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {isVi ? 'Mẫu nhanh theo loại sự kiện:' : 'Quick event templates:'}
              </p>
              <div className="flex flex-wrap gap-1.5" data-testid="note-template-chips">
                {CATEGORY_TEMPLATES.map(tmpl => {
                  const Icon = tmpl.icon
                  const active = category === tmpl.category
                  return (
                    <button
                      type="button"
                      key={tmpl.category}
                      data-testid={`note-chip-${tmpl.category}`}
                      onClick={() => handleApplyTemplate(tmpl)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer ${
                        active
                          ? `${tmpl.colorClass} ring-2 ring-primary ring-offset-1`
                          : 'border-slate-200 bg-background text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {isVi ? tmpl.labelVi : tmpl.labelEn}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="w-full sm:w-44">
                  <Select
                    value={category}
                    onValueChange={v => {
                      setCategory(v as ShiftOperationalNoteCategory)
                      setSaveState('dirty')
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs" data-testid="note-category-select">
                      <SelectValue placeholder={isVi ? 'Chọn phân loại' : 'Select category'} />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_TEMPLATES.map(tmpl => (
                        <SelectItem key={tmpl.category} value={tmpl.category} className="text-xs">
                          {isVi ? tmpl.labelVi : tmpl.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-56">
                  <Select
                    value={affectedUserId || 'none'}
                    onValueChange={v => {
                      setAffectedUserId(v === 'none' ? '' : v)
                      setSaveState('dirty')
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs" data-testid="note-affected-user-select">
                      <SelectValue placeholder={isVi ? 'Nhân sự liên quan' : 'Affected staff'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">
                        {isVi ? '-- Không gắn nhân sự --' : '-- No specific staff --'}
                      </SelectItem>
                      {assignedStaff.map(staff => (
                        <SelectItem key={staff.id} value={staff.id} className="text-xs">
                          {staff.name} {staff.role ? `(${staff.role})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Textarea
                  data-testid="operational-note-input"
                  value={noteText}
                  onChange={e => {
                    setNoteText(e.target.value)
                    if (draftKey) SHIFT_NOTE_DRAFT_CACHE.set(draftKey, e.target.value)
                    setSaveState('dirty')
                  }}
                  placeholder={
                    isVi
                      ? 'Nhập chi tiết sự kiện vận hành (sự cố, đi trễ, đổi ca, doanh số, v.v.)...'
                      : 'Enter operational event details...'
                  }
                  className="min-h-[70px] text-xs resize-y"
                  rows={2}
                />
              </div>

              <div className="flex justify-end items-center gap-2">
                {editingNoteId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEditing}
                    data-testid="cancel-edit-note-btn"
                    className="h-8 text-xs font-medium"
                  >
                    {isVi ? 'Hủy sửa' : 'Cancel'}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="save-draft-operational-note-btn"
                  disabled={submitting || !noteText.trim()}
                  onClick={() => void handleSaveNote(true)}
                  className="h-8 text-xs font-medium"
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {submitting && saveState === 'saving'
                    ? isVi ? 'Đang lưu...' : 'Saving...'
                    : isVi ? 'Lưu nháp' : 'Save Draft'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  data-testid="submit-operational-note-btn"
                  disabled={submitting || !noteText.trim()}
                  onClick={() => void handleSaveNote(false)}
                  className="h-8 text-xs font-medium"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {submitting && saveState === 'saving'
                    ? isVi ? 'Đang lưu...' : 'Saving...'
                    : editingNoteId
                    ? isVi ? 'Xuất bản bản sửa' : 'Publish Edit'
                    : isVi ? 'Ghi nhận sự kiện' : 'Record Note'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-muted/30 p-3 text-xs text-muted-foreground">
          {isVi
            ? 'Chỉ nhân sự được phân công vào ca này hoặc Team Leader / Admin mới có quyền ghi nhận sự kiện vận hành.'
            : 'Only assigned shift staff or Leaders/Admins can record operational notes.'}
        </div>
      )}

      {/* Chronological list of notes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            {isVi ? 'Lịch sử sự kiện ca trực' : 'Shift Event History'}
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
              {notes.length}
            </Badge>
          </h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadNotes()}
            disabled={loading}
            className="h-6 px-2 text-[11px] text-muted-foreground"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {isVi ? 'Tải lại' : 'Refresh'}
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            {isVi ? 'Đang tải ghi chú...' : 'Loading notes...'}
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-muted-foreground">
            {isVi
              ? 'Chưa có ghi chú vận hành nào cho ca này.'
              : 'No operational notes recorded for this shift yet.'}
          </div>
        ) : (
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1" data-testid="notes-history-list">
            {notes.map(note => {
              const tmpl = CATEGORY_TEMPLATES.find(c => c.category === note.category)
              const isDraft = note.status === 'draft'
              const subjectStaff = note.affected_user_id
                ? assignedStaff.find(s => s.id === note.affected_user_id)?.name || note.affected_user_id
                : null
              return (
                <div
                  key={note.id}
                  data-testid={`note-item-${note.id}`}
                  className={`rounded-lg border p-3 shadow-2xs space-y-1.5 ${
                    isDraft
                      ? 'border-amber-200 bg-amber-50/40'
                      : 'border-slate-100 bg-card'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border ${
                          tmpl?.colorClass || 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {isVi ? tmpl?.labelVi || note.category : tmpl?.labelEn || note.category}
                      </span>
                      {isDraft && (
                        <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                          {isVi ? 'Bản nháp' : 'Draft'}
                        </Badge>
                      )}
                      <span className="text-xs font-semibold text-foreground">
                        {note.author_name || note.author_id}
                      </span>
                      {note.author_role && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          ({note.author_role})
                        </span>
                      )}
                      {subjectStaff && (
                        <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                          {isVi ? 'Liên quan:' : 'Subject:'} {subjectStaff}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <time className="text-[11px] text-muted-foreground mr-1">
                        {formatNoteTime(note.actual_event_time || note.created_at || note.event_time || '')}
                      </time>
                      {isDraft && canAddNote && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => handleResumeDraft(note)}
                          data-testid={`resume-draft-btn-${note.id}`}
                        >
                          <FileEdit className="h-3 w-3 mr-1" />
                          {isVi ? 'Sửa nháp' : 'Edit Draft'}
                        </Button>
                      )}
                      {isLeaderOrAdmin && !isDraft && (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                            disabled={actionInProgress === note.id}
                            onClick={() => void handleApproveNote(note)}
                            data-testid={`approve-note-btn-${note.id}`}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {isVi ? 'Duyệt' : 'Approve'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                            disabled={actionInProgress === note.id}
                            onClick={() => {
                              setReviewDialog({ note, action: 'request_correction' })
                              setReviewReason('')
                            }}
                            data-testid={`request-correction-note-btn-${note.id}`}
                          >
                            <FileEdit className="h-3 w-3 mr-1" />
                            {isVi ? 'Sửa' : 'Correction'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-red-700 hover:text-red-800 hover:bg-red-50"
                            disabled={actionInProgress === note.id}
                            onClick={() => {
                              setReviewDialog({ note, action: 'reject' })
                              setReviewReason('')
                            }}
                            data-testid={`reject-note-btn-${note.id}`}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            {isVi ? 'Từ chối' : 'Reject'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {note.note}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Review Dialog for Correction or Rejection */}
      <Dialog open={Boolean(reviewDialog)} onOpenChange={(open) => !open && setReviewDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {reviewDialog?.action === 'request_correction'
                ? (isVi ? 'Yêu cầu chỉnh sửa ghi chú' : 'Request Note Correction')
                : (isVi ? 'Từ chối ghi chú vận hành' : 'Reject Operational Note')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {reviewDialog?.action === 'request_correction'
                ? (isVi ? 'Nhập lý do hoặc nội dung cần tác giả sửa đổi:' : 'Enter revision feedback for author:')
                : (isVi ? 'Nhập lý do từ chối ghi nhận sự kiện này:' : 'Enter justification for rejecting this note:')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              data-testid="note-review-reason-input"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder={isVi ? 'Lý do...' : 'Reason...'}
              className="text-xs min-h-[80px]"
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReviewDialog(null)}
              className="text-xs"
            >
              {isVi ? 'Hủy' : 'Cancel'}
            </Button>
            <Button
              type="button"
              variant={reviewDialog?.action === 'reject' ? 'destructive' : 'default'}
              size="sm"
              data-testid="confirm-note-review-btn"
              disabled={actionInProgress === reviewDialog?.note.id || !reviewReason.trim()}
              onClick={() => void handleConfirmReviewDialog()}
              className="text-xs"
            >
              {actionInProgress === reviewDialog?.note.id
                ? (isVi ? 'Đang gửi...' : 'Submitting...')
                : reviewDialog?.action === 'reject'
                ? (isVi ? 'Xác nhận từ chối' : 'Confirm Rejection')
                : (isVi ? 'Gửi yêu cầu' : 'Send Request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  )
}
