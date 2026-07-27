import type {
  OcrReviewData,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import {
  metricMatchesFilter,
  type OcrMetricFilter,
} from '@/lib/utils/ocrReview'
import {
  shopeeMainMetricKeys,
  shopeeSupplementaryMetricKeys,
  tiktokCentralMetricKeys,
  type CanonicalMetricKey,
  type MetricState,
} from '@/lib/utils/ocrCanonical'

export const defaultFinalReportMetricFilter: OcrMetricFilter = 'all'

export function finalReportMetricKeysForFilter({
  platform,
  filter,
  values,
  review,
}: {
  platform: ReportDashboardPlatform
  filter: OcrMetricFilter
  values: MetricState
  review: OcrReviewData
}): {
  main: CanonicalMetricKey[]
  supplementary: CanonicalMetricKey[]
} {
  const main = platform === 'shopee_live'
    ? shopeeMainMetricKeys
    : platform === 'tiktok_shop'
      ? tiktokCentralMetricKeys
      : []
  const supplementary = platform === 'shopee_live'
    ? shopeeSupplementaryMetricKeys
    : []
  const matches = (key: CanonicalMetricKey) =>
    metricMatchesFilter(filter, values[key], review.metrics[key])

  return {
    main: main.filter(matches),
    supplementary: supplementary.filter(matches),
  }
}
