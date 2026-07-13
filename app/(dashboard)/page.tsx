import { statsService, shiftService } from '@/lib/services/dataService'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, Calendar, Radio, FileText, AlertCircle, Users, Package, Megaphone } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export default async function DashboardPage() {
  const stats = await statsService.getDashboardStats()
  const todayShifts = await shiftService.getToday()
  const upcomingShifts = (await shiftService.getAll())
    .filter(s => s.status === 'scheduled')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
          Welcome back! 👋
        </h1>
        <p className="text-gray-600 text-lg">
          Here's what's happening with your livestream operations today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Today's Live Sessions
            </CardTitle>
            <Calendar className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.todayLive}</div>
            <p className="text-xs text-gray-500 mt-2">
              <Badge variant="secondary" className="text-xs">Scheduled</Badge>
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Revenue Today
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              ${stats.revenueToday.toLocaleString()}
            </div>
            <p className="text-xs text-green-600 mt-2 font-medium">
              From completed shifts
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Live In Progress
            </CardTitle>
            <Radio className="h-5 w-5 text-red-600 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.liveInProgress}</div>
            <p className="text-xs text-gray-500 mt-2">
              {stats.liveInProgress > 0 ? (
                <Badge variant="destructive" className="text-xs">Active</Badge>
              ) : (
                <span>No active sessions</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Staff
            </CardTitle>
            <Users className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.totalStaff}</div>
            <p className="text-xs text-gray-500 mt-2">Team members</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Brands
            </CardTitle>
            <Package className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.totalBrands}</div>
            <p className="text-xs text-gray-500 mt-2">Active brands</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Campaigns
            </CardTitle>
            <Megaphone className="h-5 w-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{stats.totalCampaigns}</div>
            <p className="text-xs text-gray-500 mt-2">Running campaigns</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Quick Actions</CardTitle>
          <CardDescription>Common tasks to get you started</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/calendar">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-2" data-testid="quick-action-calendar">
                <Calendar className="h-6 w-6" />
                <span className="text-sm font-medium">View Calendar</span>
              </Button>
            </Link>
            <Link href="/live">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-2" data-testid="quick-action-live">
                <Radio className="h-6 w-6" />
                <span className="text-sm font-medium">Live Monitor</span>
              </Button>
            </Link>
            <Link href="/staff">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-2" data-testid="quick-action-staff">
                <Users className="h-6 w-6" />
                <span className="text-sm font-medium">Manage Staff</span>
              </Button>
            </Link>
            <Link href="/brands">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-2" data-testid="quick-action-brands">
                <Package className="h-6 w-6" />
                <span className="text-sm font-medium">Manage Brands</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Shifts */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Upcoming Shifts</CardTitle>
              <CardDescription>Your scheduled livestreams</CardDescription>
            </div>
            <Link href="/calendar">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {upcomingShifts.length > 0 ? (
            <div className="space-y-4">
              {upcomingShifts.map((shift) => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:border-blue-300 hover:bg-blue-50/50 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">
                        {format(new Date(shift.date), 'd')}
                      </div>
                      <div className="text-xs text-gray-500 uppercase">
                        {format(new Date(shift.date), 'MMM')}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {shift.start_time} - {shift.end_time}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {shift.product_notes || 'No notes'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {shift.status}
                    </Badge>
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
