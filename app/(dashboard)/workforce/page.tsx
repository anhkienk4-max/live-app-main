'use client'

import * as React from 'react'
import {
  Activity,
  Users,
  User,
  Trophy,
  RefreshCw,
  Table2,
  LayoutGrid,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { PageShell } from '@/components/ui/archetypes'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWorkforceCapabilities } from '@/lib/hooks/useWorkforceCapabilities'
import { useTranslation } from '@/lib/i18n'
import type { User as BusinessUser } from '@/lib/types/database.types'
import { resolveSystemPermission } from '@/lib/permissions'
import { useToast } from '@/components/ui/toast'
import {
  workforceService,
  workforceErrorMessage,
  type WorkforceOverviewResponse,
  type WorkforceRole,
} from '@/lib/services/workforceService'
import { WorkforceTeamOverview } from '@/components/features/workforce/WorkforceTeamOverview'
import { WorkforceIndividualView } from '@/components/features/workforce/WorkforceIndividualView'
import { WorkforceLeaderboard } from '@/components/features/workforce/WorkforceLeaderboard'
import { AttendanceEvidenceReviewPanel } from '@/components/features/workforce/AttendanceEvidenceReviewPanel'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { parseWorkforceYearDraft } from '@/lib/workforce/workforcePeriod'
import { useListPagination } from '@/lib/hooks/useListPagination'

export default function WorkforcePage() {
  const { translate } = useTranslation()
  const { currentUser, loading, error, capabilities, identityKey, reload } = useWorkforceCapabilities()
  if (loading) return <PageShell archetype="command" className="p-4 md:p-6"><p role="status">{translate('Đang xác minh phiên đăng nhập và quyền truy cập…')}</p></PageShell>
  if (error) return <PageShell archetype="command" className="space-y-3 p-4 md:p-6"><p role="alert">{translate(error)}</p><Button onClick={reload}>{translate('Thử lại')}</Button></PageShell>
  if (!currentUser || !capabilities?.own_performance) return <PageShell archetype="command" className="p-4 md:p-6"><p role="status">{translate('Tính năng đang tắt. Vui lòng chờ cấu hình được phê duyệt.')}</p></PageShell>
  return <WorkforceWorkspace key={identityKey} currentUser={currentUser} canViewTeam={capabilities.team_performance} />
}

function WorkforceWorkspace({ currentUser, canViewTeam }: { currentUser: BusinessUser; canViewTeam: boolean }) {
  const permission = resolveSystemPermission(currentUser)
  const isSupervisor = canViewTeam && (permission === 'admin' || permission === 'leader')
  const { toast } = useToast()
  const { language } = useTranslation()
  const en = language === 'en'
  const params = useSearchParams()
  const pagination = useListPagination('workforce_staff', 20)

  // Workforce periods use the shift's business calendar date.
  const currentMonthStr = React.useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const periodParam = params.get('workforce_period')
  const period = periodParam && /^\d{4}(?:-(0[1-9]|1[0-2]))?$/u.test(periodParam) ? periodParam : currentMonthStr
  const roleParam = params.get('workforce_role')
  const role: WorkforceRole = roleParam === 'support' || roleParam === 'technical' ? roleParam : 'host'
  const viewParam = params.get('workforce_view')
  const canReviewAttendanceEvidence = process.env.NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_REVIEW === 'true'
  const activeTab = viewParam === 'table' || viewParam === 'cards' || viewParam === 'individual' || viewParam === 'leaderboard' || (canReviewAttendanceEvidence && viewParam === 'attendance_reviews') ? viewParam : 'team'
  const search = params.get('workforce_search') || ''
  const staffFilter = params.get('workforce_staff_id') || ''
  const sortParam = params.get('workforce_sort')
  const sort = sortParam === 'assigned' || sortParam === 'approved_minutes' || sortParam === 'punctuality' ? sortParam : 'name'
  const direction = params.get('workforce_direction') === 'desc' ? 'desc' : 'asc'
  const recordParam = params.get('workforce_record')
  const record = recordParam === 'complete' || recordParam === 'incomplete' ? recordParam : null
  const [yearDraft, setYearDraft] = React.useState(period.slice(0, 4))
  const updateQuery = (values: Record<string, string | null>, resetPage = false) =>
    pagination.navigate({ ...values, ...(resetPage ? { workforce_staff_page: null } : {}) })
  const updatePeriod = (value: string) => {
    setYearDraft(value.slice(0, 4))
    updateQuery({ workforce_period: value }, true)
  }
  const updateRole = (value: WorkforceRole) => updateQuery({ workforce_role: value }, true)
  const setActiveTab = (value: string) => updateQuery({ workforce_view: value === 'team' ? null : value })
  const selectedStaffId = staffFilter || currentUser.id
  const needsOverview = isSupervisor && activeTab !== 'individual' && activeTab !== 'attendance_reviews'

  // Overview response state
  const [overviewState, setOverviewState] = React.useState<{ key: string; data?: WorkforceOverviewResponse; error?: string } | null>(null)
  const [loadingOverview, setLoadingOverview] = React.useState(false)
  const queryKey = [period, role, pagination.page, pagination.pageSize, search, staffFilter, record, sort, direction].join('|')
  const overviewData = overviewState?.key === queryKey ? overviewState.data || null : null
  const overviewError = overviewState?.key === queryKey ? overviewState.error || null : null

  // Load Team Overview for Supervisors
  const readSequence = React.useRef(0)
  const overviewRequest = React.useRef<AbortController | null>(null)
  const loadOverview = React.useCallback(async () => {
    if (!needsOverview) return
    const sequence = ++readSequence.current
    overviewRequest.current?.abort()
    const controller = new AbortController()
    overviewRequest.current = controller
    setLoadingOverview(true)
    try {
      const res = await workforceService.getWorkforceOverview({
        period, role, page: pagination.page, pageSize: pagination.pageSize,
        search, staffId: staffFilter, record: record || undefined,
        sort, direction, signal: controller.signal,
      })
      if (sequence !== readSequence.current) return
      setOverviewState({ key: queryKey, data: res })
    } catch (err: unknown) {
      if (sequence !== readSequence.current || controller.signal.aborted) return
      setOverviewState({ key: queryKey, error: workforceErrorMessage(err) })
      toast({
        title: en ? 'Could not load team performance' : 'Không thể tải tổng quan hiệu suất đội ngũ',
        description: workforceErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      if (sequence === readSequence.current) setLoadingOverview(false)
    }
  }, [needsOverview, period, role, pagination.page, pagination.pageSize, search, staffFilter, record, sort, direction, queryKey, toast, en])
  useShiftChangeRefresh(loadOverview)

  React.useEffect(() => {
    const generation = readSequence
    let frame: number | undefined
    if (needsOverview) {
      frame = requestAnimationFrame(() => {
        void loadOverview()
      })
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      generation.current++
      overviewRequest.current?.abort()
    }
  }, [needsOverview, loadOverview])

  const handleDrilldownStaff = (staffId: string) => {
    updateQuery({ workforce_staff_id: staffId, workforce_view: 'individual' })
  }

  // If Member: strictly individual performance view
  if (!isSupervisor) {
    const myStaffId = currentUser!.id
    return (
      <PageShell archetype="command" className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white">
              <Activity className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {en ? 'Individual Performance & Attendance' : 'Hiệu suất & Chấm công cá nhân'}
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            {en ? 'Track approved work, attendance and verified timeliness.' : 'Theo dõi khối lượng làm việc thực tế, thời lượng và tỷ lệ đúng giờ được xác nhận độc lập.'}
          </p>
        </div>

        <WorkforceIndividualView
          key={`${myStaffId}:${role}:${period}`}
          staffId={myStaffId}
          role={role}
          period={period}
          canSelectOtherStaff={false}
          onRoleChange={updateRole}
          onPeriodChange={updatePeriod}
        />
      </PageShell>
    )
  }

  // Admin & Leader workspace with tabs
  return (
    <PageShell archetype="command" className="space-y-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white">
              <Activity className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {en ? 'Workforce Performance' : 'Quản lý Hiệu suất Nhân sự'}
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {en ? 'Track verified attendance, approved time and team performance.' : 'Theo dõi kỷ luật thời gian, mức độ bao phủ chứng minh chấm công và độ tin cậy vận hành của đội ngũ.'}
          </p>
        </div>

        {/* Global period and role controls for Team/Leaderboard */}
        {activeTab !== 'individual' && activeTab !== 'attendance_reviews' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <Select value={role} onValueChange={(val: WorkforceRole) => updateRole(val)}>
                <SelectTrigger aria-label={en ? 'Operational role' : 'Vai trò vận hành'} className="h-8 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="host">Host Livestream</SelectItem>
                  <SelectItem value="support">{en ? 'Support' : 'Trợ lý phiên Live'}</SelectItem>
                  <SelectItem value="technical">{en ? 'Technical' : 'Kỹ thuật viên'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-36">
              <Select value={period.length === 4 ? 'year' : 'month'} onValueChange={(mode) =>
                updatePeriod(mode === 'year' ? period.slice(0, 4) : `${period.slice(0, 4)}-01`)
              }>
                <SelectTrigger aria-label={en ? 'Period mode' : 'Chế độ thời gian'} className="h-8 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">{en ? 'Monthly' : 'Theo tháng'}</SelectItem>
                  <SelectItem value="year">{en ? 'Yearly' : 'Theo năm'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-36">
              <Input
                type={period.length === 4 ? 'number' : 'month'}
                aria-label={en ? 'Performance period' : 'Kỳ hiệu suất'}
                min={period.length === 4 ? 1900 : undefined}
                max={period.length === 4 ? 9999 : undefined}
                step={period.length === 4 ? 1 : undefined}
                value={period.length === 4 ? yearDraft : period}
                onChange={(e) => {
                  const value = e.target.value
                  if (period.length === 4) {
                    const parsed = parseWorkforceYearDraft(value)
                    if (parsed) {
                      setYearDraft(parsed.draft)
                      if (parsed.period) updatePeriod(parsed.period)
                    }
                  } else if (/^\d{4}-\d{2}$/u.test(value)) {
                    updatePeriod(value)
                  }
                }}
                onBlur={() => {
                  if (!/^\d{4}$/u.test(yearDraft)) setYearDraft(period.slice(0, 4))
                }}
                className="h-8 text-xs bg-white"
              />
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => loadOverview()}
              disabled={loadingOverview}
              className="h-8 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingOverview ? 'animate-spin' : ''}`} />
              {en ? 'Refresh' : 'Làm mới'}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className={`grid group-data-[orientation=horizontal]/tabs:h-auto w-full grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg ${canReviewAttendanceEvidence ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
          <TabsTrigger value="team" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {en ? 'Overview' : 'Tổng quan'}
          </TabsTrigger>
          <TabsTrigger value="table" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Table2 className="h-3.5 w-3.5 mr-1.5" />
            {en ? 'Table' : 'Bảng'}
          </TabsTrigger>
          <TabsTrigger value="cards" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            {en ? 'Cards' : 'Thẻ'}
          </TabsTrigger>
          <TabsTrigger value="individual" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <User className="h-3.5 w-3.5 mr-1.5" />
            {en ? 'Individual' : 'Cá nhân'}
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Trophy className="h-3.5 w-3.5 mr-1.5" />
            {en ? 'Ranking' : 'Xếp hạng'}
          </TabsTrigger>
          {canReviewAttendanceEvidence ? <TabsTrigger value="attendance_reviews" data-testid="attendance-evidence-review-tab">Photo review</TabsTrigger> : null}
        </TabsList>

        {(['team', 'table', 'cards'] as const).map(view => <TabsContent key={view} value={view} className="mt-0">
          <WorkforceTeamOverview view={view} overview={overviewData?.team || null}
            staffList={overviewData?.staff || []} staffPagination={overviewData?.staff_pagination}
            period={period} role={role} loading={loadingOverview || (!overviewState || overviewState.key !== queryKey) && !overviewError}
            error={overviewError} onRetry={loadOverview} onSelectStaff={handleDrilldownStaff}
            page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize}
            searchDraft={search} staffDraft={staffFilter}
            onApplyFilters={(searchValue, staffValue) => updateQuery({ workforce_search: searchValue.trim() || null, workforce_staff_id: staffValue.trim() || null }, true)}
            sort={sort} direction={direction} onSortChange={(value, dir) => updateQuery({ workforce_sort: value, workforce_direction: dir, workforce_staff_page: null })}
            record={record} onRecordChange={value => updateQuery({ workforce_record: value, workforce_staff_page: null })}
          />
        </TabsContent>)}

        {/* INDIVIDUAL PERFORMANCE TAB */}
        <TabsContent value="individual" className="mt-0">
          <WorkforceIndividualView
            key={`${selectedStaffId}:${role}:${period}`}
            staffId={selectedStaffId || currentUser?.id || ''}
            role={role}
            period={period}
            canSelectOtherStaff={isSupervisor}
            onStaffChange={value => updateQuery({ workforce_staff_id: value || null })}
            onRoleChange={updateRole}
            onPeriodChange={updatePeriod}
          />
        </TabsContent>

        {canReviewAttendanceEvidence ? <TabsContent value="attendance_reviews" className="mt-0"><AttendanceEvidenceReviewPanel /></TabsContent> : null}

        {/* LEADERBOARD TAB */}
        <TabsContent value="leaderboard" className="mt-0">
          <WorkforceLeaderboard
            leaderboard={overviewData?.leaderboard || []}
            isConfigured={overviewData?.leaderboard_policy_configured || false}
            loading={loadingOverview || (!overviewState || overviewState.key !== queryKey) && !overviewError}
            error={overviewError}
            period={period}
            role={role}
            search={search}
            staffFilter={staffFilter}
            onRetry={loadOverview}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
