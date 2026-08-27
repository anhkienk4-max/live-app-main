import type { DataQualityIssue, DataQualitySeverity } from '@/lib/types/dataQuality'
import type { ImportResult } from '@/lib/utils/excelUtils'
import type { Report, Shift, ShiftRegistration } from '@/lib/types/database.types'
import { isStaffedRegistration } from '@/lib/services/supabaseShiftRegistrationService'

function issue(
  partial: Omit<DataQualityIssue, 'id' | 'created_at'> & { id?: string }
): DataQualityIssue {
  return {
    id: partial.id || Math.random().toString(36).slice(2, 9),
    created_at: new Date().toISOString(),
    ...partial,
  } as DataQualityIssue
}

export function getScheduleImportIssues(result: ImportResult | null, batchId?: string): DataQualityIssue[] {
  if (!result) return []
  const out: DataQualityIssue[] = []
  for (const row of result.rows) {
    if (row.row.errors.length > 0) {
      const unresolved = row.row.errors.some(e => /not found/i.test(e))
      out.push(issue({
        severity: 'error',
        source: 'schedule_import',
        issue_code: unresolved ? 'unresolved_brand_staff' : 'validation_failed',
        title: `Row ${row.row.row_number}: ${unresolved ? 'Unresolved reference' : 'Validation failed'}`,
        message: row.row.errors.join('; '),
        related_entity_type: 'schedule_import_row',
        related_entity_id: batchId ? `${batchId}:${row.row.row_number}` : `row-${row.row.row_number}`,
        recoverable: true,
        suggested_action: 'Review brand/staff names and re-import',
        action_url: '/calendar',
      }))
    }
    if (row.row.warnings.some(w => /already exists/i.test(w))) {
      out.push(issue({
        severity: 'warning',
        source: 'schedule_import',
        issue_code: 'duplicate_skipped',
        title: `Row ${row.row.row_number}: Duplicate skipped`,
        message: row.row.warnings.filter(w=>/already exists/i.test(w)).join('; '),
        related_entity_type: 'shift',
        related_entity_id: row.shift?.brand_id,
        recoverable: false,
        suggested_action: 'Open shift to verify',
        action_url: '/calendar',
      }))
    }
    if (row.row.warnings.some(w => /Ambiguous/i.test(w))) {
      out.push(issue({
        severity: 'warning',
        source: 'schedule_import',
        issue_code: 'ambiguous_reconciliation',
        title: `Row ${row.row.row_number}: Ambiguous match`,
        message: 'Multiple master records matched after normalization',
        related_entity_type: 'schedule_import_row',
        related_entity_id: batchId ? `${batchId}:${row.row.row_number}` : `row-${row.row.row_number}`,
        recoverable: true,
        suggested_action: 'Disambiguate master data',
        action_url: '/calendar',
      }))
    }
  }
  // retryable / warning rows without errors
  const retryable = result.rows.filter(r => r.row.errors.length===0 && r.row.warnings.length>0 && !r.shift)
  if (retryable.length) {
    // already covered as duplicate/ambiguous, keep light
  }
  return out
}

export function getReportIssues(reports: Report[], shifts: Shift[]): DataQualityIssue[] {
  const out: DataQualityIssue[] = []
  for (const r of reports) {
    if (!r.shift_id || !r.revenue && r.orders===0) {
      out.push(issue({
        severity: 'warning',
        source: 'report',
        issue_code: 'missing_required_fields',
        title: `Report ${r.id.slice(0,8)} missing fields`,
        message: 'Revenue/orders not set',
        related_entity_type: 'report',
        related_entity_id: r.id,
        recoverable: true,
        suggested_action: 'Open report to complete',
        action_url: '/reports',
      }))
    }
    if (r.status === 'draft' || r.metrics_confirmed===false) {
      out.push(issue({
        severity: 'info',
        source: 'report',
        issue_code: 'incomplete_report',
        title: `Draft report ${r.id.slice(0,8)}`,
        message: 'Report not yet confirmed',
        related_entity_type: 'report',
        related_entity_id: r.id,
        recoverable: true,
        suggested_action: 'Review report',
        action_url: '/reports',
      }))
    }
    if (r.ocr_review?.status === 'review_required' || r.raw_ocr_output?.includes('warning')) {
      out.push(issue({
        severity: 'warning',
        source: 'report',
        issue_code: 'ocr_warning',
        title: `Report ${r.id.slice(0,8)} OCR warning`,
        message: r.ocr_review?.error_message || 'OCR needs review',
        related_entity_type: 'report',
        related_entity_id: r.id,
        recoverable: true,
        suggested_action: 'Open report OCR',
        action_url: '/reports',
      }))
    }
    if (!shifts.find(s=> s.id===r.shift_id)) {
      out.push(issue({
        severity: 'error',
        source: 'report',
        issue_code: 'orphan_report',
        title: `Report ${r.id.slice(0,8)} orphan`,
        message: 'Linked shift not found',
        related_entity_type: 'report',
        related_entity_id: r.id,
        recoverable: false,
        action_url: '/reports',
      }))
    }
  }
  return out
}

export function getStaffingIssues(shifts: Shift[], registrations: ShiftRegistration[]): DataQualityIssue[] {
  const out: DataQualityIssue[] = []
  for (const shift of shifts) {
    if (shift.status !== 'scheduled') continue
    const required = (shift.required_host_count ?? 1) + (shift.required_support_count ?? 1) + (shift.required_technical_count ?? 1)
    const staffed = registrations.filter(r=> r.shift_id===shift.id && isStaffedRegistration(r)).length
    if (staffed < required) {
      out.push(issue({
        severity: 'warning',
        source: 'staffing',
        issue_code: 'missing_staffed_slot',
        title: `${shift.title || shift.date} missing staff`,
        message: `Scheduled shift requires ${required} staffed, has ${staffed}`,
        related_entity_type: 'shift',
        related_entity_id: shift.id,
        recoverable: true,
        suggested_action: 'Review staffing',
        action_url: `/calendar`,
      }))
    }
    // stale display metadata: host_names etc present but no matching staffed registration for that name (light check)
    const displayNames = [...(shift.host_names||[]), ...(shift.assistant_names||[]), ...(shift.technical_names||[])]
    if (displayNames.length>0) {
      const hasUnmatched = displayNames.some(name => !registrations.some(r=> r.shift_id===shift.id && r.imported_name===name))
      // only flag as info, not error, to avoid noise — keep minimal
      if (hasUnmatched && staffed===0) {
        out.push(issue({
          severity: 'info',
          source: 'staffing',
          issue_code: 'stale_display_metadata',
          title: `${shift.title || shift.date} display names not yet mapped`,
          message: `Imported names: ${displayNames.slice(0,3).join(', ')}`,
          related_entity_type: 'shift',
          related_entity_id: shift.id,
          recoverable: true,
          suggested_action: 'Review staffing labels',
          action_url: '/calendar',
        }))
      }
    }
  }
  return out
}

export function getAllIssues(args: { importResult?: ImportResult | null; reports?: Report[]; shifts?: Shift[]; registrations?: ShiftRegistration[]; batchId?: string }): DataQualityIssue[] {
  return [
    ...getScheduleImportIssues(args.importResult || null, args.batchId),
    ...getReportIssues(args.reports || [], args.shifts || []),
    ...getStaffingIssues(args.shifts || [], args.registrations || []),
  ]
}

export function recoveryActionFor(issue: DataQualityIssue): { label: string; url: string } {
  switch (issue.issue_code) {
    case 'validation_failed':
    case 'unresolved_brand_staff':
    case 'ambiguous_reconciliation': return { label: 'Retry Import', url: '/calendar' }
    case 'duplicate_skipped': return { label: 'Open Shift', url: issue.action_url || '/calendar' }
    case 'missing_required_fields':
    case 'incomplete_report':
    case 'ocr_warning': return { label: 'Open Report', url: '/reports' }
    case 'missing_staffed_slot':
    case 'stale_display_metadata': return { label: 'Review Staffing', url: '/calendar' }
    default: return { label: 'Reopen Import History', url: '/calendar' }
  }
}
