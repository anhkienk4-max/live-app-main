/** Storage Contract V2. Provider files remain outside Supabase; only references are indexed. */
export const OPERATIONAL_FILE_CATEGORY_FOLDERS = {
  schedule_source: ['OPS', 'SCHEDULE', 'SOURCE'],
  schedule_export: ['OPS', 'SCHEDULE', 'EXPORT'],
  live_snapshot: ['DATA', 'SNAPSHOTS'],
  video_recording: ['VIDEO', 'RECORDING'],
  video_livecut: ['VIDEO', 'LIVECUT'],
  production_asset: ['PRODUCTION', 'ASSETS'],
  content_script: ['CONTENT', 'SCRIPT'],
  content_brief: ['CONTENT', 'BRIEF'],
  campaign_document: ['CAMPAIGN', 'DOCUMENTS'],
  staffing_document: ['OPS', 'STAFFING'],
  acceptance_document: ['DELIVERABLES', 'ACCEPTANCE'],
  payment_document: ['INTERNAL', 'FINANCE'],
  ai_output: ['AI', 'OUTPUTS'],
  system_export: ['SYSTEM', 'EXPORTS'],
  sop_document: ['DOCUMENTS', 'SOP'],
} as const

export type OperationalFileCategory = keyof typeof OPERATIONAL_FILE_CATEGORY_FOLDERS
export const OPERATIONAL_FILE_CATEGORIES = Object.keys(OPERATIONAL_FILE_CATEGORY_FOLDERS) as OperationalFileCategory[]

export const OPERATIONAL_FILE_CATEGORY_LABELS: Record<OperationalFileCategory, string> = {
  schedule_source: 'Lịch livestream · File gốc',
  schedule_export: 'Lịch livestream · File xuất',
  live_snapshot: 'Chỉ số theo thời gian',
  video_recording: 'Video ghi hình livestream',
  video_livecut: 'Video livecut',
  production_asset: 'Production Assets · KV / Logo / Raw',
  content_script: 'Kịch bản · Caption',
  content_brief: 'Content Brief',
  campaign_document: 'Campaign / Voucher / Scheme',
  staffing_document: 'Staffing · Timesheet · Phân ca',
  acceptance_document: 'Nghiệm thu / Bàn giao',
  payment_document: 'Finance · Invoice · Payment',
  ai_output: 'AI Image / Video / OCR',
  system_export: 'System Exports · Backup',
  sop_document: 'SOP · Guideline · Templates',
}

const IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VIDEO = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const AUDIO = new Set(['audio/mpeg', 'audio/wav', 'audio/mp4'])
const DOCUMENT = new Set([
  'application/pdf', 'text/plain', 'text/csv', 'application/json',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
const TABULAR = new Set(['text/csv', 'application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
const UNIVERSAL = new Set([...IMAGE, ...DOCUMENT, ...VIDEO, ...AUDIO])

const categoryMimes: Record<OperationalFileCategory, ReadonlySet<string>> = {
  schedule_source: TABULAR,
  schedule_export: TABULAR,
  live_snapshot: new Set([...IMAGE, ...TABULAR, 'application/json']),
  video_recording: VIDEO,
  video_livecut: VIDEO,
  production_asset: new Set([...IMAGE, ...VIDEO, ...AUDIO, ...DOCUMENT]),
  content_script: DOCUMENT,
  content_brief: new Set([...DOCUMENT, ...IMAGE]),
  campaign_document: new Set([...DOCUMENT, ...IMAGE]),
  staffing_document: DOCUMENT,
  acceptance_document: new Set([...DOCUMENT, ...IMAGE]),
  payment_document: DOCUMENT,
  ai_output: UNIVERSAL,
  system_export: DOCUMENT,
  sop_document: new Set([...DOCUMENT, ...IMAGE]),
}

const extensionMime: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const MAX_OPERATIONAL_FILE_BYTES = 25 * 1024 * 1024

/** Extension and declared MIME must agree. No executable, SVG, HTML or arbitrary zip. */
export function resolveOperationalFileMime(category: OperationalFileCategory, fileName: string, declaredMime: string): string {
  const suffix = fileName.toLowerCase().split('.').pop() || ''
  const expected = extensionMime[suffix]
  if (!expected || !categoryMimes[category].has(expected)) throw new Error('OPERATIONAL_FILE_TYPE_NOT_ALLOWED')
  const actual = declaredMime.trim().toLowerCase()
  if (actual && actual !== 'application/octet-stream' && actual !== expected) {
    // Browsers sometimes classify CSV as legacy Excel, otherwise fail closed.
    if (!(suffix === 'csv' && actual === 'application/vnd.ms-excel')) {
      throw new Error('OPERATIONAL_FILE_MIME_MISMATCH')
    }
  }
  return expected
}

export function operationalFileSegments(category: OperationalFileCategory): string[] {
  return [...OPERATIONAL_FILE_CATEGORY_FOLDERS[category]]
}
