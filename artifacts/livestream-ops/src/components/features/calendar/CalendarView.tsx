

import * as React from 'react'
import { shiftService, brandService, platformService, campaignService, userService } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User } from '@/lib/types/database.types'
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
import { ShiftDetailModal } from '../shifts/ShiftDetailModal'

export function CalendarView() {
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const [view, setView] = React.useState<'month' | 'week' | 'day' | 'list'>('month')
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [filters, setFilters] = React.useState({
    brand: 'all',
    platform: 'all',
    status: 'all',
    host: 'all'
  })

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [shiftsData, brandsData, platformsData, campaignsData, usersData] = await Promise.all([
      shiftService.getAll(),
      brandService.getAll(),
      platformService.getAll(),
      campaignService.getAll(),
      userService.getAll()
    ])
    setShifts(shiftsData)
    setBrands(brandsData)
    setPlatforms(platformsData)
    setCampaigns(campaignsData)
    setUsers(usersData)
    setLoading(false)
  }

  const filteredShifts = React.useMemo(() => {
    return shifts.filter(shift => {
      // Brand filter
      if (filters.brand !== 'all' && shift.brand_id !== filters.brand) return false
      
      // Platform filter
      if (filters.platform !== 'all' && shift.platform_id !== filters.platform) return false
      
      // Status filter
      if (filters.status !== 'all' && shift.status !== filters.status) return false
      
      // Host filter
      if (filters.host !== 'all' && shift.host_id !== filters.host) return false
      
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
  }, [shifts, filters, searchTerm, brands, platforms])

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
    setFilters({ brand: 'all', platform: 'all', status: 'all', host: 'all' })
    setSearchTerm('')
  }

  const hasActiveFilters = filters.brand !== 'all' || filters.platform !== 'all' || filters.status !== 'all' || filters.host !== 'all' || searchTerm !== ''

  const getViewTitle = () => {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy')
      case 'week':
        return `Week of ${format(currentDate, 'MMM d, yyyy')}`
      case 'day':
        return format(currentDate, 'MMMM d, yyyy')
      case 'list':
        return 'All Shifts'
      default:
        return format(currentDate, 'MMMM yyyy')
    }
  }

  if (loading) return <div className="text-center py-12">Loading calendar...</div>

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-600">Total Shifts</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Live Now</div>
          <div className="text-2xl font-bold text-red-600">{stats.running}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Scheduled</div>
          <div className="text-2xl font-bold text-blue-600">{stats.upcoming}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Completed</div>
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">Today</div>
          <div className="text-2xl font-bold">{stats.todayShifts}</div>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search shifts by brand, platform, or notes..."
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
              Filters
              {hasActiveFilters && <span className="ml-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">{Object.values(filters).filter(v => v !== 'all').length + (searchTerm ? 1 : 0)}</span>}
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Shift
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-4 gap-4 pt-4 border-t">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Brand</label>
                <Select value={filters.brand} onValueChange={(value) => setFilters({ ...filters, brand: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Platform</label>
                <Select value={filters.platform} onValueChange={(value) => setFilters({ ...filters, platform: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {platforms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
                <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Host</label>
                <Select value={filters.host} onValueChange={(value) => setFilters({ ...filters, host: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Hosts</SelectItem>
                    {users.filter(u => u.department === 'Live Host').map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="col-span-4">
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X className="h-3 w-3 mr-2" />
                    Clear All Filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Calendar Controls */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          {view !== 'list' && (
            <>
              <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <h2 className="text-xl font-bold min-w-[250px] flex items-center">
            <CalendarIcon className="h-5 w-5 mr-2" />
            {getViewTitle()}
          </h2>
        </div>

        <div className="flex border rounded-lg">
          <Button variant={view === 'month' ? 'default' : 'ghost'} size="sm" onClick={() => setView('month')}>
            <LayoutGrid className="h-4 w-4 mr-2" />
            Month
          </Button>
          <Button variant={view === 'week' ? 'default' : 'ghost'} size="sm" onClick={() => setView('week')}>
            Week
          </Button>
          <Button variant={view === 'day' ? 'default' : 'ghost'} size="sm" onClick={() => setView('day')}>
            <Clock className="h-4 w-4 mr-2" />
            Day
          </Button>
          <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setView('list')}>
            <List className="h-4 w-4 mr-2" />
            List
          </Button>
        </div>
      </div>

      {/* Calendar Views */}
      <Card className="p-6">
        {view === 'month' && <MonthView currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} onShiftClick={setSelectedShift} />}
        {view === 'week' && <WeekView currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} onShiftClick={setSelectedShift} />}
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
