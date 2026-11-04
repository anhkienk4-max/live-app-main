export type ReportExportKind = 'reports' | 'report' | 'images'

export async function downloadReportExport(kind: ReportExportKind, reportIds: string[]): Promise<void> {
  const response = await fetch('/api/reports/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, report_ids: reportIds }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null
    throw new Error(response.status === 403 ? 'You do not have permission to export these reports.'
      : payload?.error?.code || 'REPORT_EXPORT_FAILED')
  }

  const disposition = response.headers.get('Content-Disposition') || ''
  const filename = /filename="([^"]+)"/u.exec(disposition)?.[1] || 'reports.xlsx'
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
