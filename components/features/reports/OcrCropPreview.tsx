'use client'

import * as React from 'react'
import type {
  OcrCropBox,
  OcrReviewData,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import { clampOcrCrop, defaultOcrCrop } from '@/lib/utils/ocrImage'
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
  const previewRef = React.useRef<HTMLDivElement>(null)
  const regionDiagnostics = review?.region_diagnostics
  const selectedCandidate = regionDiagnostics?.dashboard_candidates.find(candidate =>
    candidate.id === regionDiagnostics.selected_candidate_id,
  )
  const insufficientTikTokAnchors = platform === 'tiktok_shop'
    && Boolean(regionDiagnostics)
    && (selectedCandidate?.anchor_count ?? 0) < 6
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
    onChange(clampOcrCrop({ ...value, [field]: numeric / 100 }))
  }

  const beginInteraction = (
    mode: CropInteractionMode,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (disabled || platform !== 'tiktok_shop') return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.dataset.startX = String(event.clientX)
    event.currentTarget.dataset.startY = String(event.clientY)
    event.currentTarget.dataset.startCrop = JSON.stringify(value)
    event.currentTarget.dataset.mode = mode
  }

  const moveInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const bounds = previewRef.current?.getBoundingClientRect()
    const rawStart = event.currentTarget.dataset.startCrop
    if (!bounds || !rawStart) return
    const start = JSON.parse(rawStart) as OcrCropBox
    const deltaX = (event.clientX - Number(event.currentTarget.dataset.startX)) / bounds.width
    const deltaY = (event.clientY - Number(event.currentTarget.dataset.startY)) / bounds.height
    onChange(resizeOcrCrop(start, event.currentTarget.dataset.mode as CropInteractionMode, deltaX, deltaY))
  }

  const endInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t('kpiCropPreview')}</p>
          <p className="text-xs text-muted-foreground">{t(platform === 'tiktok_shop' ? 'tiktokKpiCropHelp' : 'kpiCropHelp')}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={disabled || platform === 'other'} onClick={() => onChange(defaultOcrCrop(platform))}>
          {t(platform === 'tiktok_shop' ? 'resetTikTokKpiCrop' : 'resetPlatformCrop')}
        </Button>
      </div>
      <div className="overflow-hidden rounded border bg-black/5">
        <div ref={previewRef} className="relative mx-auto w-fit max-w-full touch-none">
          <img src={imageUrl} alt={t('dashboardCropPreview')} className="block max-h-80 max-w-full object-contain" />
          <div
            className={`absolute z-20 border-2 border-emerald-500 bg-emerald-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,.42)] ${platform === 'tiktok_shop' && !disabled ? 'cursor-move' : 'pointer-events-none'}`}
            style={{
              left: `${value.left * 100}%`,
              top: `${value.top * 100}%`,
              width: `${value.width * 100}%`,
              height: `${value.height * 100}%`,
            }}
            data-testid="ocr-crop-selection"
            data-crop-left={value.left}
            data-crop-top={value.top}
            data-crop-width={value.width}
            data-crop-height={value.height}
            onPointerDown={event => beginInteraction('move', event)}
            onPointerMove={moveInteraction}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
          >
            {platform === 'tiktok_shop' && !disabled && cropHandles.map(handle => (
              <div
                key={handle.mode}
                role="separator"
                aria-label={t('resizeTikTokKpiCrop')}
                className={`absolute h-3 w-3 rounded-full border border-white bg-emerald-600 shadow ${handle.className}`}
                data-testid={`ocr-crop-handle-${handle.mode}`}
                onPointerDown={event => beginInteraction(handle.mode, event)}
                onPointerMove={moveInteraction}
                onPointerUp={endInteraction}
                onPointerCancel={endInteraction}
              />
            ))}
          </div>
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
        <CropInput testId="ocr-crop-left" label={`${t('cropLeft')} %`} value={value.left} disabled={disabled} onChange={next => update('left', next)} />
        <CropInput testId="ocr-crop-top" label={`${t('cropTop')} %`} value={value.top} disabled={disabled} onChange={next => update('top', next)} />
        <CropInput testId="ocr-crop-width" label={`${t('cropWidth')} %`} value={value.width} disabled={disabled} onChange={next => update('width', next)} />
        <CropInput testId="ocr-crop-height" label={`${t('cropHeight')} %`} value={value.height} disabled={disabled} onChange={next => update('height', next)} />
      </div>
      {insufficientTikTokAnchors && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="ocr-crop-anchor-warning">
          {t('tiktokCropAnchorWarning')}
        </p>
      )}
      {platform === 'tiktok_shop' && onRetry && (
        <Button type="button" onClick={onRetry} disabled={disabled} data-testid="ocr-rescan-selected-crop">
          {t('rescanSelectedCrop')}
        </Button>
      )}
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
              ambiguous: regionDiagnostics.ambiguous,
              selection_required: regionDiagnostics.selection_required,
              selection_reason: regionDiagnostics.selection_reason,
              fallback_usage: regionDiagnostics.fallback_usage,
            }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

type CropInteractionMode = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

const cropHandles: Array<{ mode: Exclude<CropInteractionMode, 'move'>; className: string }> = [
  { mode: 'nw', className: '-left-1.5 -top-1.5 cursor-nwse-resize' },
  { mode: 'n', className: 'left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize' },
  { mode: 'ne', className: '-right-1.5 -top-1.5 cursor-nesw-resize' },
  { mode: 'e', className: '-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { mode: 'se', className: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
  { mode: 's', className: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { mode: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
  { mode: 'w', className: '-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize' },
]

export function resizeOcrCrop(start: OcrCropBox, mode: CropInteractionMode, deltaX: number, deltaY: number) {
  const minimum = .05
  const right = start.left + start.width
  const bottom = start.top + start.height
  let left = start.left
  let top = start.top
  let nextRight = right
  let nextBottom = bottom

  if (mode === 'move') {
    left = clamp(start.left + deltaX, 0, 1 - start.width)
    top = clamp(start.top + deltaY, 0, 1 - start.height)
    return { ...start, left, top }
  }
  if (mode.includes('w')) left = clamp(start.left + deltaX, 0, right - minimum)
  if (mode.includes('e')) nextRight = clamp(right + deltaX, start.left + minimum, 1)
  if (mode.includes('n')) top = clamp(start.top + deltaY, 0, bottom - minimum)
  if (mode.includes('s')) nextBottom = clamp(bottom + deltaY, start.top + minimum, 1)
  return clampOcrCrop({ left, top, width: nextRight - left, height: nextBottom - top })
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
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

function CropInput({ testId, label, value, disabled, onChange }: { testId: string; label: string; value: number; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="text-xs font-medium">{label}<Input data-testid={testId} className="mt-1" type="number" min="0" max="100" step="1" disabled={disabled} value={Math.round(value * 100)} onChange={event => onChange(event.target.value)} /></label>
}
