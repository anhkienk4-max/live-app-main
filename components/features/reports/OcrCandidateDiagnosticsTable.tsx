'use client'

import type { OcrReviewData } from '@/lib/types/database.types'
import { platformCanonicalMetricKeys } from '@/lib/utils/ocrCanonical'

export function OcrCandidateDiagnosticsTable({
  review,
  canExport = false,
}: {
  review?: OcrReviewData | null
  canExport?: boolean
}) {
  if (!review) return null
  const showTable = process.env.NODE_ENV !== 'production'
  const exportAvailable = canExport && Boolean(review.diagnostic_export)
  if (!showTable && !exportAvailable) return null
  const conflictsByKey = new Map(
    (review.discarded_conflicts || []).map(conflict => [conflict.canonical_key, conflict]),
  )
  const keys = platformCanonicalMetricKeys(review.source_platform || 'other')

  return (
    <div className="space-y-2">
      {exportAvailable && (
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
          onClick={() => downloadOcrDiagnostics(review)}
          data-testid="ocr-download-diagnostics"
        >
          Download OCR diagnostics JSON
        </button>
      )}
      {showTable && <details className="rounded-lg border border-dashed p-3 text-xs" data-testid="ocr-candidate-diagnostics">
      <summary className="cursor-pointer font-semibold">OCR candidate diagnostics</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr>
              {['Canonical key', 'Selected source', 'Raw label', 'Raw value', 'Normalized value', 'Destination input', 'Status', 'Discarded conflict', 'Reason'].map(label => (
                <th key={label} className="border p-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map(key => {
              const metric = review.metrics[key]
              const conflict = conflictsByKey.get(key)
              return (
                <tr
                  key={key}
                  data-ocr-evidence-groups={JSON.stringify(metric?.strategy_candidates || [])}
                >
                  <td className="border p-2 font-mono">{key}</td>
                  <td className="border p-2">{metric?.source || 'missing'}</td>
                  <td className="border p-2">{metric?.original_label || '—'}</td>
                  <td className="border p-2">{metric?.raw_value || '—'}</td>
                  <td className="border p-2">{metric?.value ?? metric?.candidate_value ?? '—'}</td>
                  <td className="border p-2 font-mono">{key}</td>
                  <td className="border p-2">{metric?.status || 'missing'}</td>
                  <td className="border p-2">{conflict ? `${conflict.discarded_value ?? '—'} (${conflict.discarded_source || 'unknown'})` : '—'}</td>
                  <td className="border p-2">{conflict?.reason || metric?.pairing_reason || metric?.rejection_reason || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </details>}
    </div>
  )
}

function downloadOcrDiagnostics(review: OcrReviewData) {
  if (!review.diagnostic_export) return
  const blob = new Blob(
    [JSON.stringify(review.diagnostic_export, null, 2)],
    { type: 'application/json' },
  )
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  link.href = objectUrl
  link.download = `ocr-diagnostics-${review.source_platform || 'unknown'}-${timestamp}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
