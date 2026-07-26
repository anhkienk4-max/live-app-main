'use client'

import type { OcrReviewData } from '@/lib/types/database.types'
import { platformCanonicalMetricKeys } from '@/lib/utils/ocrCanonical'

export function OcrCandidateDiagnosticsTable({ review }: { review?: OcrReviewData | null }) {
  if (process.env.NODE_ENV === 'production' || !review) return null
  const conflictsByKey = new Map(
    (review.discarded_conflicts || []).map(conflict => [conflict.canonical_key, conflict]),
  )
  const keys = platformCanonicalMetricKeys(review.source_platform || 'other')

  return (
    <details className="rounded-lg border border-dashed p-3 text-xs" data-testid="ocr-candidate-diagnostics">
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
                <tr key={key}>
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
    </details>
  )
}
