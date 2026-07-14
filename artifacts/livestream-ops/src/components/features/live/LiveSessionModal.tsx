

import * as React from 'react'
import { Shift, Brand, Platform, Campaign, User, DashboardUpdate } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { dashboardUpdateService } from '@/lib/services/dataService'
import { format, parseISO } from 'date-fns'
import { Clock, DollarSign, TrendingUp, Users, ExternalLink, Camera } from 'lucide-react'

interface LiveSessionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  onUpdate: () => void
}

export function LiveSessionModal({ 
  open, 
  onOpenChange, 
  shift, 
  brands, 
  platforms, 
  campaigns, 
  users, 
  onUpdate 
}: LiveSessionModalProps) {
  const [updates, setUpdates] = React.useState<DashboardUpdate[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (open && shift) {
      loadUpdates()
    }
  }, [open, shift])

  const loadUpdates = async () => {
    setLoading(true)
    const data = await dashboardUpdateService.getByShift(shift.id)
    setUpdates(data)
    setLoading(false)
  }

  const getBrandName = (id: string) => brands.find((b: Brand) => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find((b: Brand) => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find((p: Platform) => p.id === id)?.name || 'Unknown'
  const getCampaignName = (id?: string) => id ? campaigns.find((c: Campaign) => c.id === id)?.name || 'N/A' : 'N/A'
  const getUserName = (id?: string) => id ? users.find((u: User) => u.id === id)?.full_name || 'Unassigned' : 'Unassigned'

  const totalRevenue = updates.reduce((sum, u) => sum + u.revenue, 0)
  const totalOrders = updates.reduce((sum, u) => sum + u.orders, 0)
  const peakViewers = Math.max(...updates.map(u => u.peak_viewers), 0)
  const latestUpdate = updates.length > 0 ? updates[updates.length - 1] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">{getBrandName(shift.brand_id)} - Live Session</DialogTitle>
              <div className="text-sm text-gray-600 mt-1">{format(new Date(shift.date), 'MMMM d, yyyy')} • {shift.start_time} - {shift.end_time}</div>
            </div>
            <Badge variant="destructive" className="animate-pulse">
              <span className="inline-block w-2 h-2 bg-white rounded-full mr-2 animate-ping"></span>
              LIVE
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="updates">Updates ({updates.length})</TabsTrigger>
            <TabsTrigger value="info">Details</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Live Stats */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">Revenue</div>
                      <div className="text-2xl font-bold text-green-600">${totalRevenue.toLocaleString()}</div>
                    </div>
                    <DollarSign className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">Orders</div>
                      <div className="text-2xl font-bold">{totalOrders}</div>
                    </div>
                    <TrendingUp className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">Peak Viewers</div>
                      <div className="text-2xl font-bold">{peakViewers}</div>
                    </div>
                    <Users className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">Current Viewers</div>
                      <div className="text-2xl font-bold">{latestUpdate?.current_viewers || 0}</div>
                    </div>
                    <Users className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Live Link */}
            {shift.live_link && (
              <Card className="border-2" style={{ borderColor: getBrandColor(shift.brand_id) }}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Live Stream Link</div>
                      <div className="font-mono text-sm text-blue-600">{shift.live_link}</div>
                    </div>
                    <Button size="sm" onClick={() => window.open(shift.live_link, '_blank')}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Live
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Product Notes */}
            {shift.product_notes && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600 mb-2">Product Notes</div>
                  <div className="text-sm">{shift.product_notes}</div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="updates" className="space-y-4">
            {loading ? (
              <div className="text-center py-12 text-gray-600">Loading updates...</div>
            ) : updates.length === 0 ? (
              <Card className="p-12">
                <div className="text-center">
                  <Camera className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <div className="text-lg font-medium text-gray-600">No Dashboard Updates Yet</div>
                  <div className="text-sm text-gray-500 mt-2">Updates will appear here as staff submits them every 30 minutes</div>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {updates.map((update, index) => (
                  <Card key={update.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="font-semibold">Update #{index + 1}</div>
                          <div className="text-sm text-gray-600">{format(parseISO(update.time), 'h:mm a')}</div>
                        </div>
                        <Badge variant="secondary">{format(parseISO(update.time), 'MMM d')}</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-gray-600">Revenue</div>
                          <div className="font-bold text-green-600">${update.revenue.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Orders</div>
                          <div className="font-bold">{update.orders}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Peak Viewers</div>
                          <div className="font-bold">{update.peak_viewers}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Current Viewers</div>
                          <div className="font-bold">{update.current_viewers}</div>
                        </div>
                      </div>
                      {update.screenshot_url && (
                        <img src={update.screenshot_url} alt="Dashboard Screenshot" className="w-full h-40 object-cover rounded-lg mb-4" />
                      )}
                      {update.notes && (
                        <div className="text-sm bg-gray-50 p-3 rounded-lg">{update.notes}</div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Brand</div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBrandColor(shift.brand_id) }}></div>
                      <div className="font-medium">{getBrandName(shift.brand_id)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Platform</div>
                    <div className="font-medium">{getPlatformName(shift.platform_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Campaign</div>
                    <div className="font-medium">{getCampaignName(shift.campaign_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Date</div>
                    <div className="font-medium">{format(new Date(shift.date), 'MMMM d, yyyy')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Time</div>
                    <div className="font-medium">{shift.start_time} - {shift.end_time}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Status</div>
                    <Badge variant="destructive">Live</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-semibold mb-4">Team</div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Host</div>
                    <div className="font-medium">{getUserName(shift.host_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Support</div>
                    <div className="font-medium">{getUserName(shift.support_id)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline">
            <Card className="p-12">
              <div className="text-center">
                <Clock className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <div className="text-lg font-medium text-gray-600">Timeline Coming Soon</div>
                <div className="text-sm text-gray-500 mt-2">Activity timeline will be implemented in the next module</div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
