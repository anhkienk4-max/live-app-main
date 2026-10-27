'use client'

import { addDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Eye, FileText } from 'lucide-react'
import type { Brand, Platform, Report, Shift } from '@/lib/types/database.types'
import type { ReportCalendarEntry, ReportCalendarScale } from '@/lib/utils/reportMultiView'
import { reportQueueDisplayState } from '@/lib/utils/reportQueue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const statusLabels: Record<ReturnType<typeof reportQueueDisplayState>, string> = {
  not_started: 'Chưa lập', draft: 'Draft', in_review: 'In Review', reopened: 'Reopened',
  unconfirmed: 'Chưa xác nhận', confirmed: 'Confirmed',
}

export function CompactReportRows({ reports, shiftById, brands, platforms, onView, onHistorical }: {
  reports: Report[]
  shiftById: Map<string, Shift>
  brands: Brand[]
  platforms: Platform[]
  onView: (report: Report) => void
  onHistorical: (report: Report) => void
}) {
  const brandById = new Map(brands.map(b => [b.id, b.name]))
  const platformById = new Map(platforms.map(p => [p.id, p.name]))
  return <div className="divide-y rounded-lg border bg-card" data-testid="reports-compact-list">
    {reports.map(report => {
      const shift = shiftById.get(report.shift_id)
      const status = reportQueueDisplayState(report)
      return <div key={report.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-4">
        <div className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
          {shift?.date ?? 'Lịch sử'}
          {shift && <span className="block">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{shift ? brandById.get(shift.brand_id) ?? '—' : 'Báo cáo lịch sử'}</div>
          <div className="truncate text-xs text-muted-foreground">{shift ? platformById.get(shift.platform_id) ?? '—' : 'Ngữ cảnh ca gốc không có sẵn'} · {report.id}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{statusLabels[status]}</Badge>
          <Badge variant={report.metrics_confirmed === true ? 'secondary' : 'outline'}>{report.metrics_confirmed === true ? 'Số liệu đã xác nhận' : 'Số liệu chưa xác nhận'}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => shift ? onView(report) : onHistorical(report)}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />Chi tiết
          </Button>
        </div>
      </div>
    })}
  </div>
}

function calendarStatus(item: ReportCalendarEntry) {
  return item.report ? reportQueueDisplayState(item.report) : 'not_started'
}

export function ReportCalendarGrid({ date, scale, entries, brands, platforms, onSelectDay, onSelectEntry, onNavigate }: {
  date: string
  scale: ReportCalendarScale
  entries: ReportCalendarEntry[]
  brands: Brand[]
  platforms: Platform[]
  onSelectDay: (day: string) => void
  onSelectEntry: (entry: ReportCalendarEntry) => void
  onNavigate: (direction: 'previous' | 'today' | 'next') => void
}) {
  const selected = parseISO(date)
  const first = scale === 'month' ? startOfWeek(startOfMonth(selected), { weekStartsOn: 1 })
    : scale === 'week' ? startOfWeek(selected, { weekStartsOn: 1 }) : selected
  const last = scale === 'month' ? endOfWeek(endOfMonth(selected), { weekStartsOn: 1 })
    : scale === 'week' ? addDays(first, 6) : selected
  const days: string[] = []
  for (let current = first; current <= last; current = addDays(current, 1)) days.push(format(current, 'yyyy-MM-dd'))
  const byDay = new Map<string, ReportCalendarEntry[]>()
  for (const entry of entries) byDay.set(entry.shift.date, [...(byDay.get(entry.shift.date) ?? []), entry])
  const brandById = new Map(brands.map(b => [b.id, b.name]))
  const platformById = new Map(platforms.map(p => [p.id, p.name]))
  const entryLabel = (entry: ReportCalendarEntry) => {
    const shift = entry.shift
    return [shift.start_time.slice(0,5), brandById.get(shift.brand_id) ?? shift.title ?? 'Ca', platformById.get(shift.platform_id) ?? ''].filter(Boolean).join(' · ')
  }
  const renderEntry = (entry: ReportCalendarEntry, compact = false) => {
    const status = calendarStatus(entry)
    return <button type="button" key={entry.shift.id} data-testid={'report-calendar-shift-' + entry.shift.id}
      className="flex w-full min-w-0 items-start gap-2 rounded border bg-background px-2 py-1.5 text-left text-xs hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      onClick={() => onSelectEntry(entry)} title={entryLabel(entry) + ' · ' + statusLabels[status]}>
      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className={compact ? 'line-clamp-2 font-medium' : 'block truncate font-medium'}>{entryLabel(entry)}</span>
        <span className="block text-muted-foreground">{statusLabels[status]} · {entry.report?.metrics_confirmed === true ? 'Metrics confirmed' : 'Metrics unconfirmed'}</span>
      </span>
    </button>
  }
  return <Card data-testid="reports-calendar" className="overflow-hidden">
    <CardContent className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-semibold">{scale === 'month' ? format(selected, 'MM/yyyy') : scale === 'week' ? days[0] + ' → ' + days[days.length-1] : date}</p>
          <p className="text-xs text-muted-foreground">Ca chưa có báo cáo vẫn xuất hiện nếu thuộc phạm vi được cấp quyền. Trạng thái báo cáo và xác nhận số liệu được hiển thị riêng.</p></div>
        <div className="flex items-center gap-1" aria-label="Điều hướng lịch báo cáo">
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate('previous')} aria-label="Kỳ trước"><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate('today')}>Hôm nay</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate('next')} aria-label="Kỳ sau"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      {entries.length === 0 && <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />Không có ca/báo cáo được cấp quyền trong khoảng ngày và bộ lọc này.</div>}
      {scale === 'day'
        ? <div className="space-y-2" data-testid="reports-calendar-day">{(byDay.get(date) ?? []).map(entry => renderEntry(entry))}</div>
        : <div className="w-full overflow-x-auto" tabIndex={0} aria-label="Lịch báo cáo, cuộn ngang trên màn hình nhỏ">
          <div className="grid min-w-[700px] grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
            {['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'].map(day => <div className="bg-muted px-2 py-2 text-center text-xs font-semibold" key={day}>{day}</div>)}
            {days.map(day => {
              const items = byDay.get(day) ?? []
              const outside = scale === 'month' && day.slice(0, 7) !== date.slice(0,7)
              return <div key={day} className={'min-h-32 space-y-1.5 bg-card p-1.5 ' + (outside ? 'opacity-60' : '')} data-testid={'report-calendar-date-' + day}>
                <button type="button" className="flex w-full items-center justify-between text-left text-xs font-semibold hover:underline"
                  onClick={() => onSelectDay(day)} aria-label={'Xem ngày ' + day}>
                  <span>{day.slice(8)}</span><span className="text-muted-foreground">{items.length ? items.length + ' ca' : ''}</span>
                </button>
                {items.slice(0, 3).map(entry => renderEntry(entry, true))}
                {items.length > 3 && <Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-start px-1 text-xs" onClick={() => onSelectDay(day)}>+{items.length - 3} ca · Xem ngày</Button>}
              </div>
            })}
          </div>
        </div>}
    </CardContent>
  </Card>
}
