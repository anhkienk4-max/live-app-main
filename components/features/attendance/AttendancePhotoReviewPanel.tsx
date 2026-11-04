'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n'
import { CheckCircle2, XCircle, AlertTriangle, Clock, ExternalLink } from 'lucide-react'

type ReviewDecision = 'approved' | 'rejected' | 'correction_requested'
type ReviewEvent = {
  id: string
  staff_id: string
  role: 'host' | 'support' | 'technical'
  event: 'check_in' | 'check_out'
  recorded_at: string
  photo_available: boolean
  version: number
  evidence_revision: number
  status: string
  evidence_revisions: Array<{ revision: number; created_at: string }>
  review_history: Array<{
    decision: ReviewDecision
    reason: string
    reviewer_id: string
    version: number
    evidence_revision: number
    created_at: string
  }>
}

export function AttendancePhotoReviewPanel({ shiftId }: { shiftId: string }) {
  const { language } = useTranslation()
  const en = language === 'en'
  const [events, setEvents] = React.useState<ReviewEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [reason, setReason] = React.useState<Record<string, string>>({})
  const [decision, setDecision] = React.useState<Record<string, ReviewDecision>>({})
  const [busy, setBusy] = React.useState<string | null>(null)

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch('/api/workforce/attendance-photo-review?shift_id=' + encodeURIComponent(shiftId), {
          cache: 'no-store',
          signal,
        })
        if (response.status === 404) {
          setEvents([])
          setError('')
          return
        }
        const body = await response.json()
        if (!response.ok || body.ok !== true) throw new Error(body.error?.code ?? 'ATTENDANCE_REVIEW_UNAVAILABLE')
        setEvents(body.events || [])
        setError('')
      } catch (cause) {
        if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'ATTENDANCE_REVIEW_UNAVAILABLE')
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [shiftId]
  )

  React.useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void load(controller.signal), 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [load])

  const submit = async (item: ReviewEvent) => {
    const note = reason[item.id]?.trim() ?? ''
    if (note.length < 8 || busy) return
    setBusy(item.id)
    setError('')
    try {
      const response = await fetch('/api/workforce/attendance-photo-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: item.id,
          expected_version: item.version,
          expected_evidence_revision: item.evidence_revision,
          decision: decision[item.id] ?? 'approved',
          reason: note,
          idempotency_key: crypto.randomUUID(),
        }),
      })
      const body = await response.json()
      if (!response.ok || body.ok !== true) throw new Error(body.error?.code ?? 'ATTENDANCE_REVIEW_FAILED')
      setLoading(true)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ATTENDANCE_REVIEW_FAILED')
    } finally {
      setBusy(null)
    }
  }

  const retry = () => {
    setLoading(true)
    setError('')
    void load()
  }

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            {en ? 'Approved' : 'Đã duyệt'}
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800 text-[11px] gap-1">
            <XCircle className="h-3 w-3 text-rose-600" />
            {en ? 'Rejected' : 'Từ chối'}
          </Badge>
        )
      case 'correction_requested':
        return (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[11px] gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-600" />
            {en ? 'Correction Requested' : 'Yêu cầu sửa'}
          </Badge>
        )
      case 'pending_verification':
      default:
        return (
          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800 text-[11px] gap-1">
            <Clock className="h-3 w-3 text-blue-600" />
            {en ? 'Pending Review' : 'Chờ đối soát'}
          </Badge>
        )
    }
  }

  if (!loading && !error && events.length === 0) return null

  return (
    <section
      className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"
      aria-labelledby="attendance-photo-review-title"
      data-testid="attendance-photo-review"
    >
      <div>
        <h3 id="attendance-photo-review-title" className="text-sm font-semibold text-slate-900">
          {en ? 'Attendance photo evidence review' : 'Đối soát ảnh chấm công'}
        </h3>
        <p className="text-xs text-slate-600">
          {en
            ? 'Independent evidence decisions. This does not approve Actual Staffing or Payroll.'
            : 'Quyết định minh chứng độc lập; không duyệt Actual Staffing hoặc Payroll.'}
        </p>
      </div>
      {loading && <p role="status" className="text-xs text-slate-600">{en ? 'Loading evidence…' : 'Đang tải minh chứng…'}</p>}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-rose-700">
          <span>{error}</span>
          <Button type="button" size="sm" variant="outline" onClick={retry}>
            {en ? 'Retry' : 'Thử lại'}
          </Button>
        </div>
      )}
      {events.map(item => (
        <article
          key={item.id}
          className="space-y-3 rounded-md border border-slate-200 bg-white p-3 shadow-2xs"
          data-testid="attendance-photo-review-event"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <strong className="text-slate-800">
                {item.role.toUpperCase()} · {item.event === 'check_in' ? 'Check-in' : 'Check-out'} · {item.staff_id}
              </strong>
              <span className="text-slate-400">v{item.version}</span>
            </div>
            {renderStatusBadge(item.status)}
          </div>

          <p className="text-xs text-slate-500">
            {new Date(item.recorded_at).toLocaleString(en ? 'en-US' : 'vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
            })}
          </p>

          {/* Inline photo thumbnail when available */}
          {item.photo_available && (
            <div className="rounded-md border border-slate-100 bg-slate-50 p-2 max-w-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={'/api/workforce/self-attendance-photo?event_id=' + encodeURIComponent(item.id) + '&revision=' + item.evidence_revision}
                alt={en ? 'Attendance photo evidence' : 'Ảnh minh chứng điểm danh'}
                className="max-h-40 w-full rounded object-contain bg-black/5"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {item.evidence_revisions.map(revision => (
              <a
                key={revision.revision}
                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 underline"
                href={'/api/workforce/self-attendance-photo?event_id=' + encodeURIComponent(item.id) + '&revision=' + revision.revision}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-3 w-3" />
                {en ? `Open evidence revision ${revision.revision}` : `Mở minh chứng phiên bản ${revision.revision}`}
              </a>
            ))}
          </div>

          {item.review_history.map(review => (
            <div
              key={review.version}
              className="border-l-2 border-indigo-300 bg-slate-50/80 p-2 rounded-r text-xs text-slate-600 space-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 uppercase text-[10px]">
                  v{review.version} / rev {review.evidence_revision}: {review.decision}
                </span>
                <span className="text-[10px] text-slate-400">
                  {new Date(review.created_at).toLocaleString(en ? 'en-US' : 'vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}
                </span>
              </div>
              <p className="text-slate-700 italic">&ldquo;{review.reason}&rdquo;</p>
              <p className="text-[10px] text-slate-500">{en ? 'Reviewer: ' : 'Người duyệt: '}{review.reviewer_id}</p>
            </div>
          ))}

          {item.status === 'correction_requested' && (
            <p role="status" className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
              {en
                ? 'Waiting for the employee to submit a replacement photo.'
                : 'Đang chờ nhân sự gửi ảnh bổ sung.'}
            </p>
          )}

          {item.photo_available && item.status === 'pending_verification' && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] pt-1 border-t border-slate-100">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1" htmlFor={'decision-' + item.id}>
                  {en ? 'Decision' : 'Quyết định'}
                </label>
                <select
                  id={'decision-' + item.id}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-medium"
                  value={decision[item.id] ?? 'approved'}
                  onChange={e => setDecision(v => ({ ...v, [item.id]: e.target.value as ReviewDecision }))}
                >
                  <option value="approved">{en ? 'Approve' : 'Phê duyệt'}</option>
                  <option value="rejected">{en ? 'Reject' : 'Từ chối'}</option>
                  <option value="correction_requested">{en ? 'Request correction' : 'Yêu cầu bổ sung'}</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1" htmlFor={'reason-' + item.id}>
                  {en ? 'Review reason' : 'Lý do đối soát'}
                </label>
                <Textarea
                  id={'reason-' + item.id}
                  value={reason[item.id] ?? ''}
                  minLength={8}
                  maxLength={2000}
                  onChange={e => setReason(v => ({ ...v, [item.id]: e.target.value }))}
                  placeholder={en ? 'Reason (at least 8 characters)' : 'Lý do (ít nhất 8 ký tự)'}
                  className="text-xs h-9 min-h-[36px] py-1.5"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy === item.id || Boolean(busy) || (reason[item.id]?.trim().length ?? 0) < 8}
                  onClick={() => void submit(item)}
                  className="w-full sm:w-auto text-xs h-9"
                >
                  {busy === item.id ? (en ? 'Saving…' : 'Đang lưu…') : en ? 'Record decision' : 'Ghi nhận'}
                </Button>
              </div>
            </div>
          )}
        </article>
      ))}
    </section>
  )
}
