

import * as React from 'react'
import { shiftService, brandService, platformService, campaignService, userService, dashboardUpdateService } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User, DashboardUpdate } from '@/lib/types/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Radio, Clock, TrendingUp, Users, FileText, AlertCircle, DollarSign } from 'lucide-react'
import { format, differenceInMinutes, parseISO } from 'date-fns'
import { LiveSessionModal } from './LiveSessionModal'
import { DashboardUpdateModal } from './DashboardUpdateModal'

export function LiveMonitoringDashboard() {
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [liveShifts, setLiveShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [updateShift, setUpdateShift] = React.useState<Shift | null>(null)
  const [loading, setLoading] = React.useState(true)

  const loadData = React.useCallback(async () => {
    const [shiftsData, brandsData, platformsData, campaignsData, usersData] = await Promise.all([
      shiftService.getAll(),
      brandService.getAll(),
      platformService.getAll(),
      campaignService.getAll(),
      userService.getAll(),
    ])
    setShifts(shiftsData)
    setLiveShifts(shiftsData.filter(s => s.status === 'live'))
    setBrands(brandsData)
    setPlatforms(platformsData)
    setCampaigns(campaignsData)
    setUsers(usersData)
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  React.useEffect(() => {
    const interval = setInterval(loadData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [loadData])

  const stats = React.useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const todayShifts = shifts.filter(s => s.date === today)
    
    return {
      activeLive: liveShifts.length,
      totalRevenueToday: 0, // TODO: Calculate from reports
      ordersToday: 0,
      reportsPending: todayShifts.filter(s => s.status === 'completed').length,
      dashboardUpdatesMissing: liveShifts.length, // TODO: Calculate based on time
    }
  }, [shifts, liveShifts])

  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'
  const getUserName = (id?: string) => id ? users.find(u => u.id === id)?.full_name || 'Unassigned' : 'Unassigned'

  if (loading) return <div className="text-center py-12">Loading live monitoring...</div>

  return (
    <>
      <div className="space-y-6">
        {/* Analytics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-0 shadow-md bg-gradient-to-br from-red-50 to-red-100">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-red-900">Active Live</CardTitle>
                <Radio className="h-5 w-5 text-red-600 animate-pulse" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-700">{stats.activeLive}</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Revenue Today</CardTitle>
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">${stats.totalRevenueToday.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Orders Today</CardTitle>
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{stats.ordersToday}</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Reports Pending</CardTitle>
                <FileText className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{stats.reportsPending}</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Updates Missing</CardTitle>
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{stats.dashboardUpdatesMissing}</div>
            </CardContent>
          </Card>
        </div>

        {/* Live Sessions */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Active Live Sessions</h2>
          {liveShifts.length === 0 ? (
            <Card className="p-12 text-center">
              <Radio className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium text-gray-600">No Active Live Sessions</p>
              <p className="text-sm text-gray-500 mt-2">Live sessions will appear here automatically</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {liveShifts.map((shift) => (
                <Card
                  key={shift.id}
                  className="border-2 hover:shadow-xl transition-all cursor-pointer"
                  style={{ borderColor: getBrandColor(shift.brand_id) }}
                  onClick={() => setSelectedShift(shift)}
                >
                  <CardHeader className="pb-3" style={{ backgroundColor: getBrandColor(shift.brand_id) + '10' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge variant="destructive" className="mb-2 animate-pulse">
                          <Radio className="h-3 w-3 mr-1" />
                          LIVE
                        </Badge>
                        <CardTitle className="text-lg">{getBrandName(shift.brand_id)}</CardTitle>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">{getPlatformName(shift.platform_id)}</div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-gray-500 text-xs">Time</div>
                        <div className="font-medium">{shift.start_time} - {shift.end_time}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">Duration</div>
                        <div className="font-medium">2h 30m</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">Host</div>
                        <div className="font-medium truncate">{getUserName(shift.host_id)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">Support</div>
                        <div className="font-medium truncate">{getUserName(shift.support_id)}</div>
                      </div>
                    </div>

                    <div className="pt-3 border-t space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Revenue</span>
                        <span className="font-bold text-green-600">$5,420</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Orders</span>
                        <span className="font-bold">89</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Viewers</span>
                        <span className="font-bold">1,250</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t">
                      <div className="text-xs text-gray-500 mb-2">Next Update In</div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-orange-600" />
                        <span className="font-bold text-orange-600">12:45</span>
                      </div>
                    </div>

                    <Button
                      className="w-full mt-3"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setUpdateShift(shift)
                      }}
                    >
                      Submit Dashboard Update
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedShift && (
        <LiveSessionModal
          open={!!selectedShift}
          onOpenChange={(open) => !open && setSelectedShift(null)}
          shift={selectedShift}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          onUpdate={loadData}
        />
      )}

      {updateShift && (
        <DashboardUpdateModal
          open={!!updateShift}
          onOpenChange={(open) => !open && setUpdateShift(null)}
          shift={updateShift}
          onSuccess={loadData}
        />
      )}
    </>
  )
}
