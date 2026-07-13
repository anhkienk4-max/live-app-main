/**
 * AI Prompt Templates for Swap Request Analysis
 * Used for evaluating swap requests and providing recommendations
 */

export const SWAP_EVALUATION_PROMPT = `Evaluate this shift swap request:

**Original Shift:**
- Brand: {original_brand}
- Platform: {original_platform}
- Date: {original_date}
- Time: {original_time}
- Original Host: {original_host}

**Proposed Replacement:**
- New Host: {new_host}

**Reason for Swap:**
{reason}

**Original Host Performance:**
{original_host_performance}

**Replacement Host Performance:**
{replacement_host_performance}

**Provide:**
1. Recommendation (Approve/Reject/Conditional Approval)
2. Impact assessment
3. Any concerns or requirements`

export const SWAP_RECOMMENDATION_PROMPT = `A swap request has been submitted. Recommend suitable replacement hosts:

**Shift Details:**
- Brand: {brand}
- Platform: {platform}
- Date: {date}
- Time: {start_time} - {end_time}
- Required Skills: {required_skills}

**Available Staff:**
{available_staff}

**Rank the top 3 suitable replacements and explain why.**`

export const SWAP_IMPACT_ANALYSIS_PROMPT = `Analyze the potential impact of this swap:

**Original Assignment:**
- Host: {original_host}
- Historical Performance: {original_performance}

**Proposed Assignment:**
- Host: {new_host}
- Historical Performance: {new_performance}

**Brand/Platform:**
- Brand: {brand}
- Platform: {platform}

**Assess:**
1. Expected performance change (positive/negative/neutral)
2. Risk level (low/medium/high)
3. Mitigation strategies if high risk`

export const SWAP_APPROVAL_MESSAGE_PROMPT = `Generate a professional approval/rejection message:

**Decision:** {decision}
**Requester:** {requester}
**Shift:** {shift_details}
**Reason:** {reason}
**Replacement:** {replacement}

**Generate an appropriate, professional message for the requester.**`

/**
 * Generate swap evaluation prompt
 */
export function generateSwapEvaluationPrompt(data: {
  original_brand: string
  original_platform: string
  original_date: string
  original_time: string
  original_host: string
  new_host: string
  reason: string
  original_host_performance: string
  replacement_host_performance: string
}): string {
  return SWAP_EVALUATION_PROMPT
    .replace('{original_brand}', data.original_brand)
    .replace('{original_platform}', data.original_platform)
    .replace('{original_date}', data.original_date)
    .replace('{original_time}', data.original_time)
    .replace('{original_host}', data.original_host)
    .replace('{new_host}', data.new_host)
    .replace('{reason}', data.reason)
    .replace('{original_host_performance}', data.original_host_performance)
    .replace('{replacement_host_performance}', data.replacement_host_performance)
}
