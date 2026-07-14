

import * as React from 'react'
import { SwapRequest, Shift, User, Brand, Platform } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import { CheckCircle, XCircle, Clock, User as UserIcon, Calendar, Briefcase } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

interface SwapDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  swap: SwapRequest
  shift: Shift
  requester: User
  newHost?: User
  brands: Brand[]
  platforms: Platform[]
  onApprove: () => void
  onReject: () => void
}

export function SwapDetailModal({ 
  open, 
  onOpenChange, 
  swap, 
  shift, 
  requester, 
  newHost,
  brands, 
  platforms,
  onApprove,
  onReject
}: SwapDetailModalProps) {
  const { toast } = useToast()
  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'approved': return 'bg-green-100 text-green-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-5 w-5" />
      case 'approved': return <CheckCircle className="h-5 w-5" />
      case 'rejected': return <XCircle className="h-5 w-5" />
      default: return null
    }
  }

  const handleApprove = () => {
    toast({ 
      title: 'Request Approved', 
      description: 'The swap request has been approved',
      variant: 'default' 
    })
    onApprove()
  }

  const handleReject = () => {
    toast({ 
      title: 'Request Rejected', 
      description: 'The swap request has been rejected',
      variant: 'destructive' 
    })
    onReject()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl">Swap Request Details</DialogTitle>
            <Badge className={getStatusColor(swap.status)}>
              <span className="flex items-center gap-2">
                {getStatusIcon(swap.status)}
                {swap.status.toUpperCase()}
              </span>
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Shift Information */}
          <Card className="border-2" style={{ borderColor: getBrandColor(shift.brand_id) }}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Calendar className="h-6 w-6 text-gray-600 mt-1" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-600 mb-2">Shift Details</div>
                  <div className="space-y-2">
                    <div className="font-semibold text-lg">
                      {getBrandName(shift.brand_id)} - {getPlatformName(shift.platform_id)}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Date:</span>
                        <span className="font-medium ml-2">{format(new Date(shift.date), 'MMMM d, yyyy')}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Time:</span>
                        <span className="font-medium ml-2">{shift.start_time} - {shift.end_time}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <Badge variant="secondary" className="ml-2">{shift.status}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* People Involved */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <UserIcon className="h-6 w-6 text-blue-600 mt-1" />
                  <div>
                    <div className="text-sm font-medium text-gray-600 mb-2">Requester</div>
                    <div className="font-semibold">{requester.full_name}</div>
                    <div className="text-sm text-gray-600">{requester.email}</div>
                    <div className="text-xs text-gray-500 mt-1">{requester.department}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <UserIcon className="h-6 w-6 text-green-600 mt-1" />
                  <div>
                    <div className="text-sm font-medium text-gray-600 mb-2">Proposed Replacement</div>
                    {newHost ? (
                      <>
                        <div className="font-semibold">{newHost.full_name}</div>
                        <div className="text-sm text-gray-600">{newHost.email}</div>
                        <div className="text-xs text-gray-500 mt-1">{newHost.department}</div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">No replacement specified</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reason */}
          <Card className="bg-gray-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Briefcase className="h-6 w-6 text-purple-600 mt-1" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-600 mb-2">Reason for Swap</div>
                  <p className="text-sm whitespace-pre-wrap">{swap.reason}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-gray-600 mb-4">Timeline</div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Request Submitted</div>
                    <div className="text-xs text-gray-600">{format(new Date(swap.created_at), 'MMMM d, yyyy h:mm a')}</div>
                  </div>
                </div>
                {swap.approved_at && (
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      swap.status === 'approved' ? 'bg-green-600' : 'bg-red-600'
                    }`}></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {swap.status === 'approved' ? 'Request Approved' : 'Request Rejected'}
                      </div>
                      <div className="text-xs text-gray-600">{format(new Date(swap.approved_at), 'MMMM d, yyyy h:mm a')}</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        {swap.status === 'pending' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button 
              variant="outline"
              className="text-red-600 border-red-600 hover:bg-red-50"
              onClick={handleReject}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApprove}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </DialogFooter>
        )}

        {swap.status !== 'pending' && (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
