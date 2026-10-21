'use client'

import * as React from 'react'
import {
  Clock,
  Banknote,
  DollarSign,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  Lock,
  UserCheck,
  FileCheck,
  Calendar,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/currency'
import type { PayrollPeriod, PayrollLine } from '@/lib/services/workforceService'

interface PayrollOverviewProps {
  period: PayrollPeriod | null
  lines: PayrollLine[]
  loading?: boolean
}

export function PayrollOverview({ period, lines, loading = false }: PayrollOverviewProps) {
  const activeLines = React.useMemo(() => lines.filter(l => !l.voided_at), [lines])
  const voidedLines = React.useMemo(() => lines.filter(l => Boolean(l.voided_at)), [lines])

  const totals = React.useMemo(() => {
    let totalMinutes = 0
    let totalGross = 0
    let totalAdjustment = 0
    let totalNet = 0

    for (const line of activeLines) {
      totalMinutes += line.payable_minutes
      totalGross += line.gross_vnd
      totalAdjustment += line.adjustment_vnd
      totalNet += line.net_vnd
    }

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return {
      totalMinutes,
      hours,
      minutes,
      totalGross,
      totalAdjustment,
      totalNet,
    }
  }, [activeLines])

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse border-slate-200 bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-6 w-6 rounded-full bg-slate-200" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-40 rounded bg-slate-200" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!period) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Calendar className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-800">Chưa chọn chu kỳ lương</h3>
        <p className="mt-1 text-sm text-slate-500">
          Vui lòng chọn một chu kỳ lương từ danh sách bên dưới hoặc tạo chu kỳ mới để quản lý.
        </p>
      </Card>
    )
  }

  const statusConfig: Record<
    PayrollPeriod['status'],
    { label: string; badgeClass: string; icon: React.ReactNode }
  > = {
    draft: {
      label: 'Bản nháp (Draft)',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      icon: <FileCheck className="h-3.5 w-3.5 mr-1 text-slate-600" />,
    },
    reviewed: {
      label: 'Đã rà soát (Reviewed)',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      icon: <UserCheck className="h-3.5 w-3.5 mr-1 text-amber-600" />,
    },
    confirmed: {
      label: 'Đã xác nhận (Confirmed)',
      badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300',
      icon: <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-indigo-600" />,
    },
    payroll_ready: {
      label: 'Sẵn sàng thanh toán (Ready)',
      badgeClass: 'bg-purple-50 text-purple-800 border-purple-300',
      icon: <DollarSign className="h-3.5 w-3.5 mr-1 text-purple-600" />,
    },
    locked: {
      label: 'Đã khóa sổ (Locked)',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      icon: <Lock className="h-3.5 w-3.5 mr-1 text-emerald-600" />,
    },
  }

  const currentStatus = statusConfig[period.status]

  return (
    <div className="space-y-4">
      {/* Active Period Banner */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-semibold">
            <Banknote className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="w-full text-base font-bold text-slate-900 sm:w-auto">
                Chu kỳ: {period.period_start} → {period.period_end}
              </h2>
              <Badge variant="outline" className={currentStatus.badgeClass}>
                <span className="flex items-center">
                  {currentStatus.icon}
                  {currentStatus.label}
                </span>
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Rev #{period.revision}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 [overflow-wrap:anywhere]">
              Mã chu kỳ: <span className="font-mono text-slate-700">{period.id}</span>
              {period.created_by && (
                <span className="ml-2">
                  • Người tạo: <span className="font-medium text-slate-700">{period.created_by}</span>
                </span>
              )}
              {period.reviewed_by && (
                <span className="ml-2">
                  • Người rà soát: <span className="font-medium text-slate-700">{period.reviewed_by}</span>
                </span>
              )}
              {period.confirmed_by && (
                <span className="ml-2">
                  • Người xác nhận: <span className="font-medium text-slate-700">{period.confirmed_by}</span>
                </span>
              )}
              {period.locked_by && (
                <span className="ml-2">
                  • Khóa bởi: <span className="font-medium text-slate-700">{period.locked_by}</span> (
                  {new Date(period.locked_at || '').toLocaleDateString('vi-VN')})
                </span>
              )}
            </p>
          </div>
        </div>

        {period.status === 'locked' && (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200">
            <Lock className="h-4 w-4" />
            <span>Sổ lương đã khóa — Không thể chỉnh sửa</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Payable Time */}
        <Card className="border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Thời lượng tính lương
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {totals.hours}h {totals.minutes}p
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {activeLines.length} phân đoạn ca đã đối soát ({totals.totalMinutes.toLocaleString()} phút)
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Gross VND */}
        <Card className="border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tổng lương gộp
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {formatCurrency(totals.totalGross)}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Đơn giá theo giờ + hệ số tăng ca được duyệt
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Adjustments VND */}
        <Card className="border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Điều chỉnh có lý do
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold tracking-tight ${
                totals.totalAdjustment < 0
                  ? 'text-rose-600'
                  : totals.totalAdjustment > 0
                  ? 'text-emerald-600'
                  : 'text-slate-900'
              }`}
            >
              {totals.totalAdjustment > 0 ? '+' : ''}
              {formatCurrency(totals.totalAdjustment)}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Kèm lý do giải trình & phê duyệt độc lập
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Net VND */}
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50/60 to-white shadow-sm transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Tổng thực lĩnh (Net)
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white">
              <Banknote className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black tracking-tight text-blue-900">
              {formatCurrency(totals.totalNet)}
            </div>
            <p className="mt-1 text-xs text-blue-700/80 font-medium">
              Lương gộp + Điều chỉnh sau thẩm định
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warnings & Notices */}
      {voidedLines.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Có <strong>{voidedLines.length}</strong> dòng lương đã bị vô hiệu hóa (terminal void) trong chu kỳ này. Các dòng này được lưu vết kiểm toán đầy đủ nhưng không được tính vào tổng thanh toán.
          </span>
        </div>
      )}

      {activeLines.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-800">
          <Info className="h-4 w-4 shrink-0 text-blue-600" />
          <span>
            Chu kỳ hiện chưa có phân đoạn làm việc nào. Chọn <strong>&ldquo;Chuẩn bị dòng lương&rdquo;</strong> trong không gian nháp bên dưới để thêm các ca đã được chấm công và phê duyệt.
          </span>
        </div>
      )}
    </div>
  )
}
