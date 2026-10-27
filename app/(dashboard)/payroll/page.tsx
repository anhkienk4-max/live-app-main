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
import { useWorkforceCapabilities } from '@/lib/hooks/useWorkforceCapabilities'
import { useTranslation } from '@/lib/i18n'
import type { User as BusinessUser } from '@/lib/types/database.types'
import { resolveSystemPermission } from '@/lib/permissions'
import { useToast } from '@/components/ui/toast'
import {
  workforceService,
  workforceErrorMessage,
  type PayrollPeriod,
  type PayrollLine,
  type PayrollAudit,
} from '@/lib/services/workforceService'
import { PayrollOverview } from '@/components/features/payroll/PayrollOverview'
import { formatCurrency } from '@/lib/utils/currency'
import { PayrollPeriodManager } from '@/components/features/payroll/PayrollPeriodManager'
import { PayrollRateManager } from '@/components/features/payroll/PayrollRateManager'
import { PayrollDraftWorkspace } from '@/components/features/payroll/PayrollDraftWorkspace'
import { PayrollAuditTimeline } from '@/components/features/payroll/PayrollAuditTimeline'

export default function PayrollPage() {
  const { translate } = useTranslation()
  const { currentUser, loading, error, capabilities, identityKey } = useWorkforceCapabilities()
  if (loading) return <PageShell archetype="command" className="p-4 md:p-6"><p role="status">{translate('Đang xác minh phiên đăng nhập và quyền truy cập…')}</p></PageShell>
  if (error) return <PageShell archetype="command" className="p-4 md:p-6"><p role="alert">{translate(error)}</p></PageShell>
  if (!currentUser || resolveSystemPermission(currentUser) !== 'admin') return <PageShell archetype="command" className="p-4 md:p-6"><p role="alert">{translate('Bạn không có quyền truy cập bảng lương (403).')}</p></PageShell>
  if (!capabilities?.payroll) return <PageShell archetype="command" className="p-4 md:p-6"><p role="status">{translate('Tính năng đang tắt. Vui lòng chờ cấu hình được phê duyệt.')}</p></PageShell>
  return <PayrollWorkspace key={identityKey} currentUser={currentUser} />
}

function PayrollWorkspace({ currentUser }: { currentUser: BusinessUser }) {
  const permission = resolveSystemPermission(currentUser)
  const { toast } = useToast()

  const [activeTab, setActiveTab] = React.useState<'workspace' | 'periods' | 'rates'>('periods')
  const [selectedPeriod, setSelectedPeriod] = React.useState<PayrollPeriod | null>(null)
  const [lines, setLines] = React.useState<PayrollLine[]>([])
  const [audit, setAudit] = React.useState<PayrollAudit[]>([])
  const [loadingDetails, setLoadingDetails] = React.useState(false)

  // Load period details whenever selectedPeriod changes
  const readSequence = React.useRef(0)
  const [readError, setReadError] = React.useState<string | null>(null)
  const loadPeriodDetails = React.useCallback(async (periodId: string) => {
    const sequence = ++readSequence.current
    setLines([])
    setAudit([])
    setReadError(null)
    setLoadingDetails(true)
    try {
      const res = await workforceService.getPeriod(periodId)
      if (sequence !== readSequence.current) return
      setSelectedPeriod(res.period)
      setLines(res.lines)
      setAudit(res.audit)
    } catch (err: unknown) {
      if (sequence !== readSequence.current) return
      setReadError(workforceErrorMessage(err))
      toast({
        title: 'Không thể tải chi tiết chu kỳ lương',
        description: workforceErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      if (sequence === readSequence.current) setLoadingDetails(false)
    }
  }, [toast])

  React.useEffect(() => {
    const generation = readSequence
    let frame: number | undefined
    if (selectedPeriod?.id) {
      frame = requestAnimationFrame(() => {
        void loadPeriodDetails(selectedPeriod.id)
      })
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      generation.current++
    }
  }, [selectedPeriod?.id, loadPeriodDetails])

  // RBAC Boundary: Strict Admin only
  if (permission !== 'admin') {
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
    <PageShell archetype="command" className="ada-payroll-page space-y-6 p-4 md:p-6" data-testid="payroll-page">
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
            <Button
              onClick={() => void workforceService.downloadCsv(selectedPeriod.id).catch(err => toast({ title: 'Không thể tải CSV', description: workforceErrorMessage(err), variant: 'destructive' }))}
              className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Tải CSV khóa sổ
            </Button>
          )}
        </div>
      </div>

      {readError && <p role="alert">{readError}</p>}
      <section data-testid="ada-reference-payroll-mobile" className="space-y-4 lg:hidden">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E6ECF8] bg-white px-3 py-3">
          <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-[#2563EB]" /><span className="text-[12px] font-semibold text-[#142650]">{selectedPeriod ? `${selectedPeriod.period_start} – ${selectedPeriod.period_end}` : 'Chưa chọn chu kỳ lương'}</span></div>
          <button type="button" onClick={() => setActiveTab('periods')} className="shrink-0 text-[11px] font-bold text-[#2563EB]">Chọn kỳ</button>
        </div>
        {selectedPeriod ? (
          <div className="overflow-hidden rounded-[16px] bg-gradient-to-br from-[#091C49] via-[#0C285E] to-[#07142E] p-5 text-white shadow-[0_8px_22px_rgba(8,25,61,.14)]">
            <p className="text-[11px] text-blue-100">Tổng giá trị quyết toán · {selectedPeriod.status}</p>
            <p className="mt-3 text-[27px] font-extrabold tabular-nums tracking-tight">{loadingDetails ? 'Đang tải...' : formatCurrency(lines.filter(line => !line.voided_at).reduce((sum, line) => sum + line.net_vnd, 0))}</p>
            <div className="mt-4 border-t border-white/15 pt-3 text-[11px] text-blue-100">
              {lines.filter(line => !line.voided_at).length} phân đoạn ca trong kỳ · Chỉ dành cho Admin
            </div>
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-[#CBD7ED] bg-white p-5 text-center">
            <Banknote className="mx-auto h-7 w-7 text-[#2563EB]" />
            <p className="mt-2 text-[13px] font-semibold text-[#07183B]">Chọn kỳ lương để xem số liệu</p>
            <p className="mt-1 text-[11px] text-slate-500">Không hiển thị số tiền khi chưa có kỳ quyết toán.</p>
          </div>
        )}
        {selectedPeriod && !loadingDetails && (
          <div className="space-y-3">
            <h2 className="text-[14px] font-bold text-[#07183B]">Chi tiết theo ca</h2>
            {lines.filter(line => !line.voided_at).length === 0 ? (
              <p className="rounded-xl border border-[#E7ECF8] bg-white p-4 text-[12px] text-slate-500">Kỳ này chưa có phân đoạn ca đối soát.</p>
            ) : (
              <div className="divide-y divide-[#EDF1F8] overflow-hidden rounded-[15px] border border-[#E7ECF8] bg-white">
                {lines.filter(line => !line.voided_at).slice(0, 5).map(line => <div key={line.id} className="flex items-center gap-3 px-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]"><Banknote className="h-[17px] w-[17px]" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[#12234C]">{line.operational_role} · {line.payable_minutes} phút</p>
                    <p className="truncate text-[10px] text-slate-500">Mã phân đoạn: {line.segment_id}</p>
                  </div>
                  <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#0C2454]">{formatCurrency(line.net_vnd)}</span>
                </div>)}
              </div>
            )}
          </div>
        )}
      </section>
      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="space-y-4">
        <TabsList className="grid group-data-[orientation=horizontal]/tabs:h-auto w-full grid-cols-3 bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="workspace" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Không gian đối soát
          </TabsTrigger>
          <TabsTrigger value="periods" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Danh sách chu kỳ lương
          </TabsTrigger>
          <TabsTrigger value="rates" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
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
              {!loadingDetails && !readError && <PayrollDraftWorkspace
                period={selectedPeriod}
                lines={lines}
                currentUserId={currentUser?.id}
                currentUserRole={permission}
                audit={audit}
                onRefresh={() => loadPeriodDetails(selectedPeriod.id)}
              />}

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
