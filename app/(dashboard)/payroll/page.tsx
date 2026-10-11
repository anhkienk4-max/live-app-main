'use client'

import * as React from 'react'
import {
  Banknote,
  Calendar,
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  Download,
} from 'lucide-react'
import { PageShell } from '@/components/ui/archetypes'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { useToast } from '@/components/ui/toast'
import {
  workforceService,
  type PayrollPeriod,
  type PayrollLine,
  type PayrollAudit,
} from '@/lib/services/workforceService'
import { PayrollOverview } from '@/components/features/payroll/PayrollOverview'
import { PayrollPeriodManager } from '@/components/features/payroll/PayrollPeriodManager'
import { PayrollRateManager } from '@/components/features/payroll/PayrollRateManager'
import { PayrollDraftWorkspace } from '@/components/features/payroll/PayrollDraftWorkspace'
import { PayrollAuditTimeline } from '@/components/features/payroll/PayrollAuditTimeline'

export default function PayrollPage() {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const permission = resolveSystemPermission(currentUser)
  const { toast } = useToast()

  const [activeTab, setActiveTab] = React.useState<'workspace' | 'periods' | 'rates'>('workspace')
  const [selectedPeriod, setSelectedPeriod] = React.useState<PayrollPeriod | null>(null)
  const [lines, setLines] = React.useState<PayrollLine[]>([])
  const [audit, setAudit] = React.useState<PayrollAudit[]>([])
  const [loadingDetails, setLoadingDetails] = React.useState(false)

  // Load period details whenever selectedPeriod changes
  const loadPeriodDetails = React.useCallback(async (periodId: string) => {
    try {
      const res = await workforceService.getPeriod(periodId)
      setSelectedPeriod(res.period)
      setLines(res.lines)
      setAudit(res.audit)
    } catch (err: unknown) {
      toast({
        title: 'Không thể tải chi tiết chu kỳ lương',
        description: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ',
        variant: 'destructive',
      })
    } finally {
      setLoadingDetails(false)
    }
  }, [toast])

  React.useEffect(() => {
    let frame: number | undefined
    if (selectedPeriod?.id) {
      frame = requestAnimationFrame(() => {
        void loadPeriodDetails(selectedPeriod.id)
      })
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [selectedPeriod?.id, loadPeriodDetails])

  // RBAC Boundary: Strict Admin only
  if (!userLoading && permission !== 'admin') {
    return (
      <PageShell archetype="configuration" className="p-4 md:p-6">
        <Card className="border-rose-200 bg-rose-50/50 p-8 text-center max-w-lg mx-auto mt-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            Quyền truy cập bị từ chối (403 Forbidden)
          </h2>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Mô-đun Quản lý Bảng lương và Khung đơn giá chỉ dành riêng cho <strong>Quản trị viên (Admin)</strong>. Trưởng nhóm và Thành viên không có quyền truy cập dữ liệu tài chính nhạy cảm này.
          </p>
          <div className="mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.history.back()}
              className="text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Quay lại trang trước
            </Button>
          </div>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell archetype="command" className="space-y-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white">
              <Banknote className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Quản lý Bảng lương & Quyết toán
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Đối soát chi phí ca làm việc, áp dụng khung lương đã duyệt và vận hành quy trình phê duyệt độc lập.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedPeriod && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadPeriodDetails(selectedPeriod.id)}
              disabled={loadingDetails}
              className="text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingDetails ? 'animate-spin' : ''}`} />
              Cập nhật dữ liệu
            </Button>
          )}

          {selectedPeriod?.status === 'locked' && (
            <a
              href={workforceService.getExportCsvUrl(selectedPeriod.id)}
              download
              className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Tải CSV khóa sổ
            </a>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="workspace" className="text-xs px-3 py-1.5 font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Không gian đối soát ({selectedPeriod ? `${selectedPeriod.period_start} → ${selectedPeriod.period_end}` : 'Chưa chọn chu kỳ'})
          </TabsTrigger>
          <TabsTrigger value="periods" className="text-xs px-3 py-1.5 font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Danh sách chu kỳ lương
          </TabsTrigger>
          <TabsTrigger value="rates" className="text-xs px-3 py-1.5 font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Khung lương & Đơn giá
          </TabsTrigger>
        </TabsList>

        {/* WORKSPACE TAB */}
        <TabsContent value="workspace" className="space-y-6 mt-0">
          <PayrollOverview
            period={selectedPeriod}
            lines={lines}
            loading={loadingDetails}
          />

          {selectedPeriod ? (
            <>
              <PayrollDraftWorkspace
                period={selectedPeriod}
                lines={lines}
                currentUserId={currentUser?.id}
                currentUserRole={permission}
                onRefresh={() => loadPeriodDetails(selectedPeriod.id)}
              />

              <PayrollAuditTimeline audit={audit} />
            </>
          ) : (
            <Card className="p-8 text-center border-slate-200 bg-white">
              <Calendar className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600">
                Hãy chuyển sang tab <strong>&ldquo;Danh sách chu kỳ lương&rdquo;</strong> để chọn một chu kỳ đang xử lý.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveTab('periods')}
                className="mt-4 text-xs"
              >
                Mở danh sách chu kỳ
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* PERIODS TAB */}
        <TabsContent value="periods" className="mt-0">
          <PayrollPeriodManager
            selectedPeriodId={selectedPeriod?.id || null}
            onSelectPeriod={(period) => {
              setSelectedPeriod(period)
              setActiveTab('workspace')
            }}
          />
        </TabsContent>

        {/* RATES TAB */}
        <TabsContent value="rates" className="mt-0">
          <PayrollRateManager />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
