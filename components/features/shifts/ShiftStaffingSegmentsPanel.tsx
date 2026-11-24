'use client'

import * as React from 'react'
import { Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { TranslationKey } from '@/lib/i18n'
import type { OperationalRole, Shift, ShiftRegistration } from '@/lib/types/database.types'
import { computeShiftStaffingMetrics, OPERATIONAL_ROLES } from '@/lib/utils/staffingSemantics'

interface ShiftStaffingSegmentsPanelProps {
  shift: Shift
  registrations: ShiftRegistration[]
  language: 'vi' | 'en'
  t: (key: TranslationKey) => string
}

const ROLE_SHORT_LABEL: Record<OperationalRole, string> = {
  host: 'H',
  support: 'S',
  technical: 'T',
}

export function ShiftStaffingSegmentsPanel({
  shift,
  registrations,
  language,
  t,
}: ShiftStaffingSegmentsPanelProps) {
  const metrics = React.useMemo(
    () => computeShiftStaffingMetrics(shift, registrations),
    [shift, registrations],
  )
  const vi = language === 'vi'

  return (
    <div className="space-y-4 pt-2" data-testid="shift-staffing-segments-panel">
      <div
        className="rounded-lg border bg-slate-50/70 p-3 shadow-sm"
        data-testid="shift-staffing-metrics-summary"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {vi
              ? 'Thống kê định biên (Đỉnh · Tổng vị trí · Nhân sự · Giờ công)'
              : 'Staffing Breakdown (Peak · Total Positions · Unique People · Staff-Hours)'}
          </h4>
          {metrics.has_segments && (
            <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-800 text-[11px]">
              {metrics.segment_count} {vi ? 'khung giờ' : 'segments'}
            </Badge>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[11px] text-slate-500">
                <th className="py-1.5 pr-2 font-medium">{vi ? 'Vai trò' : 'Role'}</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  {vi ? 'Đỉnh đồng thời' : 'Peak'}
                </th>
                <th className="px-2 py-1.5 text-right font-medium">
                  {vi ? 'Tổng vị trí' : 'Positions'}
                </th>
                <th className="px-2 py-1.5 text-right font-medium">
                  {vi ? 'Người duy nhất' : 'Unique'}
                </th>
                <th className="px-2 py-1.5 text-right font-medium">
                  {vi ? 'Đã duyệt' : 'Approved'}
                </th>
                <th className="px-2 py-1.5 text-right font-medium">
                  {vi ? 'Chờ duyệt' : 'Pending'}
                </th>
                <th className="px-2 py-1.5 text-right font-medium">
                  {vi ? 'Còn thiếu' : 'Remaining'}
                </th>
                <th className="py-1.5 pl-2 text-right font-medium">
                  {vi ? 'Giờ yêu cầu' : 'Staff-Hours'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {OPERATIONAL_ROLES.map(role => {
                const row = metrics.roles[role]
                return (
                  <tr key={role} data-testid={`shift-metric-role-${role}`}>
                    <td className="py-1.5 pr-2 font-semibold text-slate-800">{t(role)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" data-testid={`shift-metric-${role}-peak`}>
                      {row.peak_concurrent_required}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium" data-testid={`shift-metric-${role}-positions`}>
                      {row.total_positions_required}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums" data-testid={`shift-metric-${role}-unique`}>
                      {row.unique_assigned_people}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700" data-testid={`shift-metric-${role}-approved`}>
                      {row.approved_assignments}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-amber-700" data-testid={`shift-metric-${role}-pending`}>
                      {row.pending_assignments}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                        row.remaining_vacancies > 0 ? 'text-rose-700' : 'text-slate-600'
                      }`}
                      data-testid={`shift-metric-${role}-remaining`}
                    >
                      {row.remaining_vacancies}
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums text-slate-700" data-testid={`shift-metric-${role}-hours`}>
                      {row.required_staff_hours}h
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold text-slate-900" data-testid="shift-metric-totals">
                <td className="py-1.5 pr-2">{vi ? 'Tổng ca' : 'Shift Total'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{metrics.totals.peak_concurrent_required}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{metrics.totals.total_positions_required}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{metrics.totals.unique_assigned_people}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{metrics.totals.approved_assignments}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{metrics.totals.pending_assignments}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${metrics.totals.remaining_vacancies > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                  {metrics.totals.remaining_vacancies}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{metrics.totals.required_staff_hours}h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {metrics.segments.length > 0 && (
        <div
          className="rounded-lg border bg-white p-3 shadow-sm space-y-2.5"
          data-testid="shift-staffing-segments-breakdown"
        >
          <div className="flex items-center justify-between border-b pb-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Layers className="h-3.5 w-3.5 text-indigo-600" />
              {vi ? 'Chi tiết từng khung giờ' : 'Per-Segment Staffing Slots'}
            </h4>
            <span className="text-[11px] text-slate-500">
              {vi ? 'Thiếu nhân sự tính theo từng khung' : 'Vacancies computed per segment'}
            </span>
          </div>

          <div className="space-y-2.5">
            {metrics.segments.map(seg => {
              const code = `K${String(seg.segment_index).padStart(2, '0')}`
              const totalRemaining = OPERATIONAL_ROLES.reduce(
                (sum, role) => sum + seg.roles[role].remaining,
                0,
              )
              const hasPlannedNames =
                seg.planned_host_names.length > 0
                || seg.planned_support_names.length > 0
                || seg.planned_technical_names.length > 0
              return (
                <div
                  key={seg.segment_id ?? `${code}-${seg.start_time}`}
                  className="rounded-md border border-slate-200 p-2.5 text-xs space-y-2"
                  data-testid={`shift-staffing-segment-${seg.segment_index}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
                        {code}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {seg.start_time} – {seg.end_time}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ({seg.duration_hours}h)
                      </span>
                    </div>
                    <Badge
                      variant={totalRemaining > 0 ? 'outline' : 'secondary'}
                      className={
                        totalRemaining > 0
                          ? 'border-rose-200 bg-rose-50 text-rose-800 text-[11px]'
                          : 'bg-emerald-50 text-emerald-800 text-[11px]'
                      }
                    >
                      {totalRemaining > 0
                        ? (vi ? `Thiếu ${totalRemaining} vị trí` : `Missing ${totalRemaining}`)
                        : (vi ? 'Đủ định biên' : 'Fully staffed')}
                    </Badge>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    {OPERATIONAL_ROLES.map(role => {
                      const counts = seg.roles[role]
                      return (
                        <div
                          key={role}
                          className="rounded border border-slate-100 bg-slate-50/70 px-2 py-1.5"
                          data-testid={`shift-segment-${seg.segment_index}-role-${role}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">
                              {t(role)} ({ROLE_SHORT_LABEL[role]})
                            </span>
                            <span className="tabular-nums text-[11px] font-bold text-slate-900">
                              {counts.approved}/{counts.required}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-600 tabular-nums">
                            <span>{vi ? 'YC' : 'Req'}: {counts.required}</span>
                            <span className="text-emerald-700">{vi ? 'Duyệt' : 'App'}: {counts.approved}</span>
                            {counts.pending > 0 && (
                              <span className="text-amber-700">{vi ? 'Chờ' : 'Pend'}: {counts.pending}</span>
                            )}
                            <span className={counts.remaining > 0 ? 'font-semibold text-rose-700' : 'text-slate-500'}>
                              {vi ? 'Thiếu' : 'Rem'}: {counts.remaining}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {hasPlannedNames && (
                    <div className="flex flex-wrap items-center gap-1 rounded bg-amber-50/70 px-2 py-1 text-[11px] text-amber-900">
                      <span className="font-semibold mr-1">
                        {vi ? 'Dự kiến (chỉ hiển thị):' : 'Planned (display-only):'}
                      </span>
                      {seg.planned_host_names.map((name, idx) => (
                        <Badge key={`h-${idx}`} variant="outline" className="border-amber-300 bg-white text-amber-900 text-[10px]">
                          Host: {name}
                        </Badge>
                      ))}
                      {seg.planned_support_names.map((name, idx) => (
                        <Badge key={`s-${idx}`} variant="outline" className="border-amber-300 bg-white text-amber-900 text-[10px]">
                          {vi ? 'Trợ' : 'Sup'}: {name}
                        </Badge>
                      ))}
                      {seg.planned_technical_names.map((name, idx) => (
                        <Badge key={`t-${idx}`} variant="outline" className="border-amber-300 bg-white text-amber-900 text-[10px]">
                          Tech: {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
