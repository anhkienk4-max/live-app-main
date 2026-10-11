import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_OPERATIONAL_FILE_BYTES } from '@/lib/files/operationalFileCatalog'

type Row = Record<string, unknown>
export type SystemExportScope = {
  brand_id: string
  platform_id: string
  period_date: string
  execution_source: 'internal' | 'agency'
}
export type SystemExportBundle = {
  schema: 'operational_system_export_v1'
  scope: SystemExportScope
  counts: Record<string, number>
  data: {
    shifts: Row[]
    reports: Row[]
    dashboard_updates: Row[]
    report_images: Row[]
    live_report_images: Row[]
    stored_files: Row[]
  }
}
export const SYSTEM_EXPORT_ROW_LIMIT = 1000

function safeRows(table: string, data: Row[] | null, error: { message?: string } | null): Row[] {
  if (error) throw new Error('OPERATIONAL_FILE_EXPORT_QUERY_FAILED')
  const rows = data ?? []
  // Supabase returns up to the limit; a full page cannot prove completeness.
  // Fail rather than upload an incomplete backup that appears successful.
  if (rows.length >= SYSTEM_EXPORT_ROW_LIMIT) {
    throw new Error('OPERATIONAL_FILE_EXPORT_ROW_LIMIT')
  }
  if (rows.some(row => typeof row.id !== 'string')) {
    throw new Error('OPERATIONAL_FILE_EXPORT_INVALID_ROW')
  }
  return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

/** A bounded daily scope snapshot; never claims to be a full database backup. */
export async function loadOperationalSystemExport(
  client: SupabaseClient,
  scope: SystemExportScope,
): Promise<SystemExportBundle> {
  const shiftsResult = await client.from('shifts').select('*')
    .eq('brand_id', scope.brand_id)
    .eq('platform_id', scope.platform_id)
    .eq('date', scope.period_date)
    .eq('execution_source', scope.execution_source)
    .limit(SYSTEM_EXPORT_ROW_LIMIT)
  const shifts = safeRows('shifts', shiftsResult.data as Row[] | null, shiftsResult.error)
  const shiftIds = shifts.map(row => String(row.id))
  const loadByIds = async (table: string, column: 'shift_id' | 'report_id', ids: string[]) => {
    if (!ids.length) return [] as Row[]
    const result = await client.from(table).select('*').in(column, ids).limit(SYSTEM_EXPORT_ROW_LIMIT)
    return safeRows(table, result.data as Row[] | null, result.error)
  }
  const [reports, dashboardUpdates] = await Promise.all([
    loadByIds('reports', 'shift_id', shiftIds),
    loadByIds('dashboard_updates', 'shift_id', shiftIds),
  ])
  const reportIds = reports.map(row => String(row.id))
  const [reportImages, liveReportImages, storedFiles] = await Promise.all([
    loadByIds('report_images', 'report_id', reportIds),
    loadByIds('live_report_images', 'report_id', reportIds),
    loadByIds('stored_files', 'report_id', reportIds),
  ])
  // Fail closed if Supabase returns unrelated rows; service role does not
  // automatically provide tenant isolation.
  if (shifts.some(row => row.brand_id !== scope.brand_id ||
    row.platform_id !== scope.platform_id || row.date !== scope.period_date ||
    row.execution_source !== scope.execution_source)) throw new Error('OPERATIONAL_FILE_EXPORT_SCOPE_MISMATCH')
  const shiftSet = new Set(shiftIds)
  const reportSet = new Set(reportIds)
  if (reports.some(row => !shiftSet.has(String(row.shift_id))) ||
    dashboardUpdates.some(row => !shiftSet.has(String(row.shift_id))) ||
    [...reportImages, ...liveReportImages, ...storedFiles].some(row => !reportSet.has(String(row.report_id)))) {
    throw new Error('OPERATIONAL_FILE_EXPORT_SCOPE_MISMATCH')
  }
  const data = {
    shifts, reports, dashboard_updates: dashboardUpdates,
    report_images: reportImages, live_report_images: liveReportImages,
    stored_files: storedFiles,
  }
  return {
    schema: 'operational_system_export_v1', scope,
    counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length])),
    data,
  }
}

export function encodeOperationalSystemExport(bundle: SystemExportBundle): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle, null, 2))
  if (!bytes.length || bytes.length > MAX_OPERATIONAL_FILE_BYTES) {
    throw new Error('OPERATIONAL_FILE_EXPORT_TOO_LARGE')
  }
  return bytes
}
