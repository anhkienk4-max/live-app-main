

import * as React from 'react'
import { shiftService } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { format } from 'date-fns'
import { Calendar, Clock, User as UserIcon, Briefcase, ExternalLink, Edit, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

interface ShiftDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  onUpdate: () => void
  onDelete: () => void
}

export function ShiftDetailModal({
  open,
  onOpenChange,
  shift,
  brands,
  platforms,
  campaigns,
  users,
  onUpdate,
  onDelete
}: ShiftDetailModalProps) {
  const { toast } = useToast()
  
  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'
  const getCampaignName = (id?: string) => id ? campaigns.find(c => c.id === id)?.name || 'N/A' : 'N/A'
  const getUserName = (id?: string) => id ? users.find(u => u.id === id)?.full_name || 'Unassigned' : 'Unassigned'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800'
      case 'live': return 'bg-red-100 text-red-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'cancelled': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this shift?')) {
      await shiftService.delete(shift.id)
      toast({
        title: 'Shift Deleted',
        description: 'The shift has been removed',
        variant: 'default'
      })
      onDelete()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">{getBrandName(shift.brand_id)}</DialogTitle>
              <div className="text-sm text-gray-600 mt-1">{getPlatformName(shift.platform_id)}</div>
            </div>
            <Badge className={getStatusColor(shift.status)}>
              {shift.status.toUpperCase()}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="info">Additional Info</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-gray-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Date</div>
                      <div className="font-semibold">{format(new Date(shift.date), 'MMMM d, yyyy')}</div>
                      <div className="text-sm text-gray-500">{format(new Date(shift.date), 'EEEE')}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-gray-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Time</div>
                      <div className="font-semibold">{shift.start_time} - {shift.end_time}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-gray-600 mb-4">Brand & Platform</div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBrandColor(shift.brand_id) }}></div>
                      <div className="text-sm text-gray-600">Brand</div>
                    </div>
                    <div className="font-semibold">{getBrandName(shift.brand_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Platform</div>
                    <div className="font-semibold">{getPlatformName(shift.platform_id)}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-gray-600 mb-1">Campaign</div>
                    <div className="font-semibold">{getCampaignName(shift.campaign_id)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-gray-600 mb-4">Team</div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <UserIcon className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Host</div>
                      <div className="font-semibold">{getUserName(shift.host_id)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <UserIcon className="h-5 w-5 text-green-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Support</div>
                      <div className="font-semibold">{getUserName(shift.support_id)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            {shift.live_link && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Live Link</div>
                      <div className="font-mono text-sm text-blue-600">{shift.live_link}</div>
                    </div>
                    <Button size="sm" onClick={() => window.open(shift.live_link, '_blank')}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {shift.product_notes && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600 mb-2">Product Notes</div>
                  <div className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                    {shift.product_notes}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-4">Metadata</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Created:</span>
                    <span className="ml-2">{format(new Date(shift.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Updated:</span>
                    <span className="ml-2">{format(new Date(shift.updated_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" className="text-red-600" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
