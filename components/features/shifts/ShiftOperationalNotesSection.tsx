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
} from 'lucide-react'

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

export function ShiftOperationalNotesSection({
  shift,
  currentUser,
  registrations,
}: ShiftOperationalNotesSectionProps) {
  const { language } = useTranslation()
  const { toast } = useToast()
  const isVi = language === 'vi'

  const [notes, setNotes] = React.useState<ShiftOperationalNote[]>([])
  const [loading, setLoading] = React.useState(true)
  const [schemaUnavailable, setSchemaUnavailable] = React.useState(false)
  const [category, setCategory] = React.useState<ShiftOperationalNoteCategory>('normal')
  const [noteText, setNoteText] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [affectedUserId, setAffectedUserId] = React.useState('')
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null)
  const [editingVersion, setEditingVersion] = React.useState<number>(1)
  const [saveState, setSaveState] = React.useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')

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
  }, [shift.id, isVi, toast])

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

    setSubmitting(true)
    setSaveState('saving')
    try {
      if (editingNoteId) {
        await shiftNoteService.update({
          noteId: editingNoteId,
          expectedVersion: editingVersion,
          note: noteText.trim(),
          category,
          status: asDraft ? 'draft' : 'published',
          affectedUserId: affectedUserId || null,
        })
        toast({
          title: isVi ? 'Thành công' : 'Success',
          description: asDraft
            ? isVi ? 'Đã lưu nháp ghi chú.' : 'Draft updated.'
            : isVi ? 'Đã xuất bản ghi chú.' : 'Note published.',
          variant: 'success',
        })
      } else {
        await shiftNoteService.create({
          shiftId: shift.id,
          businessDate: shift.date,
          date: shift.date,
          category,
          note: noteText.trim(),
          authorId: currentUser.id,
          authorName: currentUser.full_name || currentUser.id,
          authorRole: currentUser.role || 'staff',
          actualEventTime: new Date().toISOString(),
          status: asDraft ? 'draft' : 'published',
          isDraft: asDraft,
          affectedUserId: affectedUserId || null,
        })
        toast({
          title: isVi ? 'Thành công' : 'Success',
          description: asDraft
            ? isVi ? 'Đã lưu nháp ghi chú vận hành.' : 'Operational note draft saved.'
            : isVi ? 'Đã ghi nhận ghi chú vận hành.' : 'Operational note recorded.',
          variant: 'success',
        })
      }
      setSaveState('saved')
      setNoteText('')
      setEditingNoteId(null)
      setEditingVersion(1)
      setAffectedUserId('')
      await loadNotes()
    } catch (err: unknown) {
      setSaveState('error')
      const isSchemaError =
        err instanceof Error &&
        (err.message.includes('SCHEMA_NOT_DEPLOYED') ||
          (err as { code?: string }).code === 'SCHEMA_NOT_DEPLOYED')
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
            ? 'Xung đột phiên bản: ghi chú đã được sửa đổi bởi người khác. Vui lòng tải lại trước khi lưu.'
            : 'Version conflict: this note was modified elsewhere. Please refresh before saving.'
          : err instanceof Error ? err.message : 'Không thể lưu ghi chú.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleResumeDraft = (note: ShiftOperationalNote) => {
    setEditingNoteId(note.id)
    setEditingVersion(note.version || 1)
    setNoteText(note.note)
    setCategory(note.category)
    setAffectedUserId(note.affected_user_id || '')
    setSaveState('idle')
  }

  const handleCancelEditing = () => {
    setEditingNoteId(null)
    setEditingVersion(1)
    setNoteText('')
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
                  data-testid="note-content-input"
                  value={noteText}
                  onChange={e => {
                    setNoteText(e.target.value)
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
                    <div className="flex items-center gap-2">
                      <time className="text-[11px] text-muted-foreground">
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
        </>
      )}
    </div>
  )
}
