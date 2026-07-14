import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { statsService, shiftService } from '@/lib/services/dataService'
import { Shift } from '@/lib/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, Calendar, Radio, FileText, AlertCircle, Users, Package, Megaphone } from 'lucide-react'
import { format } from 'date-fns'

interface DashboardStats {
  todayLive: number
  revenueToday: number
  reportsSubmitted: number
  liveInProgress: number
  pendingDashboardUpdates: number
  pendingSwaps: number
  totalStaff: number
  totalBrands: number
  totalCampaigns: number
  completedShifts: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [upcomingShifts, setUpcomingShifts] = useState<Shift[]>([])
  const [todayShifts, setTodayShifts] = useState<Shift[]>([])

  useEffect(() => {
    const load = async () => {
      const [s, today, all] = await Promise.all([
        statsService.getDashboardStats(),
        shiftService.getToday(),
        shiftService.getAll(),
      ])
      setStats(s)
      setTodayShifts(today)
      setUpcomingShifts(
        all.filter(s => s.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
      )
    }
    load()
  }, [])

  if (!stats) return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Welcome back! 👋</h1>
        <p className="text-gray-600 text-lg">Here's what's happening with your livestream operations today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Today's Live Sessions</CardTitle>
            <Calendar className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.todayLive}</div>
            <div className="text-xs text-gray-500 mt-2"><Badge variant="secondary" className="text-xs">Scheduled</Badge></div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Revenue Today</CardTitle>
            <TrendingUp className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">${stats.revenueToday.toLocaleString()}</div>
            <p className="text-xs text-green-600 mt-2 font-medium">From completed shifts</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Live In Progress</CardTitle>
            <Radio className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.liveInProgress}</div>
            {stats.liveInProgress > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <p className="text-xs text-red-500 font-medium">Live now</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Reports Submitted</CardTitle>
            <FileText className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.reportsSubmitted}</div>
            <p className="text-xs text-gray-500 mt-2">Total submitted</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Swaps</CardTitle>
            <AlertCircle className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.pendingSwaps}</div>
            <p className="text-xs text-yellow-600 mt-2 font-medium">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Staff</CardTitle>
            <Users className="h-5 w-5 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.totalStaff}</div>
            <p className="text-xs text-gray-500 mt-2">Active team members</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 text-center">
            <Package className="h-6 w-6 mx-auto mb-2 text-blue-600" />
            <div className="text-2xl font-bold">{stats.totalBrands}</div>
            <p className="text-xs text-gray-500">Brands</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 text-center">
            <Megaphone className="h-6 w-6 mx-auto mb-2 text-pink-600" />
            <div className="text-2xl font-bold">{stats.totalCampaigns}</div>
            <p className="text-xs text-gray-500">Campaigns</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 text-center">
            <FileText className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <div className="text-2xl font-bold">{stats.completedShifts}</div>
            <p className="text-xs text-gray-500">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Shifts */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Upcoming Shifts</CardTitle>
              <CardDescription>Next scheduled live sessions</CardDescription>
            </div>
            <Link href="/calendar">
              <Button variant="outline" size="sm">View Calendar</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {upcomingShifts.length > 0 ? (
            <div className="space-y-4">
              {upcomingShifts.map((shift) => (
                <div key={shift.id} className="flex items-center justify-between p-4 rounded-lg border hover:border-blue-300 hover:bg-blue-50/50 transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{format(new Date(shift.date), 'd')}</div>
                      <div className="text-xs text-gray-500 uppercase">{format(new Date(shift.date), 'MMM')}</div>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{shift.start_time} - {shift.end_time}</p>
                      <p className="text-sm text-gray-600 mt-1">{shift.product_notes || 'No notes'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{shift.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-sm">No upcoming shifts</p>
              <Link href="/calendar">
                <Button variant="link" className="mt-2">Create a shift</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
