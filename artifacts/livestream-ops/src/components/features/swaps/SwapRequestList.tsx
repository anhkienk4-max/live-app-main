

import * as React from 'react'
import { swapRequestService, shiftService, userService, brandService, platformService } from '@/lib/services/dataService'
import { SwapRequest, Shift, User, Brand, Platform } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'
import { RefreshCw, Plus, Search, Filter, CheckCircle, XCircle, Clock } from 'lucide-react'
import { SwapRequestFormModal } from './SwapRequestFormModal'
import { SwapDetailModal } from './SwapDetailModal'

export function SwapRequestList() {
  const [swaps, setSwaps] = React.useState<SwapRequest[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [selectedSwap, setSelectedSwap] = React.useState<SwapRequest | null>(null)
  const [showForm, setShowForm] = React.useState(false)

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [swapsData, shiftsData, usersData, brandsData, platformsData] = await Promise.all([
      swapRequestService.getAll(),
      shiftService.getAll(),
      userService.getAll(),
      brandService.getAll(),
      platformService.getAll()
    ])
    setSwaps(swapsData)
    setShifts(shiftsData)
    setUsers(usersData)
    setBrands(brandsData)
    setPlatforms(platformsData)
    setLoading(false)
  }

  const getShift = (shiftId: string) => shifts.find(s => s.id === shiftId)
  const getUser = (userId: string) => users.find(u => u.id === userId)
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'

  const filteredSwaps = swaps.filter(swap => {
    if (statusFilter !== 'all' && swap.status !== statusFilter) return false
    if (!searchTerm) return true
    
    const requester = getUser(swap.requester_id)
    const shift = getShift(swap.shift_id)
    const searchLower = searchTerm.toLowerCase()
    
    return (
      requester?.full_name.toLowerCase().includes(searchLower) ||
      swap.reason.toLowerCase().includes(searchLower) ||
      (shift && getBrandName(shift.brand_id).toLowerCase().includes(searchLower))
    )
  })

  const stats = React.useMemo(() => {
    return {
      total: swaps.length,
      pending: swaps.filter(s => s.status === 'pending').length,
      approved: swaps.filter(s => s.status === 'approved').length,
      rejected: swaps.filter(s => s.status === 'rejected').length
    }
  }, [swaps])

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
      case 'pending': return <Clock className="h-4 w-4" />
      case 'approved': return <CheckCircle className="h-4 w-4" />
      case 'rejected': return <XCircle className="h-4 w-4" />
      default: return null
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading swap requests...</div>
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="cursor-pointer" onClick={() => setStatusFilter('all')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{stats.total}</div>
              <RefreshCw className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => setStatusFilter('pending')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => setStatusFilter('approved')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-green-600">{stats.approved}</div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => setStatusFilter('rejected')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-red-600">{stats.rejected}</div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by requester, reason, or brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {statusFilter !== 'all' && (
                <Button variant="outline" onClick={() => setStatusFilter('all')}>
                  Clear Filter
                </Button>
              )}
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Request Swap
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Swap Requests */}
      {filteredSwaps.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <RefreshCw className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <div className="text-lg font-medium text-gray-600">No Swap Requests Found</div>
            <div className="text-sm text-gray-500 mt-2">
              {searchTerm ? 'Try adjusting your search criteria' : 'Create a new swap request to get started'}
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredSwaps.map((swap) => {
            const shift = getShift(swap.shift_id)
            const requester = getUser(swap.requester_id)
            const newHost = swap.new_host_id ? getUser(swap.new_host_id) : null
            
            if (!shift || !requester) return null

            return (
              <Card 
                key={swap.id} 
                className="cursor-pointer hover:shadow-lg transition-all"
                onClick={() => setSelectedSwap(swap)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <Badge className={getStatusColor(swap.status)}>
                          <span className="flex items-center gap-1">
                            {getStatusIcon(swap.status)}
                            {swap.status.toUpperCase()}
                          </span>
                        </Badge>
                        <span className="text-sm text-gray-600">
                          {format(new Date(swap.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="font-semibold text-lg">
                          {getBrandName(shift.brand_id)} - {getPlatformName(shift.platform_id)}
                        </div>
                        <div className="text-sm text-gray-600">
                          {format(new Date(shift.date), 'MMMM d, yyyy')} • {shift.start_time} - {shift.end_time}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Requester:</span>
                            <span className="font-medium ml-1">{requester.full_name}</span>
                          </div>
                          {newHost && (
                            <div>
                              <span className="text-gray-600">Proposed Host:</span>
                              <span className="font-medium ml-1">{newHost.full_name}</span>
                            </div>
                          )}
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <div className="text-xs text-gray-600 mb-1">Reason</div>
                          <div className="text-sm">{swap.reason}</div>
                        </div>
                      </div>
                    </div>

                    {swap.status === 'pending' && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-600 hover:bg-green-50"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await swapRequestService.approve(swap.id, '1') // Mock admin user
                            loadData()
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-600 hover:bg-red-50"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await swapRequestService.reject(swap.id, '1') // Mock admin user
                            loadData()
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {swap.status !== 'pending' && swap.approved_by && (
                      <div className="ml-4 text-sm text-gray-600">
                        <div>Reviewed by</div>
                        <div className="font-medium">{getUser(swap.approved_by)?.full_name}</div>
                        {swap.approved_at && (
                          <div className="text-xs">{format(new Date(swap.approved_at), 'MMM d, h:mm a')}</div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <SwapRequestFormModal
          open={showForm}
          onOpenChange={setShowForm}
          shifts={shifts.filter(s => s.status === 'scheduled')}
          users={users}
          brands={brands}
          platforms={platforms}
          onSuccess={() => {
            loadData()
            setShowForm(false)
          }}
        />
      )}

      {selectedSwap && (
        <SwapDetailModal
          open={!!selectedSwap}
          onOpenChange={(open) => !open && setSelectedSwap(null)}
          swap={selectedSwap}
          shift={getShift(selectedSwap.shift_id)!}
          requester={getUser(selectedSwap.requester_id)!}
          newHost={selectedSwap.new_host_id ? getUser(selectedSwap.new_host_id) : undefined}
          brands={brands}
          platforms={platforms}
          onApprove={async () => {
            await swapRequestService.approve(selectedSwap.id, '1')
            loadData()
            setSelectedSwap(null)
          }}
          onReject={async () => {
            await swapRequestService.reject(selectedSwap.id, '1')
            loadData()
            setSelectedSwap(null)
          }}
        />
      )}
    </div>
  )
}
