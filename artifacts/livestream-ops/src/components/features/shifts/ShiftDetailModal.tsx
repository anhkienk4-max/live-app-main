import * as React from 'react'
import { shiftService } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { format } from 'date-fns'
import { Calendar, Clock, ExternalLink, Trash2, Mic, Headphones, Wrench, Tag } from 'lucide-react'
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

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  live: 'bg-red-100 text-red-800 animate-pulse',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

export function ShiftDetailModal({
  open, onOpenChange, shift, brands, platforms, campaigns, users, onUpdate, onDelete,
}: ShiftDetailModalProps) {
  const { toast } = useToast()

  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'
  const getCampaignName = (id?: string) => id ? campaigns.find(c => c.id === id)?.name || 'N/A' : 'None'
  const getUser = (id?: string): User | undefined => id ? users.find(u => u.id === id) : undefined

  const host = getUser(shift.host_id)
  const support = getUser(shift.support_id)
  const technical = getUser(shift.technical_id)

  const handleDelete = async () => {
    if (confirm('Delete this shift? This action cannot be undone.')) {
      await shiftService.delete(shift.id)
      toast({ title: 'Shift Deleted', description: 'The shift has been removed', variant: 'default' })
      onDelete()
    }
  }

  const CrewCard = ({
    person,
    roleLabel,
    icon,
    color,
  }: {
    person?: User
    roleLabel: string
    icon: React.ReactNode
    color: string
  }) => (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${person ? 'bg-white' : 'bg-gray-50 border-dashed'}`}>
      <div className={`mt-0.5 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{roleLabel}</p>
        {person ? (
          <div className="flex items-center gap-2 mt-1">
            <Avatar className="h-6 w-6">
              <AvatarImage src={person.avatar_url} />
              <AvatarFallback className="text-xs">{person.full_name[0]}</AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm text-gray-900">{person.full_name}</span>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-1 italic">Unassigned</p>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">{getBrandName(shift.brand_id)}</DialogTitle>
              <p className="text-sm text-gray-600 mt-1">{getPlatformName(shift.platform_id)}</p>
            </div>
            <Badge className={STATUS_COLOR[shift.status]}>{shift.status.toUpperCase()}</Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="crew">Crew</TabsTrigger>
            <TabsTrigger value="info">Notes & Links</TabsTrigger>
          </TabsList>

          {/* ── Details ─────────────────────────────────────────────────────── */}
          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardContent className="pt-5 grid grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-semibold">{format(new Date(shift.date), 'MMMM d, yyyy')}</p>
                    <p className="text-sm text-gray-400">{format(new Date(shift.date), 'EEEE')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Time</p>
                    <p className="font-semibold">{shift.start_time} – {shift.end_time}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <p className="text-sm font-medium text-gray-500 mb-4">Brand & Campaign</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Brand</p>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getBrandColor(shift.brand_id) }} />
                      <span className="font-medium">{getBrandName(shift.brand_id)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Platform</p>
                    <span className="font-medium">{getPlatformName(shift.platform_id)}</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Campaign</p>
                    <div className="flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-medium text-sm">{getCampaignName(shift.campaign_id)}</span>
                    </div>
                  </div>
                </div>
                {shift.imported_from && shift.imported_from !== 'manual' && (
                  <div className="mt-3">
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      Imported from: {shift.imported_from.replace('_', ' ')}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Crew ──────────────────────────────────────────────────────────── */}
          <TabsContent value="crew" className="space-y-3">
            <CrewCard
              person={host}
              roleLabel="Host"
              icon={<Mic className="h-5 w-5" />}
              color="text-blue-600"
            />
            <CrewCard
              person={support}
              roleLabel="Support"
              icon={<Headphones className="h-5 w-5" />}
              color="text-green-600"
            />
            <CrewCard
              person={technical}
              roleLabel="Technical"
              icon={<Wrench className="h-5 w-5" />}
              color="text-purple-600"
            />
          </TabsContent>

          {/* ── Notes & Links ──────────────────────────────────────────────── */}
          <TabsContent value="info" className="space-y-4">
            {shift.live_link && (
              <Card>
                <CardContent className="pt-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Live Link</p>
                    <p className="font-mono text-sm text-blue-600 truncate max-w-sm">{shift.live_link}</p>
                  </div>
                  <Button size="sm" onClick={() => window.open(shift.live_link, '_blank')}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {shift.product_notes && (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-gray-500 mb-2">Product Notes</p>
                  <p className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">{shift.product_notes}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-gray-500 mb-3">Metadata</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Created:</span> <span>{format(new Date(shift.created_at), 'MMM d, yyyy h:mm a')}</span></div>
                  <div><span className="text-gray-500">Updated:</span> <span>{format(new Date(shift.updated_at), 'MMM d, yyyy h:mm a')}</span></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between mt-4">
          <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete Shift
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
