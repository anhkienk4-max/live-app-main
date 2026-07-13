/**
 * AI Prompt Templates for Dashboard Insights
 * Used for real-time analysis and recommendations during live sessions
 */

export const DASHBOARD_REALTIME_INSIGHTS_PROMPT = `You are monitoring a live e-commerce stream. Analyze the current metrics and provide real-time insights:

**Current Metrics:**
- Current Viewers: {current_viewers}
- Peak Viewers: {peak_viewers}
- Revenue So Far: ${revenue}
- Orders: {orders}
- Time Elapsed: {elapsed_minutes} minutes
- Scheduled Duration: {total_minutes} minutes

**Provide:**
1. Performance assessment (on track, ahead, or behind)
2. One actionable recommendation for the next 15 minutes
3. Projected end-of-session revenue based on current pace`

export const DASHBOARD_ALERT_PROMPT = `Generate an alert message for the operations team:

**Situation:**
- Expected update frequency: Every 30 minutes
- Last update: {minutes_since_last_update} minutes ago
- Current session: {brand} on {platform}
- Status: {status}

**Generate a professional alert message for the team.**`

export const DASHBOARD_PERFORMANCE_COMPARISON_PROMPT = `Compare this live session's performance to historical averages:

**Current Session:**
- Revenue: ${current_revenue}
- Viewers: {current_viewers}
- Orders: {current_orders}
- Duration: {current_duration} minutes

**Historical Average (Same Brand & Platform):**
- Average Revenue: ${avg_revenue}
- Average Viewers: {avg_viewers}
- Average Orders: {avg_orders}

**Provide a brief performance comparison and trend analysis.**`

export const DASHBOARD_OPTIMIZATION_PROMPT = `Based on real-time metrics, suggest optimizations:

**Current Data:**
- Viewer Count Trend: {viewer_trend} (increasing/stable/decreasing)
- Engagement Rate: {engagement_rate}%
- Conversion Rate: {conversion_rate}%
- Time: {current_time}

**Suggest 2-3 immediate actions the host or support team can take to improve performance.**`

/**
 * Generate real-time insights prompt
 */
export function generateDashboardInsightsPrompt(data: {
  current_viewers: number
  peak_viewers: number
  revenue: number
  orders: number
  elapsed_minutes: number
  total_minutes: number
}): string {
  return DASHBOARD_REALTIME_INSIGHTS_PROMPT
    .replace('{current_viewers}', data.current_viewers.toString())
    .replace('{peak_viewers}', data.peak_viewers.toString())
    .replace('{revenue}', data.revenue.toString())
    .replace('{orders}', data.orders.toString())
    .replace('{elapsed_minutes}', data.elapsed_minutes.toString())
    .replace('{total_minutes}', data.total_minutes.toString())
}
