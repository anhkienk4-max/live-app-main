import { hasPermission } from '@/lib/permissions'
import type { SwapRequest, SwapStatus, User } from '@/lib/types/database.types'

export type SwapUiActions = {
  showAccept: boolean
  showCounterpartReject: boolean
  showApprove: boolean
  showReviewerReject: boolean
  showCancel: boolean
}

export type SwapStatusPresentation = {
  label: SwapStatus
  tone: 'warning' | 'info' | 'success' | 'danger' | 'neutral'
}

function replacementFor(swap: SwapRequest): string | null {
  return swap.replacement_staff_id || swap.new_host_id || swap.new_support_id || swap.new_technical_id || swap.counterpart_id || null
}

export function getSwapStatusPresentation(status: SwapStatus): SwapStatusPresentation {
  if (status === 'pending') return { label: status, tone: 'warning' }
  if (status === 'accepted') return { label: status, tone: 'info' }
  if (status === 'approved' || status === 'completed') return { label: status, tone: 'success' }
  if (status === 'rejected' || status === 'cancelled') return { label: status, tone: 'danger' }
  return { label: status, tone: 'neutral' }
}

export function getSwapUiActions(swap: SwapRequest, actor: User | null): SwapUiActions {
  const active = swap.status === 'pending' || swap.status === 'accepted'
  const isProductionMode = swap.mode === 'replacement' || swap.mode === 'exchange'
  const isRequester = actor?.id === swap.requester_id
  const isCounterpart = actor?.id === replacementFor(swap)
  const canReview = Boolean(actor && hasPermission(actor, 'swaps.approve'))
  const participantPending = swap.status === 'pending' && isProductionMode && isCounterpart
  const reviewerAccepted = swap.status === 'accepted' && isProductionMode && canReview

  return {
    showAccept: participantPending,
    showCounterpartReject: participantPending,
    showApprove: reviewerAccepted,
    showReviewerReject: reviewerAccepted,
    showCancel: active && isRequester,
  }
}
