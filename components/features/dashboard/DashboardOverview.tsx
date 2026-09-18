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
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'

import { Filters, Preset } from './shared/DashboardShared'
import { AdminDashboard } from './roles/AdminDashboard'
import { LeaderDashboard } from './roles/LeaderDashboard'
import { MemberDashboard } from './roles/MemberDashboard'

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

export const initialFilters = (): Filters => ({ preset: '30d', ...rangeFor('30d'), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [] })

export function DashboardOverview() {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [reports, setReports] = React.useState<Report[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [swapRequests, setSwapRequests] = React.useState<SwapRequest[]>([])
  const [filters, setFilters] = React.useState<Filters | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [loadError, setLoadError] = React.useState<unknown>(null)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [loadedShifts, loadedReports, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers, loadedRegistrations, loadedSwaps] = await Promise.all([
        shiftService.getAll(), reportService.getAll(), brandService.getAll(), platformService.getAll(), campaignService.getAll(), userService.getAll(), shiftRegistrationService.getAll(), swapRequestService.getAll(),
      ])
      setShifts(loadedShifts); setReports(loadedReports); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns); setUsers(loadedUsers); setRegistrations(loadedRegistrations); setSwapRequests(loadedSwaps);
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setFilters(initialFilters())
      void loadData()
    })
    return () => cancelAnimationFrame(frame)
  }, [loadData])

  const initialLoad = !filters || !currentUser || (loading && shifts.length === 0)
  if (initialLoad) return <ContentSkeleton />
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />

  const role = resolveSystemPermission(currentUser)
  const setPreset = (preset: Preset) => setFilters(current => current ? { ...current, preset, ...(preset === 'custom' ? {} : rangeFor(preset)) } : current)
  const onResetFilters = () => setFilters(initialFilters())
  const dataProps = { shifts, reports, brands, platforms, campaigns, users, registrations, swapRequests, filters, setFilters, showFilters, setShowFilters, currentUser, t, setPreset, onResetFilters }

  return (
    <div className={loading ? 'opacity-50 pointer-events-none transition-opacity duration-200' : 'transition-opacity duration-200'}>
      {role === 'admin' && <AdminDashboard {...dataProps} setSelectedShift={setSelectedShift} />}
      {role === 'leader' && <LeaderDashboard {...dataProps} setSelectedShift={setSelectedShift} />}
      {role === 'member' && <MemberDashboard {...dataProps} setSelectedShift={setSelectedShift} />}
      {selectedShift && (
        <ShiftDetailModal open shift={selectedShift} brands={brands} platforms={platforms} campaigns={campaigns} users={users} allRegistrations={registrations} onOpenChange={(open) => !open && setSelectedShift(null)} onUpdate={loadData} onDelete={() => { setSelectedShift(null); void loadData() }} />
      )}
    </div>
  )
}
