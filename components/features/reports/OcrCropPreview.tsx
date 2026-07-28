'use client'

import type {
  OcrCropBox,
  OcrReviewData,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import { defaultOcrCrop } from '@/lib/utils/ocrImage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'

export function OcrCropPreview({
  imageUrl,
  platform,
  value,
  onChange,
  onRetry,
  review,
  disabled = false,
}: {
  imageUrl: string
  platform: ReportDashboardPlatform
  value: OcrCropBox
  onChange: (value: OcrCropBox) => void
  onRetry?: () => void
  review?: OcrReviewData | null
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const regionDiagnostics = review?.region_diagnostics
  const showRegionSelection = Boolean(
    regionDiagnostics
    && (
      regionDiagnostics.selection_required
      || regionDiagnostics.dashboard_candidates.length > 1
      || regionDiagnostics.selection_reason === 'low_confidence'
    ),
  )
  const update = (field: keyof OcrCropBox, percent: string) => {
    const numeric = Number(percent)
    if (!Number.isFinite(numeric)) return
    onChange({ ...value, [field]: numeric / 100 })
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t('kpiCropPreview')}</p>
          <p className="text-xs text-muted-foreground">{t('kpiCropHelp')}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={disabled || platform === 'other'} onClick={() => onChange(defaultOcrCrop(platform))}>
          {t('resetPlatformCrop')}
        </Button>
      </div>
      <div className="overflow-hidden rounded border bg-black/5">
        <div className="relative mx-auto w-fit max-w-full">
          <img src={imageUrl} alt={t('dashboardCropPreview')} className="block max-h-80 max-w-full object-contain" />
          <div
            className="pointer-events-none absolute border-2 border-emerald-500 bg-emerald-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,.42)]"
            style={{
              left: `${value.left * 100}%`,
              top: `${value.top * 100}%`,
              width: `${value.width * 100}%`,
              height: `${value.height * 100}%`,
            }}
          />
          {showRegionSelection && regionDiagnostics?.dashboard_candidates.map(candidate => {
            const selected = candidate.id === regionDiagnostics.selected_candidate_id
            return (
              <button
                type="button"
                key={candidate.id}
                disabled={disabled}
                className={`absolute border-2 text-left transition-colors ${selected ? 'border-emerald-400 bg-emerald-400/15' : 'border-amber-400 bg-amber-400/10 hover:bg-amber-400/20'}`}
                style={{
                  left: `${candidate.crop_box.left * 100}%`,
                  top: `${candidate.crop_box.top * 100}%`,
                  width: `${candidate.crop_box.width * 100}%`,
                  height: `${candidate.crop_box.height * 100}%`,
                }}
                onClick={() => onChange(candidate.crop_box)}
                data-testid={`ocr-dashboard-region-${candidate.id}`}
                aria-label={`${candidate.platform} ${Math.round(candidate.confidence * 100)}%`}
              >
                <span className="absolute left-0 top-0 max-w-full truncate bg-black/75 px-1 py-0.5 text-[10px] font-semibold text-white">
                  {candidate.platform === 'shopee_live' ? 'Shopee' : 'TikTok'} · {Math.round(candidate.confidence * 100)}% · {candidate.anchor_count} {t('ocrAnchors')}
                </span>
              </button>
            )
          })}
          {process.env.NODE_ENV !== 'production' && review?.original_dimensions && (
            <SpatialDiagnosticOverlay review={review} />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CropInput label={`${t('cropLeft')} %`} value={value.left} disabled={disabled} onChange={next => update('left', next)} />
        <CropInput label={`${t('cropTop')} %`} value={value.top} disabled={disabled} onChange={next => update('top', next)} />
        <CropInput label={`${t('cropWidth')} %`} value={value.width} disabled={disabled} onChange={next => update('width', next)} />
        <CropInput label={`${t('cropHeight')} %`} value={value.height} disabled={disabled} onChange={next => update('height', next)} />
      </div>
      {showRegionSelection && regionDiagnostics && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="ocr-dashboard-region-selector">
          <p className="text-sm font-medium text-amber-950">
            {regionDiagnostics.ambiguous ? t('ocrAmbiguousRegions') : t('ocrLowConfidenceRegion')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {regionDiagnostics.dashboard_candidates.map(candidate => (
              <button
                type="button"
                className="rounded border bg-white p-2 text-left text-xs hover:border-amber-500"
                disabled={disabled}
                key={`summary-${candidate.id}`}
                onClick={() => onChange(candidate.crop_box)}
              >
                <span className="font-semibold">{candidate.platform === 'shopee_live' ? 'Shopee Live' : 'TikTok Shop'}</span>
                <span className="block text-muted-foreground">
                  {Math.round(candidate.confidence * 100)}% · {candidate.anchor_count} {t('ocrAnchors')} · {candidate.source_method}
                </span>
              </button>
            ))}
          </div>
          {onRetry && (
            <Button type="button" size="sm" onClick={onRetry} disabled={disabled} data-testid="ocr-retry-selected-region">
              {t('retryOcrSelectedRegion')}
            </Button>
          )}
        </div>
      )}
      {regionDiagnostics && (
        <details className="rounded-lg border border-dashed p-3 text-xs" data-testid="ocr-region-diagnostics">
          <summary className="cursor-pointer font-medium">{t('ocrRegionDiagnostics')}</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words">
            {JSON.stringify({
              original_dimensions: regionDiagnostics.original_dimensions,
              platform_candidates: regionDiagnostics.platform_candidates,
              dashboard_candidates: regionDiagnostics.dashboard_candidates.map(candidate => ({
                id: candidate.id,
                platform: candidate.platform,
                bounding_box: candidate.bounding_box,
                confidence: candidate.confidence,
                anchor_count: candidate.anchor_count,
                anchors: candidate.anchor_keys,
                area_ratio: candidate.area_ratio,
                aspect_ratio: candidate.aspect_ratio,
                ocr_readability: candidate.ocr_readability,
                source_method: candidate.source_method,
                perspective_correction_applied: candidate.perspective_correction_applied,
              })),
              selected_candidate_id: regionDiagnostics.selected_candidate_id,
              selected_roi: regionDiagnostics.selected_roi,
              normalized_roi_dimensions: regionDiagnostics.normalized_roi_dimensions,
              perspective_correction_applied: regionDiagnostics.perspective_correction_applied,
              selection_reason: regionDiagnostics.selection_reason,
              fallback_usage: regionDiagnostics.fallback_usage,
            }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

function SpatialDiagnosticOverlay({ review }: { review: OcrReviewData }) {
  const dimensions = review.original_dimensions
  if (!dimensions?.width || !dimensions.height) return null
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      preserveAspectRatio="none"
    >
      {Object.entries(review.metrics).map(([key, metric]) => {
        const label = metric.label_box
        const value = metric.value_box
        if (!label && !value) return null
        const labelCenter = label && {
          x: label.x + label.width / 2,
          y: label.y + label.height / 2,
        }
        const valueCenter = value && {
          x: value.x + value.width / 2,
          y: value.y + value.height / 2,
        }
        const confirmed = metric.status === 'confirmed' || metric.status === 'accepted'
        const color = confirmed ? '#22c55e' : '#f59e0b'
        return (
          <g key={key}>
            {label && <rect {...label} fill="none" stroke="#22c55e" strokeWidth="3" />}
            {value && <rect {...value} fill="none" stroke="#3b82f6" strokeWidth="3" />}
            {labelCenter && valueCenter && (
              <line
                x1={labelCenter.x}
                y1={labelCenter.y}
                x2={valueCenter.x}
                y2={valueCenter.y}
                stroke={color}
                strokeWidth="2"
              />
            )}
            <text
              x={value?.x ?? label?.x ?? 0}
              y={Math.max(12, (value?.y ?? label?.y ?? 0) - 4)}
              fill={color}
              fontSize="12"
              fontWeight="700"
            >
              {key} {Math.round((metric.pair_score ?? 0) * 100)}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function CropInput({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="text-xs font-medium">{label}<Input className="mt-1" type="number" min="0" max="100" step="1" disabled={disabled} value={Math.round(value * 100)} onChange={event => onChange(event.target.value)} /></label>
}
