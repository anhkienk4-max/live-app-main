/**
 * AI Prompt Templates for Analytics Insights
 * Used for analyzing trends, patterns, and generating strategic recommendations
 */

export const ANALYTICS_TREND_ANALYSIS_PROMPT = `Analyze the following performance data and identify key trends:

**Period:** {period}

**Revenue Data:**
{revenue_data}

**Viewer Data:**
{viewer_data}

**Order Data:**
{order_data}

**Provide:**
1. Top 3 trends identified
2. Possible causes or factors
3. Recommendations for management`

export const ANALYTICS_STAFF_PERFORMANCE_PROMPT = `Analyze staff performance data and provide insights:

**Staff Performance Summary:**
{staff_data}

**Provide:**
1. Top performers and what makes them successful
2. Performance patterns or correlations
3. Training or improvement recommendations
4. Optimal staff scheduling suggestions`

export const ANALYTICS_PLATFORM_COMPARISON_PROMPT = `Compare performance across platforms:

**Platform Data:**
{platform_data}

**Analyze:**
1. Which platform drives the most revenue and why
2. Platform-specific strengths and weaknesses
3. Optimal platform selection strategy
4. Budget allocation recommendations`

export const ANALYTICS_CAMPAIGN_EFFECTIVENESS_PROMPT = `Evaluate campaign performance:

**Campaign Results:**
{campaign_data}

**Baseline (No Campaign):**
- Average Revenue: ${baseline_revenue}
- Average Orders: {baseline_orders}
- Average Viewers: {baseline_viewers}

**Provide:**
1. Campaign ROI analysis
2. Most effective campaign types
3. Recommendations for future campaigns`

export const ANALYTICS_PREDICTIVE_INSIGHTS_PROMPT = `Based on historical data, predict future performance:

**Historical Data (Last 30 Days):**
{historical_data}

**Upcoming Schedule:**
{upcoming_schedule}

**Provide:**
1. Revenue forecast for next 7 days
2. Potential risk factors
3. Optimization opportunities`

/**
 * Generate trend analysis prompt
 */
export function generateTrendAnalysisPrompt(data: {
  period: string
  revenue_data: string
  viewer_data: string
  order_data: string
}): string {
  return ANALYTICS_TREND_ANALYSIS_PROMPT
    .replace('{period}', data.period)
    .replace('{revenue_data}', data.revenue_data)
    .replace('{viewer_data}', data.viewer_data)
    .replace('{order_data}', data.order_data)
}
