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
  FileText,
  MessageSquarePlus,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
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
  const [category, setCategory] = React.useState<ShiftOperationalNoteCategory>('normal')
  const [noteText, setNoteText] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

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

  const canAddNote = isAssignedStaff || isLeaderOrAdmin

  const loadNotes = React.useCallback(async () => {
    try {
      setLoading(true)
      const data = await shiftNoteService.getForShift(shift.id)
      setNotes(data)
    } finally {
      setLoading(false)
    }
  }, [shift.id])

  React.useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  const handleApplyTemplate = (tmpl: CategoryTemplate) => {
    setCategory(tmpl.category)
    const text = isVi ? tmpl.defaultTextVi : tmpl.defaultTextEn
    if (text) {
      setNoteText(text)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser || !noteText.trim()) return

    setSubmitting(true)
    try {
      await shiftNoteService.create({
        shiftId: shift.id,
        date: shift.date,
        category,
        note: noteText.trim(),
        authorId: currentUser.id,
        authorName: currentUser.full_name || currentUser.id,
        authorRole: currentUser.role || 'staff',
      })
      toast({
        title: isVi ? 'Thành công' : 'Success',
        description: isVi ? 'Đã ghi nhận ghi chú vận hành.' : 'Operational note saved.',
        variant: 'success',
      })
      setNoteText('')
      await loadNotes()
    } catch (err) {
      toast({
        title: isVi ? 'Lỗi' : 'Error',
        description: err instanceof Error ? err.message : 'Không thể lưu ghi chú.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
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
      {canAddNote ? (
        <Card className="border border-slate-200 shadow-xs">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                {isVi ? 'Thêm ghi chú vận hành' : 'Add Operational Note'}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {isVi ? 'Gắn với ca trực' : 'Attached to shift'} #{shift.id}
              </span>
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

            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="w-full sm:w-44">
                  <Select
                    value={category}
                    onValueChange={v => setCategory(v as ShiftOperationalNoteCategory)}
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
                <div className="flex-1">
                  <Textarea
                    data-testid="note-content-input"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder={
                      isVi
                        ? 'Nhập chi tiết sự kiện vận hành (sự cố, đi trễ, đổi ca, doanh số, v.v.)...'
                        : 'Enter operational event details...'
                    }
                    className="min-h-[70px] text-xs resize-y"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="submit"
                  size="sm"
                  data-testid="submit-operational-note-btn"
                  disabled={submitting || !noteText.trim()}
                  className="h-8 text-xs font-medium"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {submitting
                    ? isVi
                      ? 'Đang lưu...'
                      : 'Saving...'
                    : isVi
                      ? 'Ghi nhận sự kiện'
                      : 'Record Note'}
                </Button>
              </div>
            </form>
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
              return (
                <div
                  key={note.id}
                  data-testid={`note-item-${note.id}`}
                  className="rounded-lg border border-slate-100 bg-card p-3 shadow-2xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border ${
                          tmpl?.colorClass || 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {isVi ? tmpl?.labelVi || note.category : tmpl?.labelEn || note.category}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {note.author_name || note.author_id}
                      </span>
                      {note.author_role && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          ({note.author_role})
                        </span>
                      )}
                    </div>
                    <time className="text-[11px] text-muted-foreground">
                      {formatNoteTime(note.created_at || note.event_time)}
                    </time>
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
    </div>
  )
}
