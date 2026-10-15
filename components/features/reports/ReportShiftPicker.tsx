'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { isStaffedRegistration, reportService, shiftRegistrationService, shiftService } from '@/lib/services/dataService'
import type { Report, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { loadReportTarget, type ReportTarget } from '@/lib/utils/reportTarget'

const PAGE_SIZE = 20

/** Browse the entire eligible *shift list* in bounded server pages.
 * Page totals include shifts with an existing report, not just unreported shifts.
 * A selected target is always verified by an exact authenticated lookup.
 */
export function ReportShiftPicker({
  open, onOpenChange, currentUser, onTarget, onInvalidateTarget,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUser: User
  onTarget: (target: ReportTarget) => void
  onInvalidateTarget: () => void
}) {
  const { t, language } = useTranslation()
  const [search, setSearch] = React.useState('')
  const deferredSearch = React.useDeferredValue(search)
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [reports, setReports] = React.useState<Report[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [total, setTotal] = React.useState(0)
  const [loadedIdentity, setLoadedIdentity] = React.useState('')
  const [loadedFilterKey, setLoadedFilterKey] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [selectingId, setSelectingId] = React.useState<string | null>(null)
  const requestVersion = React.useRef(0)
  const identity = currentUser.id + ':' + resolveSystemPermission(currentUser)
  const canReview = hasPermission(currentUser, 'reports.review')
  const canSubmit = hasPermission(currentUser, 'reports.submit')
  const filterKey = JSON.stringify({ page, search: deferredSearch, from, to })
  const invalidDates = Boolean(from && to && from > to)
  const invalidateSelection = () => {
    requestVersion.current++
    onInvalidateTarget()
    setSelectingId(null)
  }

  const loadPage = React.useCallback(async () => {
    if (!open || !canSubmit || (from && to && from > to)) return
    const version = ++requestVersion.current
    setLoading(true)
    setSelectingId(null)
    setError('')
    try {
      const filters = {
        statuses: ['preparing', 'live', 'paused', 'completed'],
        search: deferredSearch.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      }
      // Reports add direct assignments and own submissions without changing My Shifts filters.
      const result = canReview
        ? await shiftService.getPage({ page, pageSize: PAGE_SIZE, filters })
        : await shiftService.getRegistrationPage('mine', { page, pageSize: PAGE_SIZE, filters: { ...filters, reportCandidates: true } })
      const ids = result.items.map(shift => shift.id)
      const [existingReports, staffing] = await Promise.all([
        reportService.getForShifts(ids),
        shiftRegistrationService.getForShifts(ids),
      ])
      if (version !== requestVersion.current) return
      setShifts(result.items)
      setReports(existingReports)
      setRegistrations(staffing)
      setTotal(result.total)
      if (result.page !== page) setPage(result.page)
      setLoadedIdentity(identity)
      setLoadedFilterKey(filterKey)
    } catch (err) {
      if (version !== requestVersion.current) return
      setError(err instanceof Error ? err.message : 'LIST_READ_FAILED')
      setLoadedIdentity('')
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [canReview, canSubmit, deferredSearch, filterKey, from, identity, open, page, to])

  React.useEffect(() => {
    const versionRef = requestVersion
    const timer = setTimeout(() => { void loadPage() }, 0)
    return () => { clearTimeout(timer); versionRef.current++; onInvalidateTarget() }
  }, [loadPage, onInvalidateTarget])

  // A permission or account switch must not leak the previous user's list.
  const visible = open && loadedIdentity === identity && loadedFilterKey === filterKey &&
    search === deferredSearch && !invalidDates && !loading && !error
  const reportsByShift = new Map(reports.map(report => [report.shift_id, report]))
  const canSelect = (shift: Shift) =>
    canSubmit && (canReview ||
      [shift.host_id, shift.support_id, shift.technical_id].includes(currentUser.id) ||
      registrations.some(registration =>
        registration.shift_id === shift.id &&
        registration.user_id === currentUser.id &&
        isStaffedRegistration(registration)
      ) || reportsByShift.get(shift.id)?.submitted_by === currentUser.id)

  const choose = async (shift: Shift) => {
    if (selectingId || !visible || !canSelect(shift)) return
    const version = requestVersion.current
    setSelectingId(shift.id)
    try {
      const staffedShiftIds = new Set(
        registrations.filter(registration =>
          registration.user_id === currentUser.id && isStaffedRegistration(registration)
        ).map(registration => registration.shift_id),
      )
      const target = await loadReportTarget(shift.id, {
        getShift: id => shiftService.getById(id),
        getReport: id => reportService.getByShift(id),
      }, currentUser, staffedShiftIds)
      if (version !== requestVersion.current) return
      onTarget(target)
    } catch (err) {
      if (version !== requestVersion.current) return
      setError(err instanceof Error ? err.message : 'REPORT_TARGET_UNAVAILABLE')
    } finally {
      if (version === requestVersion.current) setSelectingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" data-testid="report-shift-picker">
        <DialogHeader>
          <DialogTitle>{t('chooseLiveOrCompletedShift')}</DialogTitle>
          <DialogDescription>
            {language === 'vi'
              ? 'Tìm ca theo tên, brand hoặc nền tảng. Duyệt tất cả các trang, kể cả ca cũ hơn 30 ca gần nhất.'
              : 'Search shifts by name, brand or platform. Browse every page, including older shifts.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={t('searchShifts')}
              data-testid="report-shift-search"
              value={search}
              onChange={event => { invalidateSelection(); setSearch(event.target.value); setPage(1) }}
              placeholder={t('searchShifts')}
              className="pl-9"
              maxLength={256}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium">{t('startDate')}
              <Input type="date" value={from} onChange={event => { invalidateSelection(); setFrom(event.target.value); setPage(1) }} className="mt-1" />
            </label>
            <label className="text-xs font-medium">{t('endDate')}
              <Input type="date" value={to} onChange={event => { invalidateSelection(); setTo(event.target.value); setPage(1) }} className="mt-1" />
            </label>
          </div>
          {from && to && from > to ? <p role="alert" className="text-xs text-destructive">{language === 'vi' ? 'Ngày bắt đầu phải trước ngày kết thúc.' : 'Start date must not exceed end date.'}</p> : null}
          {loading || !visible ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{error || t('loading')}</p>
          ) : shifts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{language === 'vi' ? 'Không tìm thấy ca phù hợp.' : 'No matching shifts.'}</p>
          ) : (
            <div className="divide-y rounded-md border" data-testid="report-shift-candidate-list">
              {shifts.map(shift => {
                const report = reportsByShift.get(shift.id)
                const allowed = canSelect(shift)
                return (
                  <div key={shift.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{shift.title || shift.id}</p>
                      <p className="text-xs text-muted-foreground">{shift.date} · {shift.start_time} · {t(shift.status)}</p>
                      {report && <p className="text-xs text-muted-foreground">{language === 'vi' ? 'Đã có báo cáo' : 'Report exists'} · {report.status ?? 'draft'}</p>}
                    </div>
                    <Button
                      type="button" size="sm" variant="outline"
                      disabled={!allowed || Boolean(selectingId)}
                      onClick={() => { void choose(shift) }}
                      data-testid="report-shift-choose"
                    >
                      {selectingId === shift.id ? t('loading') : report ? t('viewDetails') : t('createFinalReport')}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
          {visible && total > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {language === 'vi'
                  ? 'Tổng số tính cả ca đã có báo cáo hoặc chưa đủ quyền tạo, không phải số báo cáo còn thiếu.'
                  : 'Page totals include shifts with reports or without submit permission; they are not missing-report counts.'}
              </p>
              <HistoryPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={value => { invalidateSelection(); setPage(value) }} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
