export interface ScheduleExportRow {
  /** Shift primary key */
  'Shift ID': string
  /** Import batch that created this shift, if any */
  'Import Batch ID': string
  /** ISO date string YYYY-MM-DD  (written as text in Excel) */
  'Date': string
  /** HH:MM 24-hour start time  (written as text in Excel) */
  'Start Time': string
  /** HH:MM 24-hour end time  (written as text in Excel) */
  'End Time': string
  /** Date of the end time — differs from Date only when crosses midnight */
  'End Date': string
  /** Whether the shift runs past midnight */
  'Crosses Midnight': boolean
  /** Total duration in minutes */
  'Duration (min)': number | ''
  'Brand': string
  'Platform': string
  'Campaign': string
  'Title': string
  'Studio': string
  /** Comma-separated assigned host full names from staffed registrations / assigned host_id */
  'Assigned Host Names': string
  /** Comma-separated assigned support full names from staffed registrations / assigned support_id */
  'Assigned Support Names': string
  /** Comma-separated assigned technical full names from staffed registrations / assigned technical_id */
  'Assigned Technical Names': string
  /** Comma-separated host display names from the imported schedule */
  'Scheduled Host Names': string
  /** Comma-separated assistant display names from the imported schedule */
  'Scheduled Support Names': string
  /** Comma-separated technical display names from the imported schedule */
  'Scheduled Technical Names': string
  'Required Host Count': number
  'Required Support Count': number
  'Required Technical Count': number
  'Status': string
  'Registration Locked': boolean
  'Live Link': string
  'Notes': string
}

/** Deterministic column order for the exported file. */
export const SCHEDULE_EXPORT_COLUMN_ORDER: ReadonlyArray<keyof ScheduleExportRow> = [
  'Shift ID',
  'Import Batch ID',
  'Date',
  'Start Time',
  'End Time',
  'End Date',
  'Crosses Midnight',
  'Duration (min)',
  'Brand',
  'Platform',
  'Campaign',
  'Title',
  'Studio',
  'Assigned Host Names',
  'Assigned Support Names',
  'Assigned Technical Names',
  'Scheduled Host Names',
  'Scheduled Support Names',
  'Scheduled Technical Names',
  'Required Host Count',
  'Required Support Count',
  'Required Technical Count',
  'Status',
  'Registration Locked',
  'Live Link',
  'Notes',
]
