import * as React from 'react'
import { swapRequestService, shiftService, userService, brandService, platformService } from '@/lib/services/dataService'
import { SwapRequest, Shift, User, Brand, Platform } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { format } from 'date-fns'
import { RefreshCw, Plus, Search, CheckCircle, XCircle, Clock, Download } from 'lucide-react'
import { SwapRequestFormModal } from './SwapRequestFormModal'
import { SwapDetailModal } from './SwapDetailModal'
import { useToast } from '@/components/ui/toast'

const ROLE_COLORS = {
  host: 'bg-blue-100 text-blue-700',
  support: 'bg-green-100 text-green-700',
  technical: 'bg-purple-100 text-purple-700',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export function SwapRequestList() {
  const [swaps, setSwaps] = React.useState<SwapRequest[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedSwap, setSelectedSwap] = React.useState<SwapRequest | null>(null)
  const [showForm, setShowForm] = React.useState(false)
  const { toast } = useToast()

  React.useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [s, sh, u, b, p] = await Promise.all([
      swapRequestService.getAll(),
      shiftService.getAll(),
      userService.getAll(),
      brandService.getAll(),
      platformService.getAll(),
    ])
    setSwaps(s)
    setShifts(sh)
    setUsers(u)
    setBrands(b)
    setPlatforms(p)
    setLoading(false)
  }

  const getShift = (id: string) => shifts.find(s => s.id === id)
  const getUser = (id: string) => users.find(u => u.id === id)
  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'

  const matchesSearch = (swap: SwapRequest) => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    const requester = getUser(swap.requester_id)
    const shift = getShift(swap.shift_id)
    return (
      requester?.full_name.toLowerCase().includes(q) ||
      swap.reason.toLowerCase().includes(q) ||
      (shift && getBrandName(shift.brand_id).toLowerCase().includes(q))
    )
  }

  const pending = swaps.filter(s => s.status === 'pending' && matchesSearch(s))
  const history = swaps.filter(s => s.status !== 'pending' && matchesSearch(s))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const stats = React.useMemo(() => ({
    total: swaps.length,
    pending: swaps.filter(s => s.status === 'pending').length,
    approved: swaps.filter(s => s.status === 'approved').length,
    rejected: swaps.filter(s => s.status === 'rejected').length,
  }), [swaps])

  /** Export swap requests to Excel */
  const exportExcel = async (list: SwapRequest[]) => {
    try {
      const XLSX = await import('xlsx')
      const rows = list.map(sw => {
        const shift = getShift(sw.shift_id)
        const requester = getUser(sw.requester_id)
        const assignee = sw.new_assignee_id ? getUser(sw.new_assignee_id) : null
        const approver = sw.approved_by ? getUser(sw.approved_by) : null
        return {
          'ID': sw.id,
          'Status': sw.status,
          'Date Submitted': format(new Date(sw.created_at), 'yyyy-MM-dd HH:mm'),
          'Shift Date': shift ? format(new Date(shift.date), 'yyyy-MM-dd') : '',
          'Brand': shift ? getBrandName(shift.brand_id) : '',
          'Platform': shift ? getPlatformName(shift.platform_id) : '',
          'Requester': requester?.full_name || '',
          'Role Slot': sw.role_slot || '',
          'Proposed Replacement': assignee?.full_name || '',
          'Reason': sw.reason,
          'Reviewed By': approver?.full_name || '',
          'Reviewed At': sw.approved_at ? format(new Date(sw.approved_at), 'yyyy-MM-dd HH:mm') : '',
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Swap Requests')
      XLSX.writeFile(wb, `swap-requests-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast({ title: 'Exported', description: `${rows.length} records exported to Excel`, variant: 'default' })
    } catch (err) {
      toast({ title: 'Export Failed', description: String(err), variant: 'destructive' })
    }
  }

  if (loading) return <div className="text-center py-12">Loading swap requests…</div>

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-800', icon: <RefreshCw className="h-8 w-8 text-gray-500" /> },
          { label: 'Pending', value: stats.pending, color: 'text-yellow-600', icon: <Clock className="h-8 w-8 text-yellow-500" /> },
          { label: 'Approved', value: stats.approved, color: 'text-green-600', icon: <CheckCircle className="h-8 w-8 text-green-500" /> },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-600', icon: <XCircle className="h-8 w-8 text-red-500" /> },
        ].map(s => (
          <Card key={s.label}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                {s.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by requester, reason, or brand…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => exportExcel(swaps)}>
          <Download className="h-4 w-4 mr-2" /> Export Excel
        </Button>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" /> Request Swap
        </Button>
      </div>

      {/* Tabs: Pending | History */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {stats.pending > 0 && (
              <Badge className="ml-2 bg-yellow-500 text-white text-xs">{stats.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <SwapCardList
            swaps={pending}
            emptyLabel="No pending swap requests"
            getShift={getShift}
            getUser={getUser}
            getBrandName={getBrandName}
            getPlatformName={getPlatformName}
            onSelect={setSelectedSwap}
            onApprove={async sw => { await swapRequestService.approve(sw.id, '1'); loadData() }}
            onReject={async sw => { await swapRequestService.reject(sw.id, '1'); loadData() }}
            showActions
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={() => exportExcel(history)}>
              <Download className="h-4 w-4 mr-2" /> Export History
            </Button>
          </div>
          <SwapCardList
            swaps={history}
            emptyLabel="No swap history"
            getShift={getShift}
            getUser={getUser}
            getBrandName={getBrandName}
            getPlatformName={getPlatformName}
            onSelect={setSelectedSwap}
          />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {showForm && (
        <SwapRequestFormModal
          open={showForm}
          onOpenChange={setShowForm}
          shifts={shifts.filter(s => s.status === 'scheduled')}
          users={users}
          brands={brands}
          platforms={platforms}
          onSuccess={() => { loadData(); setShowForm(false) }}
        />
      )}

      {selectedSwap && (
        <SwapDetailModal
          open={!!selectedSwap}
          onOpenChange={open => !open && setSelectedSwap(null)}
          swap={selectedSwap}
          shift={getShift(selectedSwap.shift_id)!}
          requester={getUser(selectedSwap.requester_id)!}
          newHost={selectedSwap.new_host_id ? getUser(selectedSwap.new_host_id) : undefined}
          brands={brands}
          platforms={platforms}
          onApprove={async () => { await swapRequestService.approve(selectedSwap.id, '1'); loadData(); setSelectedSwap(null) }}
          onReject={async () => { await swapRequestService.reject(selectedSwap.id, '1'); loadData(); setSelectedSwap(null) }}
        />
      )}
    </div>
  )
}

// ─── Sub-component: card list ─────────────────────────────────────────────────
interface SwapCardListProps {
  swaps: SwapRequest[]
  emptyLabel: string
  getShift: (id: string) => Shift | undefined
  getUser: (id: string) => User | undefined
  getBrandName: (id: string) => string
  getPlatformName: (id: string) => string
  onSelect: (swap: SwapRequest) => void
  onApprove?: (swap: SwapRequest) => void
  onReject?: (swap: SwapRequest) => void
  showActions?: boolean
}

function SwapCardList({ swaps, emptyLabel, getShift, getUser, getBrandName, getPlatformName, onSelect, onApprove, onReject, showActions }: SwapCardListProps) {
  if (!swaps.length) {
    return (
      <Card className="p-12">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{emptyLabel}</p>
        </div>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      {swaps.map(swap => {
        const shift = getShift(swap.shift_id)
        const requester = getUser(swap.requester_id)
        const assignee = swap.new_assignee_id ? getUser(swap.new_assignee_id) : null
        if (!shift || !requester) return null
        return (
          <Card key={swap.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onSelect(swap)}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge className={STATUS_COLOR[swap.status]}>
                      {swap.status === 'pending' ? <Clock className="h-3 w-3 mr-1 inline" /> :
                       swap.status === 'approved' ? <CheckCircle className="h-3 w-3 mr-1 inline" /> :
                       <XCircle className="h-3 w-3 mr-1 inline" />}
                      {swap.status.toUpperCase()}
                    </Badge>
                    {swap.role_slot && (
                      <Badge variant="outline" className={`${(ROLE_COLORS as any)[swap.role_slot] || ''} border-0 text-xs capitalize`}>
                        {swap.role_slot} slot
                      </Badge>
                    )}
                    <span className="text-xs text-gray-500">{format(new Date(swap.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <p className="font-semibold">{getBrandName(shift.brand_id)} — {getPlatformName(shift.platform_id)}</p>
                  <p className="text-sm text-gray-600">{format(new Date(shift.date), 'MMMM d, yyyy')} · {shift.start_time}–{shift.end_time}</p>
                  <div className="flex items-center gap-4 text-sm mt-2">
                    <span><span className="text-gray-500">From:</span> <strong>{requester.full_name}</strong></span>
                    {assignee && <span><span className="text-gray-500">→</span> <strong>{assignee.full_name}</strong></span>}
                  </div>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded p-2 mt-2 line-clamp-2">{swap.reason}</p>
                </div>

                {showActions && swap.status === 'pending' && (
                  <div className="flex gap-2 ml-4 shrink-0">
                    <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50"
                      onClick={e => { e.stopPropagation(); onApprove?.(swap) }}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-600 hover:bg-red-50"
                      onClick={e => { e.stopPropagation(); onReject?.(swap) }}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}

                {swap.status !== 'pending' && swap.approved_by && (
                  <div className="ml-4 text-sm text-gray-500 text-right shrink-0">
                    <p>Reviewed by</p>
                    <p className="font-medium text-gray-700">{getUser(swap.approved_by)?.full_name}</p>
                    {swap.approved_at && <p className="text-xs">{format(new Date(swap.approved_at), 'MMM d, h:mm a')}</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
