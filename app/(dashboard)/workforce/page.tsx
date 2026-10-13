'use client'

import * as React from 'react'
import {
  Activity,
  Users,
  User,
  Trophy,
  RefreshCw,
} from 'lucide-react'
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

export default function WorkforcePage() {
  const { translate } = useTranslation()
  const { currentUser, loading, error, capabilities, identityKey } = useWorkforceCapabilities()
  if (loading) return <PageShell archetype="command" className="p-4 md:p-6"><p role="status">{translate('Đang xác minh phiên đăng nhập và quyền truy cập…')}</p></PageShell>
  if (error) return <PageShell archetype="command" className="p-4 md:p-6"><p role="alert">{translate(error)}</p></PageShell>
  if (!currentUser || !capabilities?.own_performance) return <PageShell archetype="command" className="p-4 md:p-6"><p role="status">{translate('Tính năng đang tắt. Vui lòng chờ cấu hình được phê duyệt.')}</p></PageShell>
  return <WorkforceWorkspace key={identityKey} currentUser={currentUser} canViewTeam={capabilities.team_performance} />
}

function WorkforceWorkspace({ currentUser, canViewTeam }: { currentUser: BusinessUser; canViewTeam: boolean }) {
  const permission = resolveSystemPermission(currentUser)
  const isSupervisor = canViewTeam && (permission === 'admin' || permission === 'leader')
  const { toast } = useToast()

  // Default month: current month YYYY-MM
  const currentMonthStr = React.useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const [month, setMonth] = React.useState<string>(currentMonthStr)
  const [role, setRole] = React.useState<WorkforceRole>('host')
  const [activeTab, setActiveTab] = React.useState<'team' | 'individual' | 'leaderboard'>('team')

  // Selected staff ID for Individual tab
  const [selectedStaffId, setSelectedStaffId] = React.useState<string>('')

  // Overview response state
  const [overviewData, setOverviewData] = React.useState<WorkforceOverviewResponse | null>(null)
  const [overviewError, setOverviewError] = React.useState<string | null>(null)
  const [loadingOverview, setLoadingOverview] = React.useState(false)

  // Initialize selectedStaffId for Member or Supervisor
  React.useEffect(() => {
    let frame: number | undefined
    if (currentUser?.id && !selectedStaffId) {
      frame = requestAnimationFrame(() => {
        setSelectedStaffId(currentUser.id)
      })
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [currentUser?.id, selectedStaffId])

  // Load Team Overview for Supervisors
  const loadOverview = React.useCallback(async () => {
    if (!isSupervisor) return
    setLoadingOverview(true)
    setOverviewError(null)
    try {
      const res = await workforceService.getWorkforceOverview({ month, role })
      setOverviewData(res)
    } catch (err: unknown) {
      setOverviewError(workforceErrorMessage(err))
      setOverviewData(null)
      toast({
        title: 'Không thể tải tổng quan hiệu suất đội ngũ',
        description: workforceErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setLoadingOverview(false)
    }
  }, [isSupervisor, month, role, toast])

  React.useEffect(() => {
    let frame: number | undefined
    if (isSupervisor) {
      frame = requestAnimationFrame(() => {
        void loadOverview()
      })
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [isSupervisor, loadOverview])

  const handleDrilldownStaff = (staffId: string) => {
    setSelectedStaffId(staffId)
    setActiveTab('individual')
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
              Hiệu suất & Chấm công cá nhân
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Theo dõi khối lượng làm việc thực tế, thời lượng và tỷ lệ đúng giờ được xác nhận độc lập.
          </p>
        </div>

        <WorkforceIndividualView
          staffId={myStaffId}
          role={role}
          month={month}
          canSelectOtherStaff={false}
          onRoleChange={setRole}
          onMonthChange={setMonth}
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
              Quản lý Hiệu suất Nhân sự (Workforce Performance)
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Theo dõi kỷ luật thời gian, mức độ bao phủ chứng minh chấm công và độ tin cậy vận hành của đội ngũ.
          </p>
        </div>

        {/* Global Month & Role controls for Team tab */}
        {activeTab !== 'individual' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <Select value={role} onValueChange={(val: WorkforceRole) => setRole(val)}>
                <SelectTrigger className="h-8 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="host">Host Livestream</SelectItem>
                  <SelectItem value="support">Trợ lý phiên Live</SelectItem>
                  <SelectItem value="technical">Kỹ thuật viên</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-36">
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
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
              Làm mới
            </Button>
          </div>
        )}
      </div>

      {overviewError && <p role="alert">{overviewError}</p>}
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="space-y-4">
        <TabsList className="grid group-data-[orientation=horizontal]/tabs:h-auto w-full grid-cols-3 bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="team" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Tổng quan đội ngũ
          </TabsTrigger>
          <TabsTrigger value="individual" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <User className="h-3.5 w-3.5 mr-1.5" />
            Hiệu suất cá nhân
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="min-h-11 min-w-0 whitespace-normal px-2 py-1.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Trophy className="h-3.5 w-3.5 mr-1.5" />
            Bảng xếp hạng
          </TabsTrigger>
        </TabsList>

        {/* TEAM OVERVIEW TAB */}
        <TabsContent value="team" className="mt-0">
          <WorkforceTeamOverview
            overview={overviewData?.team || null}
            staffList={overviewData?.staff || []}
            month={month}
            role={role}
            loading={loadingOverview}
            onSelectStaff={handleDrilldownStaff}
          />
        </TabsContent>

        {/* INDIVIDUAL PERFORMANCE TAB */}
        <TabsContent value="individual" className="mt-0">
          <WorkforceIndividualView
            key={`${selectedStaffId}:${role}:${month}`}
            staffId={selectedStaffId || currentUser?.id || ''}
            role={role}
            month={month}
            canSelectOtherStaff={isSupervisor}
            onStaffChange={setSelectedStaffId}
            onRoleChange={setRole}
            onMonthChange={setMonth}
          />
        </TabsContent>

        {/* LEADERBOARD TAB */}
        <TabsContent value="leaderboard" className="mt-0">
          <WorkforceLeaderboard
            leaderboard={overviewData?.leaderboard || []}
            isConfigured={overviewData?.leaderboard_policy_configured || false}
            month={month}
            role={role}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
