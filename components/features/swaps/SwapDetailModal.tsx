'use client'

import * as React from 'react'
import { SwapRequest, Shift, User, Brand, Platform } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { CheckCircle, XCircle, Clock, User as UserIcon, Calendar, Briefcase } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { getSwapStatusPresentation } from '@/lib/utils/swapUi'

interface SwapDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  swap: SwapRequest
  shift: Shift
  targetShift?: Shift
  requester: User
  newHost?: User
  brands: Brand[]
  platforms: Platform[]
  showParticipantActions?: boolean
  showReviewerActions?: boolean
  showRequesterActions?: boolean
  onAccept?: () => void
  onParticipantReject?: () => void
  onCancel?: () => void
  onApprove: () => void
  onReject: () => void
}

export function SwapDetailModal({ 
  open, 
  onOpenChange, 
  swap, 
  shift, 
  targetShift,
  requester, 
  newHost,
  brands, 
  platforms,
  showParticipantActions = false,
  showReviewerActions = false,
  showRequesterActions = false,
  onAccept,
  onParticipantReject,
  onCancel,
  onApprove,
  onReject
}: SwapDetailModalProps) {
  const { toast } = useToast()
  const { t } = useTranslation()
  const statusPresentation = getSwapStatusPresentation(swap.status)
  const isActive = swap.status === 'pending' || swap.status === 'accepted'
  const actionContext = showParticipantActions
    ? t('swapParticipantActionNeeded')
    : showReviewerActions
      ? t('swapReviewerActionRequired')
      : swap.status === 'pending'
        ? t('swapWaitingForParticipant')
        : swap.status === 'accepted'
          ? t('swapAwaitingReviewer')
          : t('swapSubmittedForReview')
  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'
  const translate = (key: string) => (t as unknown as (translationKey: string) => string)(key)

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
    toast({ 
      title: 'Request Approved', 
      description: 'The swap request has been approved',
      variant: 'success' 
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
      <DialogContent size="lg" className="overflow-y-auto max-w-2xl" aria-describedby="swap-detail-context">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl" data-testid="swap-detail-title">{t('swapRequestDetails')}</DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-bold tracking-wider text-[10px] uppercase">
                {swap.mode || 'replacement'}
              </Badge>
              <Badge className={getStatusColor()}>
                <span className="flex items-center gap-1.5">
                  {getStatusIcon()}
                  {translate(statusPresentation.label)}
                </span>
              </Badge>
            </div>
          </div>
          <div id="swap-detail-context" className="mt-2 space-y-1 text-sm text-muted-foreground">
            {isActive && <p data-testid="swap-action-context"><span className="font-medium">{t('swapNextStep')}:</span> {actionContext}</p>}
            {!showParticipantActions && !showReviewerActions && !showRequesterActions && <p>{t('swapReadOnly')}</p>}
          </div>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Shift Information */}
          <div className="rounded-md border p-4 space-y-3 relative overflow-hidden shadow-sm">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: getBrandColor(shift.brand_id) }} />

            <div className="flex items-center gap-2 font-semibold">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{getBrandName(shift.brand_id)} · {getPlatformName(shift.platform_id)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 ml-6">
              <div>
                <span className="text-muted-foreground block text-xs">{t('currentShift')}</span>
                <span className="font-medium">{format(new Date(shift.date), 'MMMM d, yyyy')} · {formatShiftTimeRange(shift)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Shift Status</span>
                <Badge variant="secondary" className="font-normal">{translate(shift.status)}</Badge>
              </div>
            </div>
            {targetShift && (
              <div className="ml-6 rounded border border-dashed p-2 text-xs text-muted-foreground" data-testid="swap-target-shift">
                <span className="font-medium">{t('targetShift')}:</span> {format(new Date(targetShift.date), 'MMMM d, yyyy')} · {formatShiftTimeRange(targetShift)}
              </div>
            )}
          </div>

          {/* People Involved */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-md border p-4 shadow-sm bg-muted/10">
              <div className="flex items-center gap-2 font-semibold mb-3">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span>{t('requester')}</span>
              </div>
              <div className="ml-6 space-y-1">
                <div className="font-medium">{requester.full_name}</div>
                <div className="text-muted-foreground text-xs">{requester.email}</div>
                {requester.department && <div className="text-muted-foreground text-xs">{requester.department}</div>}
              </div>
            </div>

            <div className="rounded-md border p-4 shadow-sm bg-muted/10">
              <div className="flex items-center gap-2 font-semibold mb-3">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span>{swap.mode === 'exchange' ? t('exchangeWith') : t('replacementStaff')}</span>
              </div>
              <div className="ml-6 space-y-1">
                {newHost ? (
                  <>
                    <div className="font-medium">{newHost.full_name}</div>
                    <div className="text-muted-foreground text-xs">{newHost.email}</div>
                    {newHost.department && <div className="text-muted-foreground text-xs">{newHost.department}</div>}
                  </>
                ) : (
                  <div className="text-muted-foreground text-xs italic">{t('noReplacementSpecified')}</div>
                )}
              </div>
            </div>
          </div>

          {/* Reason */}
          {swap.reason && (
            <div className="rounded-md bg-muted/30 p-4 border shadow-sm">
              <div className="flex items-center gap-2 font-semibold mb-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span>{t('reason')}</span>
              </div>
              <p className="ml-6 text-muted-foreground italic text-sm">&quot;{swap.reason}&quot;</p>
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-md border p-4 shadow-sm">
            <div className="font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Timeline
            </div>
            <div className="space-y-4 ml-8 border-l-2 pl-4 pb-1">
              <div className="relative">
                <div className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-muted-foreground ring-4 ring-background"></div>
                <div className="font-medium text-sm">{t('swapCreated')}</div>
                <div className="text-xs text-muted-foreground">{format(new Date(swap.created_at), 'MMMM d, yyyy h:mm a')}</div>
              </div>
              {swap.approved_at && (
                <div className="relative">
                  <div className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ring-4 ring-background ${
                    swap.status === 'approved' || swap.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <div className="font-medium text-sm">
                    {translate(swap.status === 'approved' || swap.status === 'completed' ? 'approved' : 'rejected')}
                  </div>
                  <div className="text-xs text-muted-foreground">{format(new Date(swap.approved_at), 'MMMM d, yyyy h:mm a')}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <DialogFooter className="mt-2 border-t pt-4 flex-row sm:justify-between items-center w-full">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="swap-close">
            {t('close')}
          </Button>
          <div className="flex gap-2">
            {showParticipantActions && isActive && (
              <>
                <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onParticipantReject}>
                  <XCircle className="h-4 w-4 mr-2" /> {t('reject')}
                </Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={onAccept}>
                  <CheckCircle className="h-4 w-4 mr-2" /> {t('accept')}
                </Button>
              </>
            )}
            {showReviewerActions && swap.status === 'accepted' && (
              <>
                <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleReject}>
                  <XCircle className="h-4 w-4 mr-2" /> {t('reject')}
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleApprove}>
                  <CheckCircle className="h-4 w-4 mr-2" /> {t('approve')}
                </Button>
              </>
            )}
            {showRequesterActions && isActive && (
              <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onCancel} data-testid="swap-cancel">
                <XCircle className="h-4 w-4 mr-2" /> {t('cancelRegistration')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
