export type DataQualitySeverity = 'info' | 'warning' | 'error'
export type DataQualitySource = 'schedule_import' | 'report' | 'staffing'

export interface DataQualityIssue {
  id: string
  severity: DataQualitySeverity
  source: DataQualitySource
  issue_code: string
  title: string
  message: string
  related_entity_type?: string
  related_entity_id?: string
  recoverable: boolean
  suggested_action?: string
  action_url?: string
  created_at: string
}

export type RecoveryActionId = 'retry_import' | 'reopen_import_history' | 'open_shift' | 'open_report' | 'review_staffing'

export interface RecoveryAction {
  id: RecoveryActionId
  label: string
  url: string
  external?: boolean
}
