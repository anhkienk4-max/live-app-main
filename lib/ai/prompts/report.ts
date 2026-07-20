/**
 * AI Prompt Templates for Report Generation
 * Used for generating insights, summaries, and recommendations for live session reports
 */

export const REPORT_SUMMARY_PROMPT = `You are an AI assistant for a livestream e-commerce operations team.

Analyze the following live session metrics and provide a concise professional summary:

**Session Details:**
- Brand: {brand}
- Platform: {platform}
- Date: {date}
- Duration: {start_time} - {end_time}

**Performance Metrics:**
- Total Revenue: {revenue} VND
- Total Orders: {orders}
- Peak Viewers: {peak_viewers}
- Average Viewers: {avg_viewers}
- Engagement: {likes} likes, {comments} comments, {shares} shares

**Top Products:**
{top_products}

**Task:** Write a 2-3 sentence professional summary highlighting key achievements and notable metrics.`

export const REPORT_INSIGHTS_GOOD_PROMPT = `Based on the following live session performance data, identify 3-5 key positive highlights:

**Metrics:**
- Revenue: {revenue} VND
- Orders: {orders}
- Peak Viewers: {peak_viewers}
- Average Viewers: {avg_viewers}
- Engagement Rate: {engagement_rate}%

**Context:**
- Previous session average revenue: {prev_avg_revenue} VND
- Previous session average viewers: {prev_avg_viewers}

Provide bullet points of what went well and why.`

export const REPORT_INSIGHTS_IMPROVEMENT_PROMPT = `Based on the following live session data, suggest 3-5 actionable improvements:

**Metrics:**
- Revenue: {revenue} VND
- Orders: {orders}
- Peak Viewers: {peak_viewers}
- Average Viewers: {avg_viewers}
- Engagement Rate: {engagement_rate}%
- Drop-off Rate: {dropoff_rate}%

**Identify areas for improvement and provide specific, actionable recommendations.**`

export const REPORT_PRODUCT_ANALYSIS_PROMPT = `Analyze the performance of the following products from a live session:

{product_list}

Provide:
1. Which products performed best and why
2. Which products underperformed
3. Recommendations for future product selection`

/**
 * Generate a report summary prompt with actual data
 */
export function generateReportSummaryPrompt(data: {
  brand: string
  platform: string
  date: string
  start_time: string
  end_time: string
  revenue: number
  orders: number
  peak_viewers: number
  avg_viewers: number
  likes: number
  comments: number
  shares: number
  top_products?: string[]
}): string {
  return REPORT_SUMMARY_PROMPT
    .replace('{brand}', data.brand)
    .replace('{platform}', data.platform)
    .replace('{date}', data.date)
    .replace('{start_time}', data.start_time)
    .replace('{end_time}', data.end_time)
    .replace('{revenue}', data.revenue.toString())
    .replace('{orders}', data.orders.toString())
    .replace('{peak_viewers}', data.peak_viewers.toString())
    .replace('{avg_viewers}', data.avg_viewers.toString())
    .replace('{likes}', data.likes.toString())
    .replace('{comments}', data.comments.toString())
    .replace('{shares}', data.shares.toString())
    .replace('{top_products}', data.top_products?.join(', ') || 'N/A')
}
