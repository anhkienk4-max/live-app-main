import type { AppNotification, NotificationSeverity } from '@/lib/types/database.types'
import { notificationService } from '@/lib/services/notificationService'

type EventBase = { actorId?: string; reason?: string }

function create(
  userId: string,
  type: AppNotification['type'],
  severity: NotificationSeverity,
  title: string,
  message: string,
  related?: Pick<AppNotification,'related_entity_type'|'related_entity_id'|'action_url'>
): AppNotification {
  return notificationService._create({
    user_id: userId,
    type,
    title,
    message,
    severity,
    ...related,
  })
}

// Future producers can call these helpers; they are not wired to unfinished RPCs yet.
export const notificationEvents = {
  shiftAssigned: (userId: string, shiftId: string, title = 'Shift assigned') =>
    create(userId, 'shift_assigned', 'info', title, 'You have been assigned to a shift', { related_entity_type: 'shift', related_entity_id: shiftId, action_url: '/calendar' }),
  staffingApproved: (userId: string, shiftId: string) =>
    create(userId, 'staffing_approval', 'success', 'Staffing approved', 'Your shift registration was approved', { related_entity_type: 'shift', related_entity_id: shiftId, action_url: '/calendar' }),
  staffingRejected: (userId: string, shiftId: string, reason?: string) =>
    create(userId, 'staffing_rejection', 'warning', 'Staffing rejected', reason || 'Your request was rejected', { related_entity_type: 'shift', related_entity_id: shiftId, action_url: '/calendar' }),
  swapRequested: (userId: string, swapId: string) =>
    create(userId, 'swap_request', 'info', 'Swap request', 'A swap request needs your attention', { related_entity_type: 'swap_request', related_entity_id: swapId, action_url: '/swaps' }),
  swapAccepted: (userId: string, swapId: string) =>
    create(userId, 'swap_accepted', 'success', 'Swap accepted', 'Your swap was accepted', { related_entity_type: 'swap_request', related_entity_id: swapId, action_url: '/swaps' }),
  swapRejected: (userId: string, swapId: string) =>
    create(userId, 'swap_rejected', 'warning', 'Swap rejected', 'Your swap was rejected', { related_entity_type: 'swap_request', related_entity_id: swapId, action_url: '/swaps' }),
  reportSubmitted: (userId: string, reportId: string) =>
    create(userId, 'report_submitted', 'info', 'Report submitted', 'A report was submitted', { related_entity_type: 'report', related_entity_id: reportId, action_url: '/reports' }),
  reportReviewed: (userId: string, reportId: string, approved: boolean) =>
    create(userId, 'report_reviewed', approved ? 'success' : 'warning', approved ? 'Report approved' : 'Report needs review', approved ? 'Your report was approved' : 'Your report needs updates', { related_entity_type: 'report', related_entity_id: reportId, action_url: '/reports' }),
  importWarning: (userId: string, batchId: string, message: string) =>
    create(userId, 'import_warning', 'warning', 'Import warning', message, { related_entity_type: 'schedule_import', related_entity_id: batchId, action_url: '/calendar' }),
  importFailure: (userId: string, batchId: string, message: string) =>
    create(userId, 'import_failure', 'error', 'Import failed', message, { related_entity_type: 'schedule_import', related_entity_id: batchId, action_url: '/calendar' }),
}
