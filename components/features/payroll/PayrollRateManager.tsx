'use client'

import * as React from 'react'
import {
  Plus,
  RefreshCw,
  AlertCircle,
  Calendar,
  ShieldCheck,
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
import { Textarea } from '@/components/ui/textarea'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils/currency'
import {
  workforceService,
  workforceErrorMessage,
  type RateCard,
  type WorkforceRole,
  type RateScope,
  type Pagination,
} from '@/lib/services/workforceService'

export function PayrollRateManager() {
  const { toast } = useToast()
  const [rates, setRates] = React.useState<RateCard[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [roleFilter, setRoleFilter] = React.useState<string>('all')
  const [scopeFilter, setScopeFilter] = React.useState<string>('all')
  const [staffIdFilter, setStaffIdFilter] = React.useState('')
  const [effectiveDateFilter, setEffectiveDateFilter] = React.useState('')
  const [pagination, setPagination] = React.useState<Pagination>({
    page: 1,
    page_size: 10,
    total_count: 0,
    total_pages: 0,
    has_next: false,
    has_previous: false,
  })

  // Register Rate Modal State
  const [isRegisterOpen, setIsRegisterOpen] = React.useState(false)
  const [regScope, setRegScope] = React.useState<RateScope>('role_default')
  const [regStaffId, setRegStaffId] = React.useState('')
  const [regRole, setRegRole] = React.useState<WorkforceRole>('host')
  const [regVndPerHour, setRegVndPerHour] = React.useState('')
  const [regOtMultiplier, setRegOtMultiplier] = React.useState('')
  const [regEffectiveFrom, setRegEffectiveFrom] = React.useState<string>('')
  const [regEffectiveThrough, setRegEffectiveThrough] = React.useState<string>('')
  const [regApprovalNote, setRegApprovalNote] = React.useState<string>('')
  const [regSubmitting, setRegSubmitting] = React.useState(false)
  const [regError, setRegError] = React.useState<string | null>(null)

  const readSequence = React.useRef(0)
  const loadRates = React.useCallback(async () => {
    const sequence = ++readSequence.current
    setRates([])
    setLoading(true)
    setLoadError(null)
    try {
      const res = await workforceService.listRates({
        page,
        pageSize,
        role: roleFilter === 'all' ? undefined : (roleFilter as WorkforceRole),
        scope: scopeFilter === 'all' ? undefined : (scopeFilter as RateScope),
        staffId: staffIdFilter.trim() || undefined,
        effectiveDate: effectiveDateFilter || undefined,
      })
      if (sequence !== readSequence.current) return
      setRates(res.rates)
      setPagination(res.pagination)
    } catch (err: unknown) {
      if (sequence !== readSequence.current) return
      setRates([])
      setLoadError(workforceErrorMessage(err))
      toast({
        title: 'Không thể tải danh sách khung lương',
        description: workforceErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      if (sequence === readSequence.current) setLoading(false)
    }
  }, [page, pageSize, roleFilter, scopeFilter, staffIdFilter, effectiveDateFilter, toast])

  React.useEffect(() => {
    const generation = readSequence
    const frame = requestAnimationFrame(() => {
      void loadRates()
    })
    return () => { cancelAnimationFrame(frame); generation.current++ }
  }, [loadRates])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(null)

    if (regScope === 'staff_specific' && !regStaffId.trim()) {
      setRegError('Vui lòng nhập Mã nhân sự (Staff ID) cho khung lương cụ thể.')
      return
    }

    if (!regEffectiveFrom) {
      setRegError('Vui lòng chọn ngày bắt đầu hiệu lực.')
      return
    }

    if (regEffectiveThrough && regEffectiveThrough < regEffectiveFrom) {
      setRegError('Ngày kết thúc hiệu lực không được trước ngày bắt đầu.')
      return
    }

    if (!regVndPerHour || !Number.isSafeInteger(Number(regVndPerHour)) || Number(regVndPerHour) <= 0) {
      setRegError('Mức lương mỗi giờ phải là số nguyên dương.')
      return
    }

    if (!regApprovalNote.trim() || regApprovalNote.trim().length < 8) {
      setRegError('Ghi chú phê duyệt phải có ít nhất 8 ký tự.')
      return
    }

    const otBasisPoints = Math.round(Number(regOtMultiplier) * 10000)
    if (!/^\d(?:\.\d{1,4})?$/.test(regOtMultiplier) || !Number.isSafeInteger(otBasisPoints) || otBasisPoints < 10000 || otBasisPoints > 50000) {
      setRegError('Hệ số tăng ca phải nằm trong khoảng từ 1.0x (10000 bps) đến 5.0x (50000 bps).')
      return
    }

    try {
      setRegSubmitting(true)
      await workforceService.registerRate({
        staffId: regScope === 'staff_specific' ? regStaffId.trim() : null,
        operationalRole: regRole,
        effectiveFrom: regEffectiveFrom,
        effectiveThrough: regEffectiveThrough ? regEffectiveThrough : null,
        vndPerHour: Number(regVndPerHour),
        overtimeMultiplierBasisPoints: otBasisPoints,
        approvalNote: regApprovalNote.trim(),
      })

      toast({
        title: 'Phê duyệt khung lương thành công',
        description: `Khung lương vai trò ${regRole.toUpperCase()} đã được đăng ký và có hiệu lực từ ${regEffectiveFrom}.`,
      })

      setIsRegisterOpen(false)
      setRegStaffId('')
      setRegApprovalNote('')
      loadRates()
    } catch (err: unknown) {
      setRegError(
        workforceErrorMessage(err)
      )
    } finally {
      setRegSubmitting(false)
    }
  }

  const roleLabels: Record<WorkforceRole, string> = {
    host: 'Host Livestream',
    support: 'Trợ lý phiên Live',
    technical: 'Kỹ thuật viên',
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-bold text-slate-900">
            Khung lương & Đơn giá được phê duyệt
          </CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">
            Quản lý đơn giá theo giờ và hệ số tăng ca được duyệt cho từng vai trò hoặc nhân sự cụ thể.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadRates()}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button
            size="sm"
            onClick={() => setIsRegisterOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Đăng ký khung lương
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Filters */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Vai trò
            </label>
            <Select value={roleFilter} onValueChange={(val) => { setRoleFilter(val); setPage(1); }}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue placeholder="Tất cả vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả vai trò</SelectItem>
                <SelectItem value="host">Host Livestream</SelectItem>
                <SelectItem value="support">Trợ lý phiên Live</SelectItem>
                <SelectItem value="technical">Kỹ thuật viên</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Phạm vi áp dụng
            </label>
            <Select value={scopeFilter} onValueChange={(val) => { setScopeFilter(val); setPage(1); }}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue placeholder="Tất cả phạm vi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả phạm vi</SelectItem>
                <SelectItem value="role_default">Mặc định vai trò</SelectItem>
                <SelectItem value="staff_specific">Nhân sự cụ thể</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="payrollratemanager-field-1" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Mã nhân sự (Staff ID)
            </label>
            <Input id="payrollratemanager-field-1"
              type="text"
              placeholder="Lọc theo staff_id..."
              value={staffIdFilter}
              onChange={(e) => { setStaffIdFilter(e.target.value); setPage(1); }}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div>
            <label htmlFor="payrollratemanager-field-2" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Ngày kiểm tra hiệu lực
            </label>
            <Input id="payrollratemanager-field-2"
              type="date"
              value={effectiveDateFilter}
              onChange={(e) => { setEffectiveDateFilter(e.target.value); setPage(1); }}
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>

        {/* Rates Table */}
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Phạm vi & Nhân sự</th>
                <th className="px-3 py-2.5">Vai trò vận hành</th>
                <th className="px-3 py-2.5">Đơn giá / Giờ</th>
                <th className="px-3 py-2.5">Hệ số OT</th>
                <th className="px-3 py-2.5">Khoảng hiệu lực</th>
                <th className="px-3 py-2.5">Phê duyệt & Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadError ? (
                <tr><td colSpan={6} className="p-4"><p role="alert">{loadError}</p></td></tr>
              ) : loading && rates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-blue-600" />
                    <span className="mt-2 block">Đang tải khung lương...</span>
                  </td>
                </tr>
              ) : rates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Không tìm thấy khung lương nào phù hợp.
                  </td>
                </tr>
              ) : (
                rates.map((rate) => {
                  const otMultiplier = (rate.overtime_multiplier_basis_points / 10000).toFixed(2)
                  return (
                    <tr key={rate.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {rate.scope === 'role_default' ? (
                            <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 text-[10px]">
                              Mặc định vai trò
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                              Nhân sự cụ thể
                            </Badge>
                          )}
                        </div>
                        {rate.staff_id && (
                          <div className="mt-1 font-mono text-[11px] font-semibold text-slate-800">
                            {rate.staff_id}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {roleLabels[rate.operational_role]}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {formatCurrency(rate.vnd_per_hour)} / giờ
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-indigo-700 border border-indigo-200">
                          {otMultiplier}x
                        </span>
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({rate.overtime_multiplier_basis_points} bps)
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{rate.effective_from} → {rate.effective_through || 'Vô thời hạn'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 max-w-[280px]">
                        <div className="flex items-center gap-1 text-[11px] text-slate-700 font-medium">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Duyệt bởi {rate.approved_by}</span>
                          <span className="text-slate-400">({new Date(rate.approved_at).toLocaleDateString('vi-VN')})</span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500" title={rate.approval_note}>
                          &ldquo;{rate.approval_note}&rdquo;
                        </p>
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

      {/* Register Rate Modal */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Đăng ký & Phê duyệt khung lương mới
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Thiết lập đơn giá chuẩn và hệ số tăng ca. Quản trị viên không thể tự phê duyệt mức lương cho chính mình.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRegister} className="space-y-4 pt-2">
            {regError && (
              <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{regError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Phạm vi áp dụng</label>
                <Select value={regScope} onValueChange={(val: RateScope) => setRegScope(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role_default">Mặc định theo vai trò</SelectItem>
                    <SelectItem value="staff_specific">Nhân sự cụ thể</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Vai trò vận hành</label>
                <Select value={regRole} onValueChange={(val: WorkforceRole) => setRegRole(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="host">Host Livestream</SelectItem>
                    <SelectItem value="support">Trợ lý phiên Live</SelectItem>
                    <SelectItem value="technical">Kỹ thuật viên</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {regScope === 'staff_specific' && (
              <div className="space-y-1.5">
                <label htmlFor="payrollratemanager-field-3" className="text-xs font-semibold text-slate-700">
                  Mã nhân sự (Staff ID) <span className="text-rose-500">*</span>
                </label>
                <Input id="payrollratemanager-field-3"
                  type="text"
                  required
                  placeholder="Nhập ID nhân sự được áp dụng đơn giá riêng..."
                  value={regStaffId}
                  onChange={(e) => setRegStaffId(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="payrollratemanager-field-4" className="text-xs font-semibold text-slate-700">
                  Đơn giá cơ bản (VND / giờ) <span className="text-rose-500">*</span>
                </label>
                <Input id="payrollratemanager-field-4"
                  type="number"
                  min="0"
                  max="100000000"
                  step="1"
                  required
                  aria-label="Mức lương VND mỗi giờ đã duyệt"
                  value={regVndPerHour}
                  onChange={(e) => setRegVndPerHour(e.target.value)}
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-slate-500">
                  {regVndPerHour ? formatCurrency(Number(regVndPerHour)) : 'Nhập mức lương đã được phê duyệt'}
                </span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="payrollratemanager-field-5" className="text-xs font-semibold text-slate-700">
                  Hệ số tăng ca (OT Multiplier) <span className="text-rose-500">*</span>
                </label>
                <Input id="payrollratemanager-field-5"
                  type="number"
                  min="1"
                  max="5"
                  step="0.0001"
                  required
                  aria-label="Hệ số tăng ca đã duyệt"
                  value={regOtMultiplier}
                  onChange={(e) => setRegOtMultiplier(e.target.value)}
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-slate-500 font-mono">
                  {Number(regOtMultiplier) * 10000} bps ({regOtMultiplier}x)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="payrollratemanager-field-6" className="text-xs font-semibold text-slate-700">
                  Hiệu lực từ ngày (Effective From) <span className="text-rose-500">*</span>
                </label>
                <Input id="payrollratemanager-field-6"
                  type="date"
                  required
                  value={regEffectiveFrom}
                  onChange={(e) => setRegEffectiveFrom(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="payrollratemanager-field-7" className="text-xs font-semibold text-slate-700">
                  Hiệu lực đến ngày (Tùy chọn)
                </label>
                <Input id="payrollratemanager-field-7"
                  type="date"
                  value={regEffectiveThrough}
                  onChange={(e) => setRegEffectiveThrough(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="payrollratemanager-field-8" className="text-xs font-semibold text-slate-700">
                Ghi chú phê duyệt & Căn cứ hợp đồng <span className="text-rose-500">*</span>
              </label>
              <Textarea id="payrollratemanager-field-8"
                required
                rows={2}
                placeholder="Ví dụ: Đơn giá phê duyệt theo hợp đồng nguyên tắc ký ngày 01/09..."
                value={regApprovalNote}
                onChange={(e) => setRegApprovalNote(e.target.value)}
                className="text-xs"
              />
              <span className="text-[10px] text-slate-400">
                Tối thiểu 8 ký tự, tối đa 1000 ký tự.
              </span>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRegisterOpen(false)}
                disabled={regSubmitting}
                className="text-xs"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={regSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
              >
                {regSubmitting ? 'Đang lưu...' : 'Phê duyệt khung lương'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
