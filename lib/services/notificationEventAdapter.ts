import type { AppNotification, NotificationSeverity, NotificationType } from '@/lib/types/database.types'
import { notificationService } from '@/lib/services/notificationService'

function create(
  userId: string,
  type: NotificationType,
  severity: NotificationSeverity,
  title: string,
  message: string,
  eventKey: string,
  related?: Pick<AppNotification, 'related_entity_type' | 'related_entity_id' | 'action_url'>,
): AppNotification {
  return notificationService._create({
    user_id: userId,
    type,
    title,
    message,
    severity,
    event_key: eventKey,
    ...related,
  })
}

export const notificationEvents = {
  registrationSubmitted: (userId: string, registrationId: string, shiftId: string) =>
    create(userId, 'registration_submitted', 'info', 'Registration pending', 'A staff member submitted a shift registration for review.', `registration_submitted:${registrationId}:${userId}`, { related_entity_type: 'shift', related_entity_id: shiftId, action_url: '/calendar' }),
  shiftAssigned: (userId: string, registrationId: string, shiftId: string) =>
    create(userId, 'shift_assigned', 'info', 'Shift assigned', 'You were assigned to a shift.', `shift_assigned:${registrationId}:${userId}`, { related_entity_type: 'shift', related_entity_id: shiftId, action_url: '/calendar' }),
  staffingApproved: (userId: string, registrationId: string, shiftId: string) =>
    create(userId, 'staffing_approval', 'success', 'Registration approved', 'Your shift registration was approved.', `staffing_approval:${registrationId}:${userId}`, { related_entity_type: 'shift', related_entity_id: shiftId, action_url: '/calendar' }),
  staffingRejected: (userId: string, registrationId: string, shiftId: string, reason?: string) =>
    create(userId, 'staffing_rejection', 'warning', 'Registration rejected', reason || 'Your shift registration was rejected.', `staffing_rejection:${registrationId}:${userId}`, { related_entity_type: 'shift', related_entity_id: shiftId, action_url: '/calendar' }),
  swapRequested: (userId: string, swapId: string) =>
    create(userId, 'swap_request', 'info', 'Swap request', 'A swap request needs your response.', `swap_request:${swapId}:${userId}`, { related_entity_type: 'swap_request', related_entity_id: swapId, action_url: '/swaps' }),
  swapAccepted: (userId: string, swapId: string) =>
    create(userId, 'swap_accepted', 'success', 'Swap accepted', 'The swap request was accepted.', `swap_accepted:${swapId}:${userId}`, { related_entity_type: 'swap_request', related_entity_id: swapId, action_url: '/swaps' }),
  swapRejected: (userId: string, swapId: string) =>
    create(userId, 'swap_rejected', 'warning', 'Swap rejected', 'The swap request was rejected.', `swap_rejected:${swapId}:${userId}`, { related_entity_type: 'swap_request', related_entity_id: swapId, action_url: '/swaps' }),
  swapApproved: (userId: string, swapId: string) =>
    create(userId, 'swap_approved', 'success', 'Swap approved', 'Your swap request was completed.', `swap_approved:${swapId}:${userId}`, { related_entity_type: 'swap_request', related_entity_id: swapId, action_url: '/swaps' }),
  reportSubmitted: (userId: string, reportId: string) =>
    create(userId, 'report_submitted', 'info', 'Report submitted', 'A report is ready for review.', `report_submitted:${reportId}:${userId}`, { related_entity_type: 'report', related_entity_id: reportId, action_url: '/reports' }),
  reportReviewed: (userId: string, reportId: string, approved: boolean) =>
    create(userId, 'report_reviewed', approved ? 'success' : 'warning', approved ? 'Report approved' : 'Report needs updates', approved ? 'Your report was approved.' : 'Your report needs updates.', `report_reviewed:${reportId}:${userId}:${approved ? 'approved' : 'reopened'}`, { related_entity_type: 'report', related_entity_id: reportId, action_url: '/reports' }),
  importCompleted: (userId: string, batchId: string) =>
    create(userId, 'import_completed', 'success', 'Import completed', 'Your schedule import completed.', `import_completed:${batchId}:${userId}`, { related_entity_type: 'schedule_import', related_entity_id: batchId, action_url: '/calendar' }),
  importFailure: (userId: string, batchId: string, message: string) =>
    create(userId, 'import_failure', 'error', 'Import failed', message, `import_failure:${batchId}:${userId}`, { related_entity_type: 'schedule_import', related_entity_id: batchId, action_url: '/calendar' }),
}
