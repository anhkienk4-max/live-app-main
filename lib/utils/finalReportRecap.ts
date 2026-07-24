import type { FinalReportRecap } from '@/lib/types/database.types'

export const finalReportRecapFields = [
  { key: 'traffic_summary', translationKey: 'recapTrafficSummary', placeholderKey: 'recapTrafficSummaryPlaceholder' },
  { key: 'platform_vouchers', translationKey: 'recapPlatformVouchers', placeholderKey: 'recapPlatformVouchersPlaceholder' },
  { key: 'shop_vouchers', translationKey: 'recapShopVouchers', placeholderKey: 'recapShopVouchersPlaceholder' },
  { key: 'best_performing_time_slots', translationKey: 'recapBestPerformingTimeSlots', placeholderKey: 'recapBestPerformingTimeSlotsPlaceholder' },
  { key: 'customer_product_gift_interest', translationKey: 'recapCustomerProductGiftInterest', placeholderKey: 'recapCustomerProductGiftInterestPlaceholder' },
  { key: 'main_comment_topics', translationKey: 'recapMainCommentTopics', placeholderKey: 'recapMainCommentTopicsPlaceholder' },
  { key: 'live_price_feedback', translationKey: 'recapLivePriceFeedback', placeholderKey: 'recapLivePriceFeedbackPlaceholder' },
  { key: 'top_selling_products', translationKey: 'recapTopSellingProducts', placeholderKey: 'recapTopSellingProductsPlaceholder' },
  { key: 'live_issues', translationKey: 'recapLiveIssues', placeholderKey: 'recapLiveIssuesPlaceholder' },
] as const satisfies ReadonlyArray<{
  key: keyof FinalReportRecap
  translationKey: string
  placeholderKey: string
}>

export function emptyFinalReportRecap(): FinalReportRecap {
  return Object.fromEntries(finalReportRecapFields.map(field => [field.key, ''])) as FinalReportRecap
}

export function normalizeFinalReportRecap(
  recap?: FinalReportRecap,
): FinalReportRecap | undefined {
  const normalized = Object.fromEntries(
    finalReportRecapFields.flatMap(field => {
      const value = recap?.[field.key]?.trim()
      return value ? [[field.key, value]] : []
    }),
  ) as FinalReportRecap

  return Object.keys(normalized).length ? normalized : undefined
}
