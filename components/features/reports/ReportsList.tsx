'use client'

import * as React from 'react'
import { reportService, shiftService, brandService, platformService, userService } from '@/lib/services/dataService'
import { Report, Shift, Brand, Platform, User } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'
import { FileText, Plus, Search, Filter, Eye, TrendingUp, Users, DollarSign } from 'lucide-react'
import { ReportFormModal } from './ReportFormModal'
import { ReportDetailModal } from './ReportDetailModal'

export function ReportsList() {
  const [reports, setReports] = React.useState<Report[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedReport, setSelectedReport] = React.useState<Report | null>(null)
  const [showForm, setShowForm] = React.useState(false)
  const [completedShifts, setCompletedShifts] = React.useState<Shift[]>([])

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [reportsData, shiftsData, brandsData, platformsData, usersData] = await Promise.all([
      reportService.getAll(),
      shiftService.getAll(),
      brandService.getAll(),
      platformService.getAll(),
      userService.getAll()
    ])
    setReports(reportsData)
    setShifts(shiftsData)
    setBrands(brandsData)
    setPlatforms(platformsData)
    setUsers(usersData)
    
    // Filter completed shifts without reports
    const shiftsWithoutReports = shiftsData.filter(s => 
      s.status === 'completed' && !reportsData.find(r => r.shift_id === s.id)
    )
    setCompletedShifts(shiftsWithoutReports)
    setLoading(false)
  }

  const getShift = (shiftId: string) => shifts.find(s => s.id === shiftId)
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'

  const filteredReports = reports.filter(report => {
    if (!searchTerm) return true
    const shift = getShift(report.shift_id)
    if (!shift) return false
    const brandName = getBrandName(shift.brand_id).toLowerCase()
    return brandName.includes(searchTerm.toLowerCase()) ||
           report.shift_id.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const stats = React.useMemo(() => {
    return {
      totalReports: reports.length,
      totalRevenue: reports.reduce((sum, r) => sum + r.revenue, 0),
      averageRevenue: reports.length > 0 ? reports.reduce((sum, r) => sum + r.revenue, 0) / reports.length : 0,
      pendingReports: completedShifts.length
    }
  }, [reports, completedShifts])

  if (loading) {
    return <div className="text-center py-12">Loading reports...</div>
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{stats.totalReports}</div>
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-green-600">${stats.totalRevenue.toLocaleString()}</div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Average Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">${stats.averageRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-orange-600">{stats.pendingReports}</div>
              <FileText className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Reports Alert */}
      {completedShifts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-orange-900">{completedShifts.length} Completed Shifts Awaiting Reports</div>
                <div className="text-sm text-orange-700 mt-1">Submit final reports for completed live sessions</div>
              </div>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Submit Report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search reports by brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      {filteredReports.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <div className="text-lg font-medium text-gray-600">No Reports Found</div>
            <div className="text-sm text-gray-500 mt-2">
              {searchTerm ? 'Try adjusting your search criteria' : 'Submit reports for completed live sessions'}
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map((report) => {
            const shift = getShift(report.shift_id)
            if (!shift) return null

            return (
              <Card 
                key={report.id} 
                className="cursor-pointer hover:shadow-lg transition-all"
                onClick={() => setSelectedReport(report)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{format(new Date(report.created_at), 'MMM d, yyyy')}</Badge>
                    <Badge className="bg-green-100 text-green-800">Submitted</Badge>
                  </div>
                  <CardTitle className="text-lg mt-2">{getBrandName(shift.brand_id)}</CardTitle>
                  <div className="text-sm text-gray-600">{getPlatformName(shift.platform_id)}</div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-600">Revenue</div>
                      <div className="text-xl font-bold text-green-600">${report.revenue.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Orders</div>
                      <div className="text-xl font-bold">{report.orders}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-4 border-t">
                    <div>
                      <div className="text-xs text-gray-600">Peak Viewers</div>
                      <div className="font-bold">{report.peak_viewer}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Avg Viewers</div>
                      <div className="font-bold">{report.average_viewer}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Engagement</div>
                      <div className="font-bold">{report.likes + report.comments}</div>
                    </div>
                  </div>

                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedReport(report)
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <ReportFormModal
          open={showForm}
          onOpenChange={setShowForm}
          completedShifts={completedShifts}
          brands={brands}
          platforms={platforms}
          onSuccess={() => {
            loadData()
            setShowForm(false)
          }}
        />
      )}

      {selectedReport && (
        <ReportDetailModal
          open={!!selectedReport}
          onOpenChange={(open) => !open && setSelectedReport(null)}
          report={selectedReport}
          shift={getShift(selectedReport.shift_id)!}
          brands={brands}
          platforms={platforms}
          users={users}
        />
      )}
    </div>
  )
}
