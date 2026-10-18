'use client'

import * as React from 'react'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { pageRange } from '@/lib/utils/pagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import {
  Trophy,
  Award,
  ShieldCheck,
  Info,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LeaderboardEntry, WorkforceRole } from '@/lib/services/workforceService'

interface WorkforceLeaderboardProps {
  leaderboard: LeaderboardEntry[]
  isConfigured: boolean
  month: string
  role: WorkforceRole
  loading?: boolean
  error?: string | null
}

export function WorkforceLeaderboard({
  leaderboard,
  isConfigured,
  month,
  role,
  loading = false,
  error = null,
}: WorkforceLeaderboardProps) {
  const pagination = useListPagination('workforce_leaderboard', 10)
  const range = pageRange(leaderboard.length, pagination.page, pagination.pageSize)
  const pageRows = leaderboard.slice((range.page - 1) * pagination.pageSize, range.page * pagination.pageSize)
  const roleLabels: Record<WorkforceRole, string> = {
    host: 'Host Livestream',
    support: 'Trợ lý phiên Live',
    technical: 'Kỹ thuật viên',
  }

  const rankBadges = [
    { badge: 'bg-amber-100 text-amber-800 border-amber-300 font-bold', icon: '🥇' },
    { badge: 'bg-slate-200 text-slate-800 border-slate-300 font-bold', icon: '🥈' },
    { badge: 'bg-amber-700/10 text-amber-900 border-amber-700/30 font-bold', icon: '🥉' },
  ]

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Bảng xếp hạng hiệu suất & Kỷ luật ({roleLabels[role]})
            </CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              Tháng {month} • Xếp hạng minh bạch dựa trên tỷ lệ đúng giờ và khối lượng công việc được xác thực.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center animate-pulse">
            <div className="mx-auto h-8 w-8 rounded-full bg-slate-200" />
            <div className="mx-auto mt-3 h-4 w-48 rounded bg-slate-200" />
            <div className="mx-auto mt-2 h-3 w-64 rounded bg-slate-100" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
            <h4 className="mt-2 text-sm font-semibold text-rose-900">
              Không thể tải bảng xếp hạng
            </h4>
            <p className="mx-auto mt-1 max-w-md text-xs text-rose-600 leading-relaxed">
              {error}
            </p>
          </div>
        ) : !isConfigured ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-6 text-center">
            <Info className="mx-auto h-8 w-8 text-slate-400" />
            <h4 className="mt-2 text-sm font-semibold text-slate-800">
              Chưa kích hoạt ngưỡng mẫu tối thiểu
            </h4>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 leading-relaxed">
              Biến môi trường <code>WORKFORCE_LEADERBOARD_MIN_VERIFIED_SHIFTS</code> chưa được cấu hình trên máy chủ. Bảng xếp hạng tạm thời ẩn để tránh sai lệch thống kê và đảm bảo đánh giá công bằng.
            </p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-6 text-center">
            <Award className="mx-auto h-8 w-8 text-slate-400" />
            <h4 className="mt-2 text-sm font-semibold text-slate-800">
              Chưa có nhân sự đủ điều kiện xếp hạng
            </h4>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 leading-relaxed">
              Để xuất hiện trên bảng xếp hạng, nhân sự cần có <strong>100% hồ sơ chấm công hoàn tất</strong> trong tháng và đạt số ca làm việc tối thiểu theo quy định.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 text-center w-16">Thứ hạng</th>
                  <th className="px-3 py-2.5">Nhân sự</th>
                  <th className="px-3 py-2.5 text-center">Số ca đã duyệt</th>
                  <th className="px-3 py-2.5 text-right">Tổng giờ thực tế</th>
                  <th className="px-3 py-2.5 text-right font-bold">Tỷ lệ đúng giờ</th>
                  <th className="px-3 py-2.5 text-center">Minh chứng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((entry) => {
                  const hours = Math.floor(entry.approved_actual_minutes / 60)
                  const mins = entry.approved_actual_minutes % 60
                  const medal = rankBadges[entry.rank - 1]

                  return (
                    <tr
                      key={entry.staff_id}
                      className={`transition-colors ${
                        entry.rank === 1
                          ? 'bg-amber-50/40 font-medium'
                          : entry.rank === 2
                          ? 'bg-slate-50/60'
                          : entry.rank === 3
                          ? 'bg-amber-50/20'
                          : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center font-bold text-sm">
                        {medal ? (
                          <span className="flex items-center justify-center gap-1">
                            <span>{medal.icon}</span>
                            <span className="text-xs text-slate-700">#{entry.rank}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono text-xs">
                            #{entry.rank}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">
                          {entry.name || entry.staff_id}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {entry.staff_id}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-slate-700">
                        {entry.approved_worked_shifts} ca
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-900">
                        {hours}h {mins}p
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                        {entry.punctuality_pct !== null ? `${entry.punctuality_pct}%` : 'N/A'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          100% Xác thực
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Fairness Policy Note */}
        <div className="rounded-md bg-slate-50 p-3 text-[11px] text-slate-500 border border-slate-200 space-y-1">
          <p className="font-semibold text-slate-700">Nguyên tắc xếp hạng khoa học & minh bạch:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Không xếp hạng chéo giữa các vai trò khác nhau (Host, Trợ lý, Kỹ thuật có tiêu chí riêng).</li>
            <li>Không gán điểm số AI giả định hay phân bổ doanh thu GMV khi chưa có xác nhận ca.</li>
            <li>Ưu tiên xếp hạng theo <strong>Tỷ lệ đúng giờ</strong>, sau đó đến <strong>Số ca làm việc thực tế</strong> và <strong>Tổng giờ làm việc</strong>.</li>
          </ul>
        </div>

        <HistoryPagination page={range.page} pageSize={pagination.pageSize} total={leaderboard.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
</CardContent>
    </Card>
  )
}
