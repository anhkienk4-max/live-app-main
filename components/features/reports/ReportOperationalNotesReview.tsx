'use client'

import * as React from 'react'
import {
  AlertTriangle,
  Eye,
  EyeOff,
  FileText,
  Lock,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  shiftNoteService,
} from '@/lib/services/shiftNoteService'
import type { ShiftOperationalNote } from '@/lib/types/database.types'

interface ReportOperationalNotesReviewProps {
  reportId?: string
  revisionVersion?: number
  shiftId?: string
  readOnly?: boolean
  storedSnapshot?: ShiftOperationalNote[] | null
  selectedNoteIds?: string[]
  onSelectionChange?: (noteIds: string[]) => void
  className?: string
}

export function ReportOperationalNotesReview({
  reportId,
  revisionVersion,
  shiftId,
  readOnly = false,
  storedSnapshot = null,
  selectedNoteIds = [],
  onSelectionChange,
  className = '',
}: ReportOperationalNotesReviewProps) {
  const { language } = useTranslation()
  const isVi = language === 'vi'

  const [notes, setNotes] = React.useState<ShiftOperationalNote[]>([])
  const [incidentsCount, setIncidentsCount] = React.useState(0)
  const [externalProjection, setExternalProjection] = React.useState<{
    schemaVersion: number
    reportId: string
    revisionVersion: number
    status: string
    metrics: {
      revenue: number
      orders: number
      peakViewer: number
      averageViewer: number
      gmv?: number | null
      viewers?: number | null
      productClicks?: number | null
      ctr?: number | null
      cvr?: number | null
      averageOrderValue?: number | null
      liveDurationMinutes?: number | null
      dashboardPlatform: string
    }
    operationalSummary?: {
      version: number
      content: string
    } | null
  } | null>(null)
  const [loading, setLoading] = React.useState(!readOnly)
  const [schemaUnavailable, setSchemaUnavailable] = React.useState(false)
  const [snapshotUnavailable, setSnapshotUnavailable] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [previewAudience, setPreviewAudience] = React.useState<'internal' | 'external'>('internal')

  const loadNotes = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    setSchemaUnavailable(false)
    setSnapshotUnavailable(false)

    // 1. If reportId is available, attempt to fetch from backend revision-snapshots API
    if (reportId) {
      try {
        const queryParams = new URLSearchParams()
        queryParams.set('report_id', reportId)
        queryParams.set('audience', previewAudience)
        if (readOnly && revisionVersion !== undefined) {
          queryParams.set('revision_version', String(revisionVersion))
        }

        const res = await fetch(`/api/reports/revision-snapshots?${queryParams.toString()}`)
        if (res.status === 404) {
          if (readOnly) {
            setSnapshotUnavailable(true)
            setNotes(storedSnapshot || [])
          } else {
            if (shiftId) {
              const data = await shiftNoteService.getForShift(shiftId)
              setNotes(data.filter(n => n.status !== 'draft'))
            } else {
              setNotes([])
            }
          }
          setLoading(false)
          return
        }

        if (res.status === 403) {
          setError(isVi ? 'Không có quyền truy cập bản snapshot báo cáo này.' : 'Forbidden: You do not have permission to access this report snapshot.')
          setLoading(false)
          return
        }

        if (res.status === 503) {
          setSchemaUnavailable(true)
          setLoading(false)
          return
        }

        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error?.code || `HTTP_${res.status}`)
          setLoading(false)
          return
        }

        const json = await res.json()
        const data = json.data

        if (previewAudience === 'external') {
          if (data?.externalProjection) {
            setExternalProjection(data.externalProjection)
          } else {
            setExternalProjection(null)
          }
        } else {
          const source = data?.sourceSnapshot
          if (source && Array.isArray(source.notes)) {
            type SourceNote = {
              noteId: string
              businessDate: string
              category: ShiftOperationalNote['category']
              note: string
              authorId: string
              authorName?: string
              authorRole?: ShiftOperationalNote['author_role']
              actualEventTime: string
              affectedRole?: ShiftOperationalNote['affected_role']
              affectedUserId?: string
              version: number
              workflowState?: string
            }
            const mappedNotes: ShiftOperationalNote[] = (source.notes as SourceNote[]).map(n => ({
              id: n.noteId,
              shift_id: shiftId || '',
              business_date: n.businessDate,
              date: n.businessDate,
              category: n.category,
              note: n.note,
              author_id: n.authorId,
              author_name: n.authorName || n.authorId,
              author_role: n.authorRole || 'staff',
              actual_event_time: n.actualEventTime,
              event_time: n.actualEventTime,
              affected_role: n.affectedRole,
              affected_user_id: n.affectedUserId,
              version: n.version,
              status: n.workflowState === 'draft' ? 'draft' : 'published',
              created_at: n.actualEventTime,
              updated_at: n.actualEventTime,
            }))
            setNotes(mappedNotes)
            setIncidentsCount(Array.isArray(source.incidents) ? source.incidents.length : 0)
          } else {
            setNotes(storedSnapshot || [])
          }
        }
        setLoading(false)
        return
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
        return
      }
    }

    // 2. In read-only mode without reportId, only use stored snapshot
    if (readOnly) {
      setNotes(storedSnapshot || [])
      setLoading(false)
      return
    }

    if (!shiftId) {
      setNotes([])
      setLoading(false)
      return
    }

    try {
      const data = await shiftNoteService.getForShift(shiftId)
      setNotes(data.filter(n => n.status !== 'draft'))
      setSchemaUnavailable(false)
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('SCHEMA_NOT_DEPLOYED') ||
          (err as { code?: string }).code === 'SCHEMA_NOT_DEPLOYED')
      ) {
        setSchemaUnavailable(true)
      } else {
        setNotes([])
      }
    } finally {
      setLoading(false)
    }
  }, [reportId, revisionVersion, previewAudience, readOnly, shiftId, storedSnapshot, isVi])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of report notes
    void loadNotes()
  }, [loadNotes])

  const handleToggleNote = (noteId: string) => {
    if (readOnly || !onSelectionChange) return
    const isSelected = selectedNoteIds.includes(noteId)
    if (isSelected) {
      onSelectionChange(selectedNoteIds.filter(id => id !== noteId))
    } else {
      onSelectionChange([...selectedNoteIds, noteId])
    }
  }

  const handleSelectAll = () => {
    if (readOnly || !onSelectionChange) return
    if (selectedNoteIds.length === notes.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(notes.map(n => n.id))
    }
  }

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-3 space-y-3 ${className}`}
      data-testid="report-operational-notes-review"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div>
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-primary" />
            {isVi ? 'Ghi chú & Sự cố vận hành ca trực' : 'Shift Operational Notes & Incidents'}
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
              {notes.length}{incidentsCount > 0 ? ` · ${incidentsCount} ${isVi ? 'sự cố' : 'incidents'}` : ''}
            </Badge>
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isVi
              ? 'Xem xét các sự kiện vận hành để đưa vào snapshot báo cáo ca.'
              : 'Review operational shift events for inclusion in the report snapshot.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Internal vs External Audience Preview Toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setPreviewAudience('internal')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                previewAudience === 'internal'
                  ? 'bg-white text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="preview-audience-internal-btn"
            >
              <Eye className="h-3 w-3 text-blue-600" />
              {isVi ? 'Nội bộ' : 'Internal'}
            </button>
            <button
              type="button"
              onClick={() => setPreviewAudience('external')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                previewAudience === 'external'
                  ? 'bg-white text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="preview-audience-external-btn"
            >
              <EyeOff className="h-3 w-3 text-emerald-600" />
              {isVi ? 'Bản đối tác (External-Safe)' : 'External-Safe'}
            </button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadNotes()}
            disabled={loading}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {isVi ? 'Tải lại' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-center justify-between gap-2"
          data-testid="report-snapshot-error"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadNotes()}
            className="h-6 px-2 text-[11px] text-red-800 border-red-300"
          >
            {isVi ? 'Thử lại' : 'Retry'}
          </Button>
        </div>
      ) : readOnly && (!storedSnapshot || storedSnapshot.length === 0) && snapshotUnavailable ? (
        <div
          className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-muted-foreground"
          data-testid="report-snapshot-unavailable"
        >
          {isVi
            ? 'Snapshot ghi chú & sự cố chưa khả dụng trên bản lưu báo cáo này (Backend snapshot pending). Lịch sử báo cáo gốc được bảo toàn.'
            : 'Operational notes snapshot is not available for this stored report revision (Backend snapshot pending). Original report history preserved.'}
        </div>
      ) : schemaUnavailable ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          data-testid="report-notes-schema-unavailable"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              {isVi
                ? 'Tính năng Ghi chú vận hành chưa được triển khai trên môi trường này.'
                : 'Operational notes feature is not yet deployed in this environment.'}
            </span>
          </div>
        </div>
      ) : loading ? (
        <div
          className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2"
          data-testid="report-snapshot-loading"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>{isVi ? 'Đang tải danh sách sự kiện vận hành...' : 'Loading operational events...'}</span>
        </div>
      ) : previewAudience === 'external' ? (
        externalProjection ? (
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-xs space-y-3"
            data-testid="report-external-projection-view"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-emerald-900">
                <Shield className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  {isVi
                    ? 'Bản chiếu an toàn cho đối tác bên ngoài (External-Safe Projection)'
                    : 'External-Safe Projection (Client-safe)'}
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] bg-white border-emerald-300 text-emerald-800">
                v{externalProjection.revisionVersion} ({externalProjection.status})
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="bg-white p-2 rounded border border-emerald-100 text-center">
                <span className="text-[10px] text-muted-foreground block">{isVi ? 'Doanh thu' : 'Revenue'}</span>
                <span className="font-semibold text-emerald-900 text-xs">
                  {externalProjection.metrics.revenue.toLocaleString()} ₫
                </span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100 text-center">
                <span className="text-[10px] text-muted-foreground block">{isVi ? 'Đơn hàng' : 'Orders'}</span>
                <span className="font-semibold text-emerald-900 text-xs">
                  {externalProjection.metrics.orders}
                </span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100 text-center">
                <span className="text-[10px] text-muted-foreground block">{isVi ? 'Mắt xem cao nhất' : 'Peak Viewers'}</span>
                <span className="font-semibold text-emerald-900 text-xs">
                  {externalProjection.metrics.peakViewer}
                </span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100 text-center">
                <span className="text-[10px] text-muted-foreground block">{isVi ? 'Mắt xem TB' : 'Avg Viewers'}</span>
                <span className="font-semibold text-emerald-900 text-xs">
                  {externalProjection.metrics.averageViewer}
                </span>
              </div>
            </div>
            {externalProjection.operationalSummary?.content && (
              <div className="bg-white p-3 rounded border border-emerald-200 space-y-1.5" data-testid="report-approved-external-summary">
                <div className="font-semibold text-emerald-950 text-xs">
                  {isVi ? 'Tóm tắt vận hành (Đã duyệt gửi đối tác)' : 'Operational Summary (Approved for External Sharing)'}
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {externalProjection.operationalSummary.content}
                </p>
                <div className="text-[10px] text-muted-foreground pt-0.5">
                  v{externalProjection.operationalSummary.version}
                </div>
              </div>
            )}
            <p className="text-[11px] text-emerald-800/80 leading-relaxed border-t border-emerald-200/60 pt-2">
              {isVi
                ? 'Thông tin nhân sự, danh tính cá nhân và chi tiết ghi chú nội bộ được tách biệt hoàn toàn phía server theo ranh giới phân quyền.'
                : 'Personnel identities, staff names, and internal notes are fully withheld server-side per authorization boundaries.'}
            </p>
          </div>
        ) : (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1"
            data-testid="external-safe-backend-pending"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Shield className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                {isVi
                  ? 'Bản chiếu External-Safe phải do backend RPC cấp theo quyền truy cập.'
                  : 'External-Safe projection must be generated by backend RPC based on permissions.'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isVi
                ? 'Client không tự che giấu dữ liệu để làm ranh giới bảo mật. Chi tiết nhân sự nội bộ được bảo vệ an toàn đối với góc nhìn đối tác cho đến khi backend kích hoạt RPC chiếu an toàn.'
                : 'Client-side masking is not a security boundary. Internal personnel details are withheld from external views until backend projection RPC is deployed.'}
            </p>
          </div>
        )
      ) : notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-muted-foreground">
          {isVi
            ? 'Ca trực này không có ghi chú hoặc sự cố vận hành nào.'
            : 'No operational notes or incidents recorded for this shift.'}
        </div>
      ) : (
        <div className="space-y-2">
          {!readOnly && (
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>
                {isVi
                  ? `Đã chọn ${selectedNoteIds.length}/${notes.length} sự kiện đưa vào báo cáo`
                  : `Selected ${selectedNoteIds.length}/${notes.length} events for report`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px]"
                onClick={handleSelectAll}
                data-testid="report-notes-select-all-btn"
              >
                {selectedNoteIds.length === notes.length
                  ? isVi ? 'Bỏ chọn tất cả' : 'Deselect all'
                  : isVi ? 'Chọn tất cả' : 'Select all'}
              </Button>
            </div>
          )}

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {notes.map(note => {
              const isSelected = selectedNoteIds.includes(note.id)

              return (
                <div
                  key={note.id}
                  data-testid={`report-note-item-${note.id}`}
                  className={`rounded-lg border p-3 text-xs space-y-1.5 transition-all ${
                    isSelected
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-slate-100 bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {!readOnly && (
                        <div className="pt-0.5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleNote(note.id)}
                            data-testid={`checkbox-note-${note.id}`}
                          />
                        </div>
                      )}
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-semibold"
                          >
                            {note.category}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            v{note.version}
                          </Badge>
                          <span className="font-medium text-foreground">
                            {note.author_name || note.author_id}
                          </span>
                          {note.affected_user_id && (
                            <span className="text-[10px] text-slate-600 bg-slate-100 px-1 py-0.5 rounded font-mono">
                              Staff: {note.affected_user_id}
                            </span>
                          )}
                        </div>
                        <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                          {note.note}
                        </p>
                      </div>
                    </div>

                    <time className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(note.actual_event_time || note.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Report Snapshot Immutability Notice */}
          <div className="rounded border border-slate-100 bg-slate-50/70 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-700">
                {isVi
                  ? 'Bảo toàn tính bất biến của Snapshot báo cáo (Snapshot Immutability):'
                  : 'Report Snapshot Immutability Policy:'}
              </p>
              <p className="mt-0.5 leading-relaxed">
                {isVi
                  ? 'Snapshot sự cố được tạo phía máy chủ trong transaction sửa đổi báo cáo. Không query ghi chú trực tiếp để làm thay đổi lịch sử báo cáo đã chốt.'
                  : 'Incident snapshots are created server-side inside report revision transactions. Live note queries do not alter finalized report history.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
