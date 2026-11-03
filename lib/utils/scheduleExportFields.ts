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
  'Execution Source': string
  'Agency': string
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
  /** Optional KPI / Performance fields when authorized */
  'Target GMV'?: number | ''
  'Actual GMV'?: number | ''
  'Total Orders'?: number | ''
  'Peak Viewers'?: number | ''
}

/** Deterministic base operational column order for the exported file (26 columns). */
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
  'Execution Source',
  'Agency',
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

/** Authorized KPI / Performance columns. */
export const SCHEDULE_EXPORT_KPI_COLUMNS: ReadonlyArray<keyof ScheduleExportRow> = [
  'Target GMV',
  'Actual GMV',
  'Total Orders',
  'Peak Viewers',
]

/** Full extended column order including KPI fields. */
export const SCHEDULE_EXPORT_EXTENDED_COLUMN_ORDER: ReadonlyArray<keyof ScheduleExportRow> = [
  ...SCHEDULE_EXPORT_COLUMN_ORDER,
  ...SCHEDULE_EXPORT_KPI_COLUMNS,
]

/**
 * Header aliases following the latest KAO November specification.
 * Used for header normalization and dynamic column matching without hardcoding indices.
 */
export const KAO_SCHEDULE_HEADER_ALIASES: Readonly<Record<keyof ScheduleExportRow, readonly string[]>> = {
  'Shift ID': ['shift id', 'mã ca', 'ma ca', 'shift_id', 'id'],
  'Import Batch ID': ['import batch id', 'mã batch import', 'batch id', 'batch_id'],
  'Date': ['date', 'ngày', 'ngay', 'ngày live', 'ngay live'],
  'Start Time': ['start time', 'start', 'giờ bắt đầu', 'gio bat dau', 'từ giờ', 'tu gio'],
  'End Time': ['end time', 'end', 'giờ kết thúc', 'gio ket thuc', 'đến giờ', 'den gio'],
  'End Date': ['end date', 'ngày kết thúc', 'ngay ket thuc'],
  'Crosses Midnight': ['crosses midnight', 'qua ngày', 'qua dem'],
  'Duration (min)': ['duration', 'duration (min)', 'thời lượng', 'thời lượng (phút)'],
  'Brand': ['brand', 'thương hiệu', 'thuong hieu', 'nhãn hàng', 'nhan hang'],
  'Platform': ['platform', 'nền tảng', 'nen tang', 'kênh', 'kenh'],
  'Campaign': ['campaign', 'chiến dịch', 'chien dich'],
  'Title': ['title', 'shift title', 'shift name', 'tên ca', 'ten ca', 'tên phiên live'],
  'Studio': ['studio', 'phòng live', 'phong live', 'phòng quay', 'live studio'],
  'Execution Source': ['execution source', 'nguồn thực hiện', 'nguon thuc hien'],
  'Agency': ['agency', 'đơn vị vận hành', 'agency vận hành'],
  'Assigned Host Names': ['assigned host names', 'host', 'host đã gán', 'assigned host'],
  'Assigned Support Names': ['assigned support names', 'trợ live', 'tro live', 'trợ live đã gán', 'support'],
  'Assigned Technical Names': ['assigned technical names', 'kỹ thuật', 'ky thuat', 'kỹ thuật đã gán', 'technical'],
  'Scheduled Host Names': ['scheduled host names', 'host theo lịch', 'scheduled host'],
  'Scheduled Support Names': ['scheduled support names', 'trợ live theo lịch', 'scheduled support'],
  'Scheduled Technical Names': ['scheduled technical names', 'kỹ thuật theo lịch', 'scheduled technical'],
  'Required Host Count': ['required host count', 'số host cần', 'host count'],
  'Required Support Count': ['required support count', 'số trợ live cần', 'support count'],
  'Required Technical Count': ['required technical count', 'số kỹ thuật cần', 'technical count'],
  'Status': ['status', 'trạng thái', 'trang thai'],
  'Registration Locked': ['registration locked', 'khóa đăng ký', 'khoa dang ky'],
  'Live Link': ['live link', 'link livestream', 'đường dẫn live'],
  'Notes': ['notes', 'ghi chú', 'ghi chu', 'product notes'],
  'Target GMV': ['target gmv', 'chỉ tiêu gmv', 'kpi gmv', 'target_gmv'],
  'Actual GMV': ['actual gmv', 'doanh thu thực tế', 'doanh thu', 'actual_gmv', 'revenue'],
  'Total Orders': ['total orders', 'tổng đơn hàng', 'số đơn', 'orders'],
  'Peak Viewers': ['peak viewers', 'lượt xem đỉnh', 'pcu', 'peak_viewer'],
}
