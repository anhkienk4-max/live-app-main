'use client'

import * as React from 'react'
import { shiftRegistrationService, shiftService, brandService, platformService, campaignService, userService, reportService, isStaffedRegistration } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User, OperationalRole, ShiftRegistration, Report } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, LayoutGrid, List, Clock, Calendar as CalendarIcon, Search, Filter, Plus, X } from 'lucide-react'
import { format, addMonths, addWeeks, addDays } from 'date-fns'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from './DayView'
import { ListView } from './ListView'
import { ShiftFormModal } from '../shifts/ShiftFormModal'
import { ShiftFormDialog } from '../shifts/ShiftFormDialog'
import { ShiftDetailModal } from '../shifts/ShiftDetailModal'
import { DaySessionsDialog } from './DaySessionsDialog'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { enUS, vi } from 'date-fns/locale'

export function CalendarView({ createRequest = 0 }: { createRequest?: number }) {
  const { currentUser } = useCurrentUser()
  const { language, t } = useTranslation()
  const dateLocale = language === 'vi' ? vi : enUS
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const [view, setView] = React.useState<'month' | 'week' | 'day' | 'list'>('month')
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [reports, setReports] = React.useState<Report[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null)
  const [editingShift, setEditingShift] = React.useState<Shift | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [filters, setFilters] = React.useState({
    brand: 'all',
    platform: 'all',
    campaign: 'all',
    status: 'all',
    host: 'all',
    support: 'all',
    technical: 'all'
  })

  React.useEffect(() => {
    loadData()
  }, [])

  React.useEffect(() => {
    if (createRequest > 0) setShowForm(true)
  }, [createRequest])

  const loadData = async () => {
    const [shiftsData, brandsData, platformsData, campaignsData, usersData, registrationsData, reportsData] = await Promise.all([
      shiftService.getAll(),
      brandService.getAll(),
      platformService.getAll(),
      campaignService.getAll(),
      userService.getAll(),
      shiftRegistrationService.getAll(),
      reportService.getAll(),
    ])
    setShifts(shiftsData)
    setBrands(brandsData)
    setPlatforms(platformsData)
    setCampaigns(campaignsData)
    setUsers(usersData)
    setRegistrations(registrationsData)
    setReports(reportsData)
    setLoading(false)
  }

  const filteredShifts = React.useMemo(() => {
    const matchesRole = (shift: Shift, role: OperationalRole, userId: string) => {
      const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
      return assignment === userId || registrations.some(registration =>
        registration.shift_id === shift.id &&
        registration.user_id === userId &&
        registration.operational_role === role &&
        isStaffedRegistration(registration)
      )
    }
    return shifts.filter(shift => {
      // Brand filter
      if (filters.brand !== 'all' && shift.brand_id !== filters.brand) return false
      
      // Platform filter
      if (filters.platform !== 'all' && shift.platform_id !== filters.platform) return false
      if (filters.campaign !== 'all' && shift.campaign_id !== filters.campaign) return false
      
      // Status filter
      if (filters.status !== 'all' && shift.status !== filters.status) return false
      
      // Host filter
      if (filters.host !== 'all' && !matchesRole(shift, 'host', filters.host)) return false
      if (filters.support !== 'all' && !matchesRole(shift, 'support', filters.support)) return false
      if (filters.technical !== 'all' && !matchesRole(shift, 'technical', filters.technical)) return false
      
      // Search filter
      if (searchTerm) {
        const brand = brands.find(b => b.id === shift.brand_id)
        const platform = platforms.find(p => p.id === shift.platform_id)
        const searchLower = searchTerm.toLowerCase()
        
        const matchesBrand = brand?.name.toLowerCase().includes(searchLower)
        const matchesPlatform = platform?.name.toLowerCase().includes(searchLower)
        const matchesNotes = shift.product_notes?.toLowerCase().includes(searchLower)
        
        if (!matchesBrand && !matchesPlatform && !matchesNotes) return false
      }
      
      return true
    })
  }, [shifts, filters, searchTerm, brands, platforms, registrations])

  const stats = React.useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return {
      total: filteredShifts.length,
      running: filteredShifts.filter(s => s.status === 'live').length,
      upcoming: filteredShifts.filter(s => s.status === 'scheduled').length,
      completed: filteredShifts.filter(s => s.status === 'completed').length,
      todayShifts: filteredShifts.filter(s => s.date === today).length,
    }
  }, [filteredShifts])

  const navigate = (direction: 'prev' | 'next') => {
    if (view === 'month') {
      setCurrentDate(direction === 'prev' ? addMonths(currentDate, -1) : addMonths(currentDate, 1))
    } else if (view === 'week') {
      setCurrentDate(direction === 'prev' ? addWeeks(currentDate, -1) : addWeeks(currentDate, 1))
    } else if (view === 'day') {
      setCurrentDate(direction === 'prev' ? addDays(currentDate, -1) : addDays(currentDate, 1))
    }
  }

  const clearFilters = () => {
    setFilters({ brand: 'all', platform: 'all', campaign: 'all', status: 'all', host: 'all', support: 'all', technical: 'all' })
    setSearchTerm('')
  }

  const hasActiveFilters = Object.values(filters).some(value => value !== 'all') || searchTerm !== ''

  const getViewTitle = () => {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: dateLocale })
      case 'week':
        return t('weekOf', { date: format(currentDate, 'PP', { locale: dateLocale }) })
      case 'day':
        return format(currentDate, 'PPPP', { locale: dateLocale })
      case 'list':
        return t('allShifts')
      default:
        return format(currentDate, 'MMMM yyyy', { locale: dateLocale })
    }
  }

  if (loading) return <div className="text-center py-12">{t('loading')}</div>

  return (
    <div className="min-w-0 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 xl:gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('totalShifts')}</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('liveNow')}</div>
          <div className="text-2xl font-bold text-red-600">{stats.running}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('scheduled')}</div>
          <div className="text-2xl font-bold text-blue-600">{stats.upcoming}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('completed')}</div>
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('today')}</div>
          <div className="text-2xl font-bold">{stats.todayShifts}</div>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('searchShifts')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button 
              variant={showFilters ? 'default' : 'outline'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {t('filters')}
              {hasActiveFilters && <span className="ml-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">{Object.values(filters).filter(v => v !== 'all').length + (searchTerm ? 1 : 0)}</span>}
            </Button>
            {hasPermission(currentUser, 'shifts.assign_staff') && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('newShift')}
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('brand')}</label>
                <Select value={filters.brand} onValueChange={(value) => setFilters({ ...filters, brand: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')} {t('brands')}</SelectItem>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('platform')}</label>
                <Select value={filters.platform} onValueChange={(value) => setFilters({ ...filters, platform: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')} {t('platforms')}</SelectItem>
                    {platforms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('campaign')}</label>
                <Select value={filters.campaign} onValueChange={(value) => setFilters({ ...filters, campaign: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">{t('all')} {t('campaigns')}</SelectItem>{campaigns.map(campaign => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('status')}</label>
                <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')}</SelectItem>
                    <SelectItem value="scheduled">{t('scheduled')}</SelectItem>
                    <SelectItem value="preparing">{t('preparing')}</SelectItem>
                    <SelectItem value="live">{t('liveStatus')}</SelectItem>
                    <SelectItem value="paused">{t('paused')}</SelectItem>
                    <SelectItem value="completed">{t('completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('host')}</label>
                <Select value={filters.host} onValueChange={(value) => setFilters({ ...filters, host: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')} {t('host')}</SelectItem>
                    {users.filter(u => u.operational_roles?.includes('host') || u.department === 'Live Host').map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('support')}</label>
                <Select value={filters.support} onValueChange={(value) => setFilters({ ...filters, support: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">{t('all')} {t('support')}</SelectItem>{users.filter(u => u.operational_roles?.includes('support') || u.department === 'Live Support').map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('technical')}</label>
                <Select value={filters.technical} onValueChange={(value) => setFilters({ ...filters, technical: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">{t('all')} {t('technical')}</SelectItem>{users.filter(u => u.operational_roles?.includes('technical')).map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X className="h-3 w-3 mr-2" />
                    {t('resetFilters')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Calendar Controls */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {view !== 'list' && (
            <>
              <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
                {t('today')}
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <h2 className="flex min-w-0 items-center text-lg font-bold sm:text-xl">
            <CalendarIcon className="h-5 w-5 mr-2" />
            {getViewTitle()}
          </h2>
        </div>

        <div className="flex w-fit max-w-full overflow-x-auto rounded-lg border">
          <Button variant={view === 'month' ? 'default' : 'ghost'} size="sm" onClick={() => setView('month')}>
            <LayoutGrid className="h-4 w-4 mr-2" />
            {t('month')}
          </Button>
          <Button variant={view === 'week' ? 'default' : 'ghost'} size="sm" onClick={() => setView('week')}>
            {t('week')}
          </Button>
          <Button variant={view === 'day' ? 'default' : 'ghost'} size="sm" onClick={() => setView('day')}>
            <Clock className="h-4 w-4 mr-2" />
            {t('day')}
          </Button>
          <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setView('list')}>
            <List className="h-4 w-4 mr-2" />
            {t('list')}
          </Button>
        </div>
      </div>

      {/* Calendar Views */}
      <Card className="min-w-0 overflow-hidden p-3 sm:p-6">
        {view === 'month' && <div className="max-w-full overflow-x-auto"><div className="min-w-[760px]"><MonthView currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} onShiftClick={setSelectedShift} onDayClick={setSelectedDay} /></div></div>}
        {view === 'week' && <div className="max-w-full overflow-x-auto"><div className="min-w-[760px]"><WeekView currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} onShiftClick={setSelectedShift} /></div></div>}
        {view === 'day' && <DayView currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} users={users} onShiftClick={setSelectedShift} />}
        {view === 'list' && <ListView shifts={filteredShifts} brands={brands} platforms={platforms} users={users} onShiftClick={setSelectedShift} />}
      </Card>

      {/* Modals */}
      {showForm && (
        <ShiftFormModal
          open={showForm}
          onOpenChange={setShowForm}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          onSuccess={() => {
            loadData()
            setShowForm(false)
          }}
        />
      )}

      {editingShift && (
        <ShiftFormDialog
          open={!!editingShift}
          onOpenChange={(open) => !open && setEditingShift(null)}
          shift={editingShift}
          duplicateFrom={null}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          templates={[]}
          onSuccess={() => {
            void loadData()
            setEditingShift(null)
          }}
        />
      )}

      <DaySessionsDialog
        open={!!selectedDay}
        date={selectedDay}
        shifts={filteredShifts}
        brands={brands}
        platforms={platforms}
        campaigns={campaigns}
        users={users}
        registrations={registrations}
        reports={reports}
        currentUser={currentUser}
        onOpenChange={(open) => !open && setSelectedDay(null)}
        onViewShift={(shift) => {
          setSelectedDay(null)
          setSelectedShift(shift)
        }}
        onEditShift={(shift) => {
          setSelectedDay(null)
          setEditingShift(shift)
        }}
        onChanged={loadData}
      />

      {selectedShift && (
        <ShiftDetailModal
          open={!!selectedShift}
          onOpenChange={(open) => !open && setSelectedShift(null)}
          shift={selectedShift}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          onUpdate={loadData}
          onDelete={() => {
            loadData()
            setSelectedShift(null)
          }}
        />
      )}
    </div>
  )
}
