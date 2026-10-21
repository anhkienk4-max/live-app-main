'use client'

import * as React from 'react'
import {
  Calendar,
  Plus,
  Download,
  Lock,
  RefreshCw,
  AlertCircle,
  } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { useToast } from '@/components/ui/toast'
import {
  workforceService,
  workforceErrorMessage,
  type PayrollPeriod,
  type PayrollPeriodStatus,
  type Pagination,
} from '@/lib/services/workforceService'

interface PayrollPeriodManagerProps {
  selectedPeriodId: string | null
  onSelectPeriod: (period: PayrollPeriod) => void
}

export function PayrollPeriodManager({
  selectedPeriodId,
  onSelectPeriod,
}: PayrollPeriodManagerProps) {
  const { toast } = useToast()
  const [periods, setPeriods] = React.useState<PayrollPeriod[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [pagination, setPagination] = React.useState<Pagination>({
    page: 1,
    page_size: 20,
    total_count: 0,
    total_pages: 0,
    has_next: false,
    has_previous: false,
  })

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [createStart, setCreateStart] = React.useState('')
  const [createEnd, setCreateEnd] = React.useState('')
  const [createSubmitting, setCreateSubmitting] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  const readSequence = React.useRef(0)
  const loadPeriods = React.useCallback(async () => {
    const sequence = ++readSequence.current
    setPeriods([])
    setLoading(true)
    setLoadError(null)
    try {
      const res = await workforceService.listPeriods({
        page,
        pageSize,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: statusFilter === 'all' ? undefined : (statusFilter as PayrollPeriodStatus),
      })
      if (sequence !== readSequence.current) return
      setPeriods(res.periods)
      setPagination(res.pagination)

      // Auto-select first period if none selected
      if (!selectedPeriodId && res.periods.length > 0) {
        onSelectPeriod(res.periods[0])
      }
    } catch (err: unknown) {
      if (sequence !== readSequence.current) return
      setPeriods([])
      setLoadError(workforceErrorMessage(err))
      toast({
        title: 'Không thể tải danh sách chu kỳ lương',
        description: workforceErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      if (sequence === readSequence.current) setLoading(false)
    }
  }, [page, pageSize, statusFilter, dateFrom, dateTo, selectedPeriodId, onSelectPeriod, toast])

  React.useEffect(() => {
    const generation = readSequence
    const frame = requestAnimationFrame(() => {
      void loadPeriods()
    })
    return () => { cancelAnimationFrame(frame); generation.current++ }
  }, [loadPeriods])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!createStart || !createEnd) {
      setCreateError('Vui lòng chọn ngày bắt đầu và kết thúc chu kỳ.')
      return
    }

    if (createStart > createEnd) {
      setCreateError('Ngày bắt đầu không được lớn hơn ngày kết thúc.')
      return
    }

    try {
      setCreateSubmitting(true)
      const res = await workforceService.createPeriod({
        periodStart: createStart,
        periodEnd: createEnd,
      })

      toast({
        title: 'Tạo chu kỳ lương thành công',
        description: `Chu kỳ ${res.period.period_start} → ${res.period.period_end} đã được tạo dưới dạng bản nháp.`,
      })

      setIsCreateOpen(false)
      setCreateStart('')
      setCreateEnd('')
      onSelectPeriod(res.period)
      loadPeriods()
    } catch (err: unknown) {
      setCreateError(
        workforceErrorMessage(err)
      )
    } finally {
      setCreateSubmitting(false)
    }
  }

  const statusBadges: Record<PayrollPeriodStatus, { label: string; className: string }> = {
    draft: { label: 'Bản nháp', className: 'bg-slate-100 text-slate-700 border-slate-300' },
    reviewed: { label: 'Đã rà soát', className: 'bg-amber-50 text-amber-800 border-amber-300' },
    confirmed: { label: 'Đã xác nhận', className: 'bg-indigo-50 text-indigo-800 border-indigo-300' },
    payroll_ready: { label: 'Sẵn sàng chi trả', className: 'bg-purple-50 text-purple-800 border-purple-300' },
    locked: { label: 'Đã khóa sổ', className: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-bold text-slate-900">
            Quản lý chu kỳ quyết toán lương
          </CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">
            Khởi tạo, theo dõi tiến độ phê duyệt và chọn chu kỳ để đối soát chi tiết.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadPeriods()}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Tạo chu kỳ mới
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Filters */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Trạng thái
            </label>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="draft">Bản nháp (Draft)</SelectItem>
                <SelectItem value="reviewed">Đã rà soát (Reviewed)</SelectItem>
                <SelectItem value="confirmed">Đã xác nhận (Confirmed)</SelectItem>
                <SelectItem value="payroll_ready">Sẵn sàng (Ready)</SelectItem>
                <SelectItem value="locked">Đã khóa sổ (Locked)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="payrollperiodmanager-field-1" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Từ ngày
            </label>
            <Input id="payrollperiodmanager-field-1"
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div>
            <label htmlFor="payrollperiodmanager-field-2" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Đến ngày
            </label>
            <Input id="payrollperiodmanager-field-2"
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div className="flex items-end">
            {(statusFilter !== 'all' || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('all')
                  setDateFrom('')
                  setDateTo('')
                  setPage(1)
                }}
                className="h-8 text-xs text-slate-500 hover:text-slate-800"
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div role="region" aria-label="Bảng dữ liệu, cuộn ngang / Scroll horizontally" tabIndex={0} className="max-w-full overflow-x-auto rounded-md border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Thời gian chu kỳ</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5">Rev</th>
                <th className="px-3 py-2.5">Người khởi tạo</th>
                <th className="px-3 py-2.5">Tiến trình xét duyệt</th>
                <th className="px-3 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadError ? (
                <tr><td colSpan={6} className="p-4"><p role="alert">{loadError}</p></td></tr>
              ) : loading && periods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-blue-600" />
                    <span className="mt-2 block">Đang tải danh sách chu kỳ...</span>
                  </td>
                </tr>
              ) : periods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Không có chu kỳ lương nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                periods.map((item) => {
                  const isSelected = item.id === selectedPeriodId
                  const badge = statusBadges[item.status]
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/70 font-medium' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{item.period_start} → {item.period_end}</span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]">
                          {item.id}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={`text-[11px] ${badge.className}`}>
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">
                        #{item.revision}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {item.created_by || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">
                        {item.status === 'locked' ? (
                          <span className="flex items-center text-emerald-700 font-medium">
                            <Lock className="h-3 w-3 mr-1" />
                            Đã khóa bởi {item.locked_by || 'Admin'}
                          </span>
                        ) : item.status === 'payroll_ready' ? (
                          <span className="text-purple-700 font-medium">
                            Xác nhận bởi {item.confirmed_by || 'Chưa xác minh'}
                          </span>
                        ) : item.status === 'confirmed' ? (
                          <span className="text-indigo-700 font-medium">
                            Rà soát bởi {item.reviewed_by || 'Chưa xác minh'}
                          </span>
                        ) : item.status === 'reviewed' ? (
                          <span className="text-amber-700 font-medium">
                            Rà soát sơ bộ
                          </span>
                        ) : (
                          <span className="text-slate-400">Đang soạn thảo</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right space-x-1.5">
                        <Button
                          size="sm"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => onSelectPeriod(item)}
                          className={`h-7 text-xs ${
                            isSelected ? 'bg-blue-600 text-white' : ''
                          }`}
                        >
                          {isSelected ? 'Đang chọn' : 'Mở không gian'}
                        </Button>
                        {item.status === 'locked' && (
                          <Button
                            onClick={() => void workforceService.downloadCsv(item.id).catch(err => toast({ title: 'Không thể tải CSV', description: workforceErrorMessage(err), variant: 'destructive' }))}
                            className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            title="Tải bảng lương CSV"
                          >
                            <Download className="h-3 w-3 mr-1 text-slate-500" />
                            CSV
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.total_count > 0 && (
          <HistoryPagination
            page={page}
            pageSize={pageSize}
            total={pagination.total_count}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
          />
        )}
      </CardContent>

      {/* Create Period Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Khởi tạo chu kỳ quyết toán lương mới
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Tạo chu kỳ mới để tập hợp các ca làm việc đã hoàn thành và chấm công thực tế.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            {createError && (
              <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="payrollperiodmanager-field-3" className="text-xs font-semibold text-slate-700">
                Ngày bắt đầu chu kỳ (Period Start)
              </label>
              <Input id="payrollperiodmanager-field-3"
                type="date"
                required
                value={createStart}
                onChange={(e) => setCreateStart(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="payrollperiodmanager-field-4" className="text-xs font-semibold text-slate-700">
                Ngày kết thúc chu kỳ (Period End)
              </label>
              <Input id="payrollperiodmanager-field-4"
                type="date"
                required
                value={createEnd}
                onChange={(e) => setCreateEnd(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="rounded-md bg-slate-50 p-2.5 text-[11px] text-slate-500 border border-slate-200">
              Chu kỳ sẽ được tạo ở trạng thái <strong>Bản nháp (Draft)</strong>. Sau khi nạp các phân đoạn ca làm việc, hai cấp kiểm soát độc lập sẽ thực hiện rà soát và xác nhận.
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={createSubmitting}
                className="text-xs"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
              >
                {createSubmitting ? 'Đang tạo...' : 'Tạo chu kỳ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
