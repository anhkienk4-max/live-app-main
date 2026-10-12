'use client'

import * as React from 'react'
import {
  History,
  ShieldCheck,
  User,
  ArrowRight,
  FileEdit,
  Trash2,
  CheckCircle2,
  Clock,
  Key,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/currency'
import type { PayrollAudit } from '@/lib/services/workforceService'

interface PayrollAuditTimelineProps {
  audit: PayrollAudit[]
}

export function PayrollAuditTimeline({ audit }: PayrollAuditTimelineProps) {
  const sortedAudit = React.useMemo(() => {
    return [...audit].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [audit])

  const actionConfig: Record<
    string,
    { label: string; badgeClass: string; icon: React.ReactNode }
  > = {
    transition: {
      label: 'Chuyển trạng thái chu kỳ',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: <ArrowRight className="h-3.5 w-3.5 mr-1" />,
    },
    correct_line: {
      label: 'Điều chỉnh dòng lương',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: <FileEdit className="h-3.5 w-3.5 mr-1" />,
    },
    void_line: {
      label: 'Vô hiệu hóa dòng lương',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: <Trash2 className="h-3.5 w-3.5 mr-1" />,
    },
    create_period: {
      label: 'Khởi tạo chu kỳ',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      icon: <CheckCircle2 className="h-3.5 w-3.5 mr-1" />,
    },
    prepare_line: {
      label: 'Thêm dòng lương',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <CheckCircle2 className="h-3.5 w-3.5 mr-1" />,
    },
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <History className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Nhật ký kiểm toán & Lịch sử phê duyệt
            </CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              Ghi nhận toàn bộ thao tác, tài khoản thực hiện, lý do và giá trị trước/sau bất biến.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {sortedAudit.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Chưa có lịch sử kiểm toán nào được ghi nhận cho chu kỳ này.
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:bottom-0 before:left-2 before:top-2 before:w-0.5 before:bg-slate-200">
            {sortedAudit.map((item) => {
              const config = actionConfig[item.action] || {
                label: item.action,
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
                icon: <ShieldCheck className="h-3.5 w-3.5 mr-1" />,
              }

              const prev = item.previous_values as Record<string, unknown> | null
              const updated = item.updated_values as Record<string, unknown> | null

              return (
                <div key={item.id} className="relative group">
                  {/* Dot */}
                  <div className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 shadow-sm" />

                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2 text-xs">
                    {/* Header line */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[11px] ${config.badgeClass}`}>
                          <span className="flex items-center">
                            {config.icon}
                            {config.label}
                          </span>
                        </Badge>

                        {item.from_status && item.to_status && (
                          <span className="text-[11px] font-semibold text-slate-700">
                            {item.from_status.toUpperCase()} → {item.to_status.toUpperCase()}
                          </span>
                        )}

                        {item.line_id && (
                          <span className="font-mono text-[10px] text-slate-500">
                            Dòng: {item.line_id} (v{item.line_version})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{new Date(item.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>

                    {/* Actor & Reason */}
                    <div className="flex items-start gap-2 pt-1 text-slate-700">
                      <User className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                      <div>
                        <span className="font-semibold text-slate-900">{item.actor_id}</span>
                        <p className="mt-0.5 text-slate-600 italic">&ldquo;{item.reason}&rdquo;</p>
                      </div>
                    </div>

                    {/* Diff Snapshot for Line Correction */}
                    {item.action === 'correct_line' && prev && updated && (
                      <div className="mt-2 rounded border border-slate-200 bg-white p-2.5 text-[11px]">
                        <div className="font-semibold text-slate-600 mb-1.5">
                          Chi tiết thay đổi số liệu:
                        </div>
                        <div className="grid grid-cols-2 gap-3 font-mono">
                          <div className="text-slate-600 space-y-0.5">
                            <span className="text-[10px] text-slate-400 font-sans block">Trước:</span>
                            <div>Tính lương: {String(prev.payable_minutes ?? '—')}p</div>
                            <div>Tăng ca: {String(prev.overtime_minutes ?? '—')}p</div>
                            <div>Lương gộp: {formatCurrency(Number(prev.gross_vnd ?? 0))}</div>
                            <div>Điều chỉnh: {formatCurrency(Number(prev.adjustment_vnd ?? 0))}</div>
                          </div>
                          <div className="text-blue-900 font-semibold space-y-0.5">
                            <span className="text-[10px] text-blue-500 font-sans block">Sau:</span>
                            <div>Tính lương: {String(updated.payable_minutes ?? '—')}p</div>
                            <div>Tăng ca: {String(updated.overtime_minutes ?? '—')}p</div>
                            <div>Lương gộp: {formatCurrency(Number(updated.gross_vnd ?? 0))}</div>
                            <div>Điều chỉnh: {formatCurrency(Number(updated.adjustment_vnd ?? 0))}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Request UUID */}
                    {item.request_id && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono pt-1">
                        <Key className="h-3 w-3" />
                        <span>UUID: {item.request_id}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
