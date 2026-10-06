'use client'

import { useState } from 'react'
import { Eye, Download, Archive, Trash2 } from 'lucide-react'
import type { Brand, Campaign, Platform, Report, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShiftTimeRange, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { reportMetricValue } from '@/lib/utils/analytics'
import { isStaffedRegistration } from '@/lib/services/dataService'
import { Badge } from '@/components/ui/badge'
import { ActionBar } from '@/components/ui/action-bar'
import { buildReportActions } from '@/lib/ui/action-priority'
import { deriveReportAttention } from '@/lib/ui/operational-attention'
import { AttentionItem } from '@/components/ui/operational-status'
import { HistoryPagination } from '@/components/ui/history-pagination'

export function ReportsView({ reports, shifts, brands, platforms, campaigns, users, registrations, currentUser, onView, onExport, onRemove }: {
  reports: Report[]; shifts: Shift[]; brands: Brand[]; platforms: Platform[]; campaigns: Campaign[]; users: User[]; registrations: ShiftRegistration[]
  currentUser: User | null; onView: (report: Report) => void; onExport?: (report: Report) => void; onRemove: (report: Report) => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const safePage = Math.min(page, Math.max(1, Math.ceil(reports.length / pageSize)))
  const visible = reports.slice((safePage - 1) * pageSize, safePage * pageSize)
  const name = (items: Array<{ id: string; name: string }>, id?: string) => items.find(item => item.id === id)?.name ?? '—'
  return <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">{t('reports')}</h2><span className="text-xs text-slate-500">{reports.length} · {reports.filter(report => report.status === 'confirmed' && report.metrics_confirmed === true).length} {t('confirmed')}</span></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs">
      <thead className="border-b bg-slate-50 text-slate-500"><tr>{(['finalReport', 'brand', 'platform', 'staffing', 'revenue', 'orders', 'ctr', 'reportStatus', 'actions'] as const).map(key => <th className="px-3 py-2.5 font-medium" key={key}>{t(key)}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{visible.map(report => {
        const shift = shifts.find(item => item.id === report.shift_id)
        const duration = shift && resolveShiftDateTime(shift.date, shift.start_time.slice(0,5), shift.end_time.slice(0,5), shift.timezone)
        const revenue = reportMetricValue(report, 'revenue')
        const orders = reportMetricValue(report, 'orders')
        const ctr = reportMetricValue(report, 'ctr')
        const staffIds = new Set([...registrations.filter(item => item.shift_id === report.shift_id && isStaffedRegistration(item)).map(item => item.user_id), ...[shift?.host_id, shift?.support_id, shift?.technical_id].filter((id): id is string => Boolean(id))])
        const status = report.status ?? (report.metrics_confirmed ? 'confirmed' : 'draft')
        const canRemove = Boolean(currentUser && (hasPermission(currentUser, 'reports.review') || report.submitted_by === currentUser.id))
        const canArchive = Boolean(currentUser && hasPermission(currentUser, 'audit.restore'))
        return <tr key={report.id} className="align-top hover:bg-slate-50">
          <td className="px-3 py-3"><button className="text-left font-semibold text-blue-700 hover:underline" onClick={() => onView(report)}>{shift?.title ?? report.id}</button><div className="mt-1 text-slate-500">{shift ? shift.date + ' · ' + formatShiftTimeRange(shift) : '—'}</div><div className="mt-1 text-slate-400">{shift?.studio ?? '—'} · {duration?.valid ? duration.durationMinutes + ' ' + t('minuteShort') : '—'}</div><div className="mt-1 text-slate-400">{name(campaigns, shift?.campaign_id)}</div></td>
          <td className="px-3 py-3">{name(brands, shift?.brand_id)}</td><td className="px-3 py-3">{name(platforms, shift?.platform_id)}</td>
          <td className="max-w-40 px-3 py-3">{[...staffIds].map(id => users.find(user => user.id === id)?.full_name ?? '—').join(', ') || '—'}</td>
          <td className="px-3 py-3 font-semibold">{revenue === null ? '—' : formatCurrency(revenue)}</td><td className="px-3 py-3">{orders === null ? '—' : orders.toLocaleString()}</td><td className="px-3 py-3">{ctr === null ? '—' : ctr.toFixed(2) + '%'}</td>
          <td className="px-3 py-3"><Badge variant="secondary" className={report.metrics_confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>{status === 'in_review' ? t('inReview') : t(status)}</Badge>{deriveReportAttention(report.id,status,shift?.date).map(item=><AttentionItem key={item.key} item={item} />)}<p className="mt-1 text-slate-400">{report.updated_at ? new Date(report.updated_at).toLocaleString() : '—'}</p></td>
          <td className="px-3 py-3"><ActionBar actions={buildReportActions({status,canDelete:report.metrics_confirmed ? canArchive : canRemove,canExport:Boolean(onExport)}, {onView:()=>onView(report),onExport:onExport ? ()=>onExport(report) : undefined,onDelete:()=>onRemove(report)}, {view:t('viewDetails'),export:t('exportExcel'),archive:t('archiveReport'),delete:t('delete')}, {view:<Eye className="h-4 w-4" />,export:<Download className="h-4 w-4" />,archive:<Archive className="h-4 w-4" />,delete:<Trash2 className="h-4 w-4" />})} /></td>
        </tr>
      })}</tbody>
    </table></div>
    {!reports.length && <p className="p-10 text-center text-sm text-slate-500">{t('noReports')}</p>}
    <HistoryPagination page={safePage} pageSize={pageSize} total={reports.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} />
  </section>
}
