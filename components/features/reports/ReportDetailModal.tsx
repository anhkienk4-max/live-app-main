'use client'

import * as React from 'react'
import { Report, Shift, Brand, Platform, User } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { reportImageService } from '@/lib/services/dataService'
import { ReportImage } from '@/lib/types/database.types'
import { ImageGallery } from '@/components/features/gallery/ImageGallery'
import { format } from 'date-fns'
import { DollarSign, TrendingUp, Users, ThumbsUp, MessageCircle, Share2, ExternalLink, Star } from 'lucide-react'

interface ReportDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: Report
  shift: Shift
  brands: Brand[]
  platforms: Platform[]
  users: User[]
}

export function ReportDetailModal({ 
  open, 
  onOpenChange, 
  report, 
  shift, 
  brands, 
  platforms,
  users 
}: ReportDetailModalProps) {
  const [images, setImages] = React.useState<ReportImage[]>([])
  React.useEffect(() => { if (open) void reportImageService.getByReport(report.id).then(setImages) }, [open, report.id])
  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'
  const getUserName = (id?: string) => id ? users.find(u => u.id === id)?.full_name || 'N/A' : 'N/A'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">{getBrandName(shift.brand_id)} - Final Report</DialogTitle>
              <div className="text-sm text-gray-600 mt-1">
                {format(new Date(shift.date), 'MMMM d, yyyy')} • {shift.start_time} - {shift.end_time}
              </div>
            </div>
            <Badge className="bg-green-100 text-green-800">Completed</Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">Total Revenue</div>
                      <div className="text-2xl font-bold text-green-600">${report.revenue.toLocaleString()}</div>
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
                      <div className="text-2xl font-bold">{report.orders}</div>
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
                      <div className="text-2xl font-bold">{report.peak_viewer}</div>
                    </div>
                    <Users className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">Avg Viewers</div>
                      <div className="text-2xl font-bold">{report.average_viewer}</div>
                    </div>
                    <Users className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Engagement */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Engagement Metrics</h3>
                <div className="grid grid-cols-3 gap-6">
                  <div className="flex items-center gap-3">
                    <ThumbsUp className="h-6 w-6 text-blue-600" />
                    <div>
                      <div className="text-sm text-gray-600">Likes</div>
                      <div className="text-xl font-bold">{report.likes}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MessageCircle className="h-6 w-6 text-green-600" />
                    <div>
                      <div className="text-sm text-gray-600">Comments</div>
                      <div className="text-xl font-bold">{report.comments}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Share2 className="h-6 w-6 text-purple-600" />
                    <div>
                      <div className="text-sm text-gray-600">Shares</div>
                      <div className="text-xl font-bold">{report.shares}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Products */}
            {report.top_products && report.top_products.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">Top Performing Products</h3>
                  <div className="flex flex-wrap gap-2">
                    {report.top_products.map((product, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg">
                        <Star className="h-4 w-4" />
                        <span className="font-medium">{product}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Links */}
            <div className="grid grid-cols-2 gap-4">
              {report.replay_url && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Replay Link</div>
                        <div className="font-mono text-sm text-blue-600 truncate">{report.replay_url}</div>
                      </div>
                      <Button size="sm" onClick={() => window.open(report.replay_url, '_blank')}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {report.dashboard_url && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Dashboard Link</div>
                        <div className="font-mono text-sm text-blue-600 truncate">{report.dashboard_url}</div>
                      </div>
                      <Button size="sm" onClick={() => window.open(report.dashboard_url, '_blank')}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-green-900 mb-4">What Went Well</h3>
                  <p className="text-sm text-green-800 whitespace-pre-wrap">
                    {report.insights_good || 'No insights provided'}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-orange-900 mb-4">Areas for Improvement</h3>
                  <p className="text-sm text-orange-800 whitespace-pre-wrap">
                    {report.insights_improvement || 'No insights provided'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Session Details</h3>
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
                    <div className="text-sm text-gray-600 mb-1">Date</div>
                    <div className="font-medium">{format(new Date(shift.date), 'MMMM d, yyyy')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Time</div>
                    <div className="font-medium">{shift.start_time} - {shift.end_time}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Host</div>
                    <div className="font-medium">{getUserName(shift.host_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Support</div>
                    <div className="font-medium">{getUserName(shift.support_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Technical</div>
                    <div className="font-medium">{getUserName(shift.technical_id)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Report Metadata</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Submitted On</div>
                    <div className="font-medium">{format(new Date(report.created_at), 'MMMM d, yyyy h:mm a')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Report ID</div>
                    <div className="font-mono text-sm">{report.id}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="images" className="space-y-4">
            {images.length === 0 ? <p className="text-sm text-gray-500">No evidence images were saved for this report.</p> : Object.entries(images.reduce<Record<string, ReportImage[]>>((groups, image) => { (groups[image.image_type] ??= []).push(image); return groups }, {})).map(([category, categoryImages]) => <Card key={category}><CardContent className="pt-6"><h3 className="mb-3 font-semibold capitalize">{category} ({categoryImages.length})</h3><ImageGallery images={categoryImages.map(image => image.image_url)} /></CardContent></Card>)}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
