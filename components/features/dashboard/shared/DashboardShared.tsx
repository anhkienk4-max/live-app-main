import * as React from 'react'
import Link from 'next/link'
import { Filter, RotateCcw } from 'lucide-react'
import { Brand, Campaign, OperationalRole, Platform, Shift, ShiftRegistration, SwapRequest, User, Report } from '@/lib/types/database.types'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { isCanonicalAssignedShift } from '@/lib/ui/dashboard-role-data'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

export type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
export type Filters = { preset: Preset; start: string; end: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[] }

export type CommonProps = {
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
  onResetFilters: () => void
}

export const matchesRoleFilter = (shift: Shift, role: OperationalRole, userId: string, registrations: ShiftRegistration[]) => {
  const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
  return assignment === userId || isCanonicalAssignedShift(shift, role, userId, registrations)
}

export const matchesDimensions = (shift: Shift, filters: Filters, registrations: ShiftRegistration[]) =>
  matchesMultiSelect(shift.brand_id, filters.brandIds) &&
  matchesMultiSelect(shift.platform_id, filters.platformIds) &&
  matchesMultiSelect(shift.campaign_id, filters.campaignIds) &&
  (filters.hostIds.length === 0 || filters.hostIds.some(userId => matchesRoleFilter(shift, 'host', userId, registrations))) &&
  (filters.supportIds.length === 0 || filters.supportIds.some(userId => matchesRoleFilter(shift, 'support', userId, registrations))) &&
  (filters.technicalIds.length === 0 || filters.technicalIds.some(userId => matchesRoleFilter(shift, 'technical', userId, registrations)))

export const nameFor = (items: Array<{ id: string; name: string }>, id: string) => items.find(item => item.id === id)?.name || '�'

export function DashboardFilterControls({ filters, setPreset, showFilters, setShowFilters, t }: { filters: Filters; setPreset: (preset: Preset) => void; showFilters: boolean; setShowFilters: (v: boolean) => void; t: (key: string) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.preset} onValueChange={value => setPreset(value as Preset)}>
        <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="today">{t('today')}</SelectItem>
          <SelectItem value="yesterday">{t('yesterday')}</SelectItem>
          <SelectItem value="7d">{t('last7Days')}</SelectItem>
          <SelectItem value="30d">{t('last30Days')}</SelectItem>
          <SelectItem value="thisMonth">{t('thisMonth')}</SelectItem>
          <SelectItem value="lastMonth">{t('lastMonth')}</SelectItem>
          <SelectItem value="custom">{t('customRange')}</SelectItem>
        </SelectContent>
      </Select>
      <Button variant={showFilters ? 'secondary' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="dashboard-filter-panel">
        <Filter className="mr-2 h-4 w-4" />{t('filters')}
      </Button>
    </div>
  )
}

export function DashboardCustomDateRange({ filters, setFilters, t }: { filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters | null>>; t: (key: string) => string }) {
  if (filters.preset !== 'custom') return null
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
      <label className="flex items-center gap-2 text-sm font-medium">{t('startDate')}<Input className="w-auto h-8" type="date" value={filters.start} onChange={event => setFilters(current => current ? { ...current, start: event.target.value } : current)} /></label>
      <label className="flex items-center gap-2 text-sm font-medium">{t('endDate')}<Input className="w-auto h-8" type="date" value={filters.end} onChange={event => setFilters(current => current ? { ...current, end: event.target.value } : current)} /></label>
    </div>
  )
}

export function DashboardFilterPanel({ filters, setFilters, brands, platforms, campaigns, roleOptions, t, onResetFilters }: { filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters | null>>; brands: Brand[]; platforms: Platform[]; campaigns: Campaign[]; roleOptions: (role: 'host' | 'support' | 'technical') => {id: string, name: string}[]; t: (key: string) => string; onResetFilters: () => void }) {
  return (
    <Card id="dashboard-filter-panel">
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <FilterSelect label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => current ? { ...current, brandIds: value } : current)} />
          <FilterSelect label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => current ? { ...current, platformIds: value } : current)} />
          <FilterSelect label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaignIds: value } : current)} />
          <FilterSelect label={t('host')} value={filters.hostIds} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, hostIds: value } : current)} />
          <FilterSelect label={t('support')} value={filters.supportIds} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, supportIds: value } : current)} />
          <FilterSelect label={t('technical')} value={filters.technicalIds} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technicalIds: value } : current)} />
        </div>
        <Button variant="ghost" onClick={() => onResetFilters()} size="sm" className="h-8">
          <RotateCcw className="mr-2 h-3 w-3" />{t('resetFilters')}
        </Button>
      </CardContent>
    </Card>
  )
}

export function UpcomingShiftsList({ upcoming, brands, platforms, t, title, setSelectedShift }: { upcoming: Shift[]; brands: Brand[]; platforms: Platform[]; t: (key: string) => string; title?: string; setSelectedShift: (shift: Shift | null) => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b mb-3">
        <div><h2 className="text-[15px] font-semibold">{title || t('upcomingShifts')}</h2></div>
        <Button nativeButton={false} render={<Link href="/calendar" />} variant="ghost" size="sm" className="h-8 text-[13px]">{t('viewAll')}</Button>
      </div>
      <div className="flex-1">
        {upcoming.length ? (
          <div className="divide-y">
            {upcoming.map(shift => (
              <button type="button" className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-3 sm:py-2 text-left hover:bg-muted/30 transition-colors min-h-[48px]" key={shift.id} onClick={() => setSelectedShift(shift)}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{shift.title || nameFor(brands, shift.brand_id)}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{shift.date}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span>{formatShiftTimeRange(shift)}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span>{nameFor(platforms, shift.platform_id)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 justify-end">
                  <Badge variant="secondary" className="text-xs font-normal bg-muted/50 text-muted-foreground">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {t(shift.status === 'live' ? 'liveStatus' : shift.status as any)}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-8"><Empty text={t('noMatchingShifts')} /></div>
        )}
      </div>
    </div>
  )
}

export function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}

export function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Button nativeButton={false} render={<Link href={href} />} variant="outline" className="h-20 flex-col gap-1.5 bg-muted/20">
      {icon}<span className="text-xs">{label}</span>
    </Button>
  )
}

export function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div>
}
