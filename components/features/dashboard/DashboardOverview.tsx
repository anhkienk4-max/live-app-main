'use client'

import * as React from 'react'
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { brandService, campaignService, platformService, reportService, shiftRegistrationService, shiftService, swapRequestService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, Platform, Report, Shift, ShiftRegistration, SwapRequest, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { PageLoadError } from '@/components/ui/page-load-error'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getSwapUiActions } from '@/lib/utils/swapUi'
import { getMemberAssignedShifts, getLeaderPendingRegistrations, getLeaderPendingReports, getLeaderPendingSwaps } from '@/lib/ui/dashboard-role-data'
import { deriveLeaderAttention, deriveDataQualityAttention } from '@/lib/ui/operational-attention'
import { getAllIssues } from '@/lib/utils/dataQuality'
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'
import { AdminDashboardView } from './presentation/admin/AdminDashboardView'
import { LeaderDashboardView } from './presentation/leader/LeaderDashboardView'
import { MemberDashboardView } from './presentation/member/MemberDashboardView'

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
type Filters = { preset: Preset; start: string; end: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[] }
const dateValue = (date: Date) => format(date, 'yyyy-MM-dd')
const rangeFor = (preset: Exclude<Preset, 'custom'>) => {
  const today = new Date(`${getCurrentBusinessDate()}T00:00:00`)
  if (preset === 'today') return { start: dateValue(today), end: dateValue(today) }
  if (preset === 'yesterday') return { start: dateValue(addDays(today, -1)), end: dateValue(addDays(today, -1)) }
  if (preset === '7d') return { start: dateValue(addDays(today, -6)), end: dateValue(today) }
  if (preset === '30d') return { start: dateValue(addDays(today, -29)), end: dateValue(today) }
  if (preset === 'thisMonth') return { start: dateValue(startOfMonth(today)), end: dateValue(today) }
  const previous = subMonths(today, 1)
  return { start: dateValue(startOfMonth(previous)), end: dateValue(endOfMonth(previous)) }
}
const initialFilters = (): Filters => ({ preset: '30d', ...rangeFor('30d'), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [] })

type DashboardDataset = Pick<CommonProps, 'shifts' | 'reports' | 'brands' | 'platforms' | 'campaigns' | 'users' | 'registrations' | 'swapRequests'>

export function DashboardOverview() {
  const {currentUser} = useCurrentUser()
  const [data,setData] = React.useState<DashboardDataset | null>(null)
  const [loadError,setLoadError] = React.useState<unknown>(null)
  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [shifts,reports,brands,platforms,campaigns,users,registrations,swapRequests] = await Promise.all([
        shiftService.getAll(),reportService.getAll(),brandService.getAll(),platformService.getAll(),campaignService.getAll(),userService.getAll(),shiftRegistrationService.getAll(),swapRequestService.getAll(),
      ])
      setData({shifts,reports,brands,platforms,campaigns,users,registrations,swapRequests})
    } catch(error) {setLoadError(error)}
  },[])
  React.useEffect(()=>{const frame=requestAnimationFrame(()=>{if(currentUser) void loadData()});return ()=>cancelAnimationFrame(frame)},[currentUser,loadData])
  if (loadError) return <PageLoadError error={loadError} onRetry={()=>void loadData()} />
  if (!data || !currentUser) return <ContentSkeleton />
  return <DashboardWorkspace data={data} currentUser={currentUser} onUpdate={loadData} />
}

// Presentation accepts typed data; only the visual-QA route supplies fixture data.
export function DashboardWorkspace({data,currentUser,onUpdate}: {data:DashboardDataset;currentUser:User;onUpdate:()=>void | Promise<void>}) {
  const {t} = useTranslation()
  const [filters,setFilters] = React.useState<Filters | null>(null)
  const [showFilters,setShowFilters] = React.useState(false)
  const [selectedShift,setSelectedShift] = React.useState<Shift | null>(null)
  React.useEffect(()=>{const frame=requestAnimationFrame(()=>setFilters(initialFilters()));return ()=>cancelAnimationFrame(frame)},[])
  if (!filters) return <ContentSkeleton />
  const role = resolveSystemPermission(currentUser)
  const setPreset = (preset:Preset)=>setFilters(current=>current ? {...current,preset,...(preset==='custom'?{}:rangeFor(preset))} : current)
  const props = {...data,filters,setFilters,showFilters,setShowFilters,currentUser,t,setPreset,setSelectedShift}
  return <div>
    {role==='admin' && <AdminDashboard {...props} />}
    {role==='leader' && <LeaderDashboard {...props} />}
    {role==='member' && <MemberDashboard {...props} />}
    {selectedShift && <ShiftDetailModal open shift={selectedShift} brands={data.brands} platforms={data.platforms} campaigns={data.campaigns} users={data.users} allRegistrations={data.registrations} onOpenChange={open=>!open&&setSelectedShift(null)} onUpdate={onUpdate} onDelete={()=>{setSelectedShift(null);void onUpdate()}} />}
  </div>
}

type CommonProps = {
  shifts: Shift[]
  reports: Report[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[]
  swapRequests: SwapRequest[]
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters | null>>
  showFilters: boolean
  setShowFilters: React.Dispatch<React.SetStateAction<boolean>>
  currentUser: User
  t: (key: string) => string
  setPreset: (preset: Preset) => void
  setSelectedShift: (shift: Shift | null) => void
}

const nameFor = (items: { id: string; name?: string; full_name?: string }[], id: string): string =>
  items.find(item => item.id === id)?.name ||
  items.find(item => item.id === id)?.full_name ||
  '?'

const shiftStatusLabel = (status: string): string => {
  switch (status) {
    case 'live':      return 'Đang Live'
    case 'completed': return 'Hoàn thành'
    case 'scheduled': return 'Chưa bắt đầu'
    case 'preparing': return 'Đang chuẩn bị'
    case 'paused':    return 'Tạm dừng'
    case 'cancelled': return 'Đã hủy'
    default:          return status
  }
}

function AdminDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, users, registrations, filters } = props
  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end)
  const shiftIds = new Set(filteredShifts.map(shift => shift.id))

  const today = getCurrentBusinessDate()
  const todaysShifts = filteredShifts.filter(s => s.date === today)
  const liveCount = filteredShifts.filter(shift => shift.status === 'live').length

  const scopedReports = reports.filter(report => shiftIds.has(report.shift_id))
  const scopedRegistrations = registrations.filter(reg => shiftIds.has(reg.shift_id))
  const pendingCount = scopedRegistrations.filter(r => r.status === 'pending').length

  // Derive attention using existing domain helpers
  const dqIssues = getAllIssues({ shifts: filteredShifts, reports: scopedReports, registrations: scopedRegistrations })
  const errorCount = dqIssues.filter(i => i.severity === 'error').length
  const warningCount = dqIssues.filter(i => i.severity === 'warning').length
  const infoCount = dqIssues.filter(i => i.severity === 'info').length
  const rawAttention = deriveDataQualityAttention(errorCount, warningCount, infoCount)

  const dqAttentionForView = rawAttention.map(a => ({
    key: a.key,
    severity: (a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'high' : a.severity === 'attention' ? 'medium' : 'low') as 'critical' | 'high' | 'medium' | 'low',
    title: a.label,
    context: a.description ?? a.label,
    time: a.count != null ? `${a.count} mục` : '',
    action: 'Xem chi tiết',
  }))

  const todaysOperations = todaysShifts.map(s => ({
    brand: nameFor(brands, s.brand_id),
    shiftTime: `${s.start_time} - ${s.end_time}`,
    platform: nameFor(platforms, s.platform_id),
    status: shiftStatusLabel(s.status),
    statusColor: (s.status === 'live' ? 'red' : s.status === 'completed' ? 'green' : 'slate') as 'red' | 'green' | 'slate' | 'orange',
    metrics: '—',
    manager: nameFor(users, s.host_id || ''),
  }))

  const liveShifts = todaysShifts.filter(s => s.status === 'live').map(s => ({
    brand: nameFor(brands, s.brand_id),
    platform: nameFor(platforms, s.platform_id),
    duration: null,
    viewers: null,
    health: 'unknown' as const,
  }))

  return (
    <AdminDashboardView
      liveCount={liveCount}
      todaysShiftsCount={todaysShifts.length}
      missingStaffCount={null}
      pendingCount={pendingCount}
      dqAttention={dqAttentionForView}
      liveShifts={liveShifts}
      todaysOperations={todaysOperations}
      performance={null}
      activityLog={null}
    />
  )
}

function LeaderDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, campaigns, users, registrations, filters, swapRequests } = props
  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end)
  const shiftIds = new Set(filteredShifts.map(shift => shift.id))

  const today = getCurrentBusinessDate()
  const todaysShifts = filteredShifts.filter(shift => shift.date === today)
  const liveCount = filteredShifts.filter(s => s.status === 'live').length

  const pendingRegistrations = getLeaderPendingRegistrations(registrations, shiftIds)
  const pendingReports = getLeaderPendingReports(reports, shiftIds)
  const pendingSwaps = getLeaderPendingSwaps(swapRequests, shiftIds)

  // Derive action counts via existing swap UI helpers
  let actionableSwapCount = 0
  let waitingSwapCount = 0
  pendingSwaps.forEach(s => {
    const actions = getSwapUiActions(s, props.currentUser)
    if (actions.showAccept || actions.showCounterpartReject || actions.showApprove || actions.showReviewerReject) {
      actionableSwapCount++
    } else {
      waitingSwapCount++
    }
  })

  const dqIssues = getAllIssues({
    shifts: filteredShifts,
    reports: reports.filter(r => shiftIds.has(r.shift_id)),
    registrations: registrations.filter(r => shiftIds.has(r.shift_id)),
  })
  const dqErrorCount = dqIssues.filter(i => i.severity === 'error').length

  const attention = deriveLeaderAttention({
    pendingRegistrationCount: pendingRegistrations.length,
    actionableSwapCount,
    waitingSwapCount,
    pendingReportCount: pendingReports.length,
    dqErrorCount,
  })

  const totalPending = pendingRegistrations.length + actionableSwapCount

  // Build decision queue from real actionable items
  const decisions: import('./presentation/leader/LeaderDashboardView').DecisionItem[] = []
  if (pendingRegistrations.length > 0) {
    decisions.push({
      key: 'reg',
      type: 'registration',
      title: `${pendingRegistrations.length} đăng ký chờ duyệt`,
      subtitle: 'Nhân sự chờ xếp ca',
      time: 'Cần xử lý',
      action: 'Xem',
      iconBg: 'bg-emerald-50',
    })
  }
  if (actionableSwapCount > 0) {
    decisions.push({
      key: 'swap',
      type: 'swap',
      title: `${actionableSwapCount} yêu cầu đổi ca cần phê duyệt`,
      subtitle: 'Chờ phản hồi của bạn',
      time: 'Cần xử lý',
      action: 'Xem',
      iconBg: 'bg-amber-50',
    })
  }
  if (pendingReports.length > 0) {
    decisions.push({
      key: 'report',
      type: 'report',
      title: `${pendingReports.length} báo cáo chưa hoàn thành`,
      subtitle: 'Báo cáo nháp / đang xem xét',
      time: 'Cần xử lý',
      action: 'Xem',
      iconBg: 'bg-blue-50',
    })
  }
  if (dqErrorCount > 0) {
    decisions.push({
      key: 'dq',
      type: 'dq',
      title: `${dqErrorCount} lỗi chất lượng dữ liệu`,
      subtitle: 'Cần kiểm tra và sửa',
      time: 'Cần xử lý',
      action: 'Xem',
      iconBg: 'bg-red-50',
    })
  }

  const todaysSchedule = todaysShifts.map(s => ({
    time: `${s.start_time} - ${s.end_time}`,
    brand: nameFor(brands, s.brand_id),
    platform: nameFor(platforms, s.platform_id),
    status: shiftStatusLabel(s.status),
    statusColor: (s.status === 'live' ? 'red' : s.status === 'completed' ? 'green' : 'slate') as 'blue' | 'green' | 'orange' | 'red' | 'slate',
    // staffing truth cannot be safely derived without staffed-slot counting — set null
    staffing: null,
  }))

  // Upcoming live: first scheduled shift today
  const upcomingShifts = todaysShifts.filter(s => s.status === 'scheduled').sort((a, b) => a.start_time.localeCompare(b.start_time))
  const nextUp = upcomingShifts[0]
  let upcomingLive: import('./presentation/leader/LeaderDashboardView').UpcomingLiveItem | null = null
  if (nextUp) {
    const campaignName = nextUp.campaign_id ? nameFor(campaigns, nextUp.campaign_id) : null
    upcomingLive = {
      brand: nameFor(brands, nextUp.brand_id),
      campaign: campaignName !== '?' ? campaignName : null,
      title: `${nameFor(brands, nextUp.brand_id)} | ${nameFor(platforms, nextUp.platform_id)}`,
      timing: `Bắt đầu lúc ${nextUp.start_time}`,
      host: nameFor(users, nextUp.host_id || ''),
      support: nameFor(users, nextUp.support_id || ''),
      technical: nameFor(users, nextUp.technical_id || ''),
    }
  }

  void attention // attention derived but dashboard view doesn't yet consume AttentionSummary type directly

  return (
    <LeaderDashboardView
      liveCount={liveCount}
      todaysShiftsCount={todaysShifts.length}
      missingStaffCount={null}
      pendingCount={totalPending}
      decisions={decisions.length > 0 ? decisions : []}
      todaysSchedule={todaysSchedule}
      staffingHealth={null}
      upcomingLive={upcomingLive}
      activityLog={null}
    />
  )
}

function MemberDashboard(props: CommonProps) {
  const { shifts, brands, platforms, currentUser, swapRequests, registrations } = props
  const today = getCurrentBusinessDate()
  const myAssignedShifts = getMemberAssignedShifts(shifts, currentUser.id, registrations)
    .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))

  const upcomingShifts = myAssignedShifts.filter(s => s.date >= today)
  const nextUp = upcomingShifts[0]

  let nextShift: import('./presentation/member/MemberDashboardView').NextShiftData | null = null
  if (nextUp) {
    const memberRole = nextUp.host_id === currentUser.id ? 'Host' : nextUp.support_id === currentUser.id ? 'Support' : 'Technical'
    nextShift = {
      // startsIn: cannot compute countdown without current clock + timezone — set null
      startsIn: null,
      brand: nameFor(brands, nextUp.brand_id),
      platform: nameFor(platforms, nextUp.platform_id),
      time: `${nextUp.date} ${nextUp.start_time} – ${nextUp.end_time}`,
      role: memberRole,
      // studio field available on shift
      location: nextUp.studio ?? null,
    }
  }

  const mySchedule = myAssignedShifts.map(s => ({
    date: s.date,
    time: `${s.start_time} – ${s.end_time}`,
    brand: nameFor(brands, s.brand_id),
    platform: nameFor(platforms, s.platform_id),
    role: s.host_id === currentUser.id ? 'Host' : s.support_id === currentUser.id ? 'Support' : 'Technical',
  }))

  // myActions: use existing actionable swap data for member
  const myActionableSwaps = swapRequests.filter(s => {
    if (s.status !== 'pending' && s.status !== 'accepted') return false
    const actions = getSwapUiActions(s, currentUser)
    return actions.showAccept || actions.showCounterpartReject
  })

  const myActions: import('./presentation/member/MemberDashboardView').ActionEntry[] = myActionableSwaps.map(s => ({
    type: 'swap' as const,
    title: 'Yêu cầu đổi ca',
    time: s.created_at ? new Date(s.created_at).toLocaleDateString('vi-VN') : '—',
    description: 'Bạn có yêu cầu đổi ca cần phản hồi.',
  }))

  // myRequests: pending member registrations + member swap requests
  const myPendingRegs = registrations.filter(r => r.user_id === currentUser.id && r.status === 'pending')
  const mySwapRequests = swapRequests.filter(s => s.requester_id === currentUser.id || s.counterpart_id === currentUser.id)

  const myRequests: import('./presentation/member/MemberDashboardView').RequestEntry[] = [
    ...myPendingRegs.map(() => ({ type: 'registration' as const, title: 'Đăng ký ca', status: 'pending' as const })),
    ...mySwapRequests.filter(s => s.status === 'pending' || s.status === 'accepted').map(() => ({
      type: 'swap' as const,
      title: 'Yêu cầu đổi ca',
      status: 'pending' as const,
    })),
  ]

  return (
    <MemberDashboardView
      nextShift={nextShift}
      mySchedule={mySchedule}
      myActions={myActions}
      openShifts={null}
      myRequests={myRequests}
      notifications={null}
    />
  )
}
