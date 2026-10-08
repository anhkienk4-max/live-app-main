'use client'

import * as React from 'react'
import { SwapRequest, Shift, User, Brand, Platform } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { CheckCircle, XCircle, Clock, User as UserIcon, Calendar, Briefcase } from 'lucide-react'

import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import { getSwapStatusPresentation } from '@/lib/utils/swapUi'

interface SwapDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  swap: SwapRequest
  shift: Shift
  requester: User
  newHost?: User
  brands: Brand[]
  platforms: Platform[]
  showParticipantActions?: boolean
  showReviewerActions?: boolean
  onAccept?: () => void
  onParticipantReject?: () => void
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
  showParticipantActions = false,
  showReviewerActions = false,
  onAccept,
  onParticipantReject,
  onApprove,
  onReject
}: SwapDetailModalProps) {

  const { t } = useTranslation()
  const statusPresentation = getSwapStatusPresentation(swap.status)
  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'

  const getStatusColor = () => {
    switch (statusPresentation.tone) {
      case 'warning': return 'bg-yellow-100 text-yellow-800'
      case 'info': return 'bg-blue-100 text-blue-800'
      case 'success': return 'bg-green-100 text-green-800'
      case 'danger': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = () => {
    if (statusPresentation.tone === 'success') return <CheckCircle className="h-5 w-5" />
    if (statusPresentation.tone === 'danger') return <XCircle className="h-5 w-5" />
    if (statusPresentation.tone === 'warning' || statusPresentation.tone === 'info') return <Clock className="h-5 w-5" />
    return null
  }

  const handleApprove = () => {
    onApprove()
    onOpenChange(false)
  }

  const handleReject = () => {
    onReject()
    onOpenChange(false)
  }

  const handleAccept = () => {
    if (onAccept) onAccept()
    onOpenChange(false)
  }

  const handleParticipantReject = () => {
    if (onParticipantReject) onParticipantReject()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="overflow-y-auto max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">Swap Request Details</DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-bold tracking-wider text-micro uppercase">
                {swap.mode || 'replacement'}
              </Badge>
              <Badge className={getStatusColor()}>
                <span className="flex items-center gap-1.5">
                  {getStatusIcon()}
                  {t(statusPresentation.label)}
                </span>
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Shift Information */}
          <div className="rounded-md border p-4 space-y-3 relative overflow-hidden shadow-none">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: getBrandColor(shift.brand_id) }} />

            <div className="flex items-center gap-2 font-semibold">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{shift.title || getBrandName(shift.brand_id)} · {getPlatformName(shift.platform_id)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 ml-6">
              <div>
                <span className="text-muted-foreground block text-xs">Date & Time</span>
                <span className="font-medium">{format(new Date(shift.date), 'MMMM d, yyyy')} · {formatShiftTimeRange(shift)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Shift Status</span>
                <Badge variant="secondary" className="font-normal">{shift.status}</Badge>
              </div>
            </div>
          </div>

          {/* People Involved */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-md border p-4 shadow-none bg-muted/10">
              <div className="flex items-center gap-2 font-semibold mb-3">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span>Requester</span>
              </div>
              <div className="ml-6 space-y-1">
                <div className="font-medium">{requester.full_name}</div>
                <div className="text-muted-foreground text-xs">{requester.email}</div>
                {requester.department && <div className="text-muted-foreground text-xs">{requester.department}</div>}
              </div>
            </div>

            <div className="rounded-md border p-4 shadow-none bg-muted/10">
              <div className="flex items-center gap-2 font-semibold mb-3">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span>{swap.mode === 'exchange' ? 'Exchange With' : 'Replacement Staff'}</span>
              </div>
              <div className="ml-6 space-y-1">
                {newHost ? (
                  <>
                    <div className="font-medium">{newHost.full_name}</div>
                    <div className="text-muted-foreground text-xs">{newHost.email}</div>
                    {newHost.department && <div className="text-muted-foreground text-xs">{newHost.department}</div>}
                  </>
                ) : (
                  <div className="text-muted-foreground text-xs italic">No replacement specified</div>
                )}
              </div>
            </div>
          </div>

          {/* Reason */}
          {swap.reason && (
            <div className="rounded-md bg-muted/30 p-4 border shadow-none">
              <div className="flex items-center gap-2 font-semibold mb-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span>Reason</span>
              </div>
              <p className="ml-6 text-muted-foreground italic text-sm">&quot;{swap.reason}&quot;</p>
            </div>
          )}

          <section className="rounded-md border p-3">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold"><Clock className="h-4 w-4" />Timeline</h3>
            {swap.approval_history?.length ? swap.approval_history.map((event, index) => (
              <div key={index} className="border-l pl-3 pb-3 text-xs">
                <p className="font-medium">{event.action} / {event.from_status || '—'} / {event.to_status || '—'}</p>
                <p className="mt-1 text-muted-foreground">{format(new Date(event.at), 'dd/MM/yyyy HH:mm')} / {event.actor_id === requester.id ? requester.full_name : event.actor_id === newHost?.id ? newHost.full_name : event.actor_id}</p>
                {event.notes && <p className="mt-1 whitespace-pre-wrap">{event.notes}</p>}
              </div>
            )) : <p className="text-xs text-muted-foreground">Request submitted / {format(new Date(swap.created_at), 'dd/MM/yyyy HH:mm')}</p>}
          </section>
          <details className="rounded-md border p-3 text-xs">
            <summary className="cursor-pointer font-medium">Request metadata</summary>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ['Request', swap.id], ['Version', swap.version], ['Source shift', swap.source_shift_id || swap.shift_id],
                ['Target shift', swap.target_shift_id], ['Source registration', swap.source_registration_id],
                ['Counterpart registration', swap.counterpart_registration_id], ['Responded', swap.responded_at], ['Completed', swap.completed_at],
              ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value ?? '—'}</dd></div>)}
            </dl>
            {swap.notes && <p className="mt-3 whitespace-pre-wrap">{swap.notes}</p>}
          </details>
        </div>

        {/* Actions */}
        <DialogFooter className="mt-2 border-t pt-4 flex-row sm:justify-between items-center w-full">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex gap-2">
            {showParticipantActions && (
              <>
                <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleParticipantReject}>
                  <XCircle className="h-4 w-4 mr-2" /> Reject
                </Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleAccept}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Accept
                </Button>
              </>
            )}
            {showReviewerActions && (
              <>
                <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleReject}>
                  <XCircle className="h-4 w-4 mr-2" /> Reject
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleApprove}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Approve
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
