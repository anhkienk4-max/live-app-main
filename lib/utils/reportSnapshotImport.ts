import type { DashboardUpdate, OcrReviewData, ReportDashboardPlatform } from '@/lib/types/database.types'
import { platformCanonicalMetricKeys, type MetricState } from '@/lib/utils/ocrCanonical'

export function reportSnapshotImport(
  snapshot: DashboardUpdate,
  shiftId: string,
  platform: ReportDashboardPlatform,
  actorId: string,
  now = new Date().toISOString(),
): { values: MetricState; review: OcrReviewData } {
  if (snapshot.shift_id !== shiftId || snapshot.deleted_at || platform === 'other' || snapshot.dashboard_platform !== platform) {
    throw new Error('The selected snapshot does not belong to this report target.')
  }
  const values: MetricState = {}
  const metrics: OcrReviewData['metrics'] = {}
  for (const key of platformCanonicalMetricKeys(platform)) {
    const value = snapshot.normalized_metrics?.[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    values[key] = value
    metrics[key] = {
      value,
      confidence: 'high',
      needs_review: false,
      normalized_key: key,
      source: 'imported',
      status: 'confirmed',
      confirmed_by: actorId,
      confirmed_at: now,
    }
  }
  if (Object.keys(values).length === 0) throw new Error('The selected snapshot has no usable metrics.')
  return {
    values,
    review: {
      status: 'review_required',
      source_platform: platform,
      source_snapshot: { id: snapshot.id, shift_id: shiftId, captured_at: snapshot.time, applied_by: actorId, applied_at: now },
      metrics,
    },
  }
}
