/**
 * AI Prompt Templates for Shift Management
 * Used for scheduling optimization, conflict resolution, and recommendations
 */

export const SHIFT_CONFLICT_DETECTION_PROMPT = `Analyze the following shift schedule for conflicts:

**Shifts:**
{shift_list}

**Identify:**
1. Any scheduling conflicts (overlapping times, double-bookings)
2. Resource allocation issues
3. Potential problems with the schedule`

export const SHIFT_OPTIMIZATION_PROMPT = `Optimize the shift schedule based on the following data:

**Current Schedule:**
{current_schedule}

**Constraints:**
- Staff availability: {staff_availability}
- Peak viewing hours: {peak_hours}
- Budget: ${budget}

**Staff Performance Data:**
{staff_performance}

**Provide:**
1. Optimal shift assignments
2. Rationale for changes
3. Expected performance improvement`

export const SHIFT_COVERAGE_ANALYSIS_PROMPT = `Analyze shift coverage for the period:

**Period:** {period}
**Total Shifts Needed:** {total_needed}
**Scheduled Shifts:** {scheduled}
**Available Staff:** {available_staff}

**Identify:**
1. Coverage gaps
2. Over-staffed periods
3. Recommendations to balance coverage`

export const SHIFT_RECURRING_TEMPLATE_PROMPT = `Generate an optimal recurring shift template:

**Requirements:**
- Brand: {brand}
- Platform: {platform}
- Frequency: {frequency}
- Expected audience: {expected_audience}
- Budget per shift: ${budget_per_shift}

**Historical Performance (Same Brand/Platform):**
{historical_performance}

**Suggest:**
1. Optimal day of week
2. Optimal time slot
3. Recommended host based on performance data
4. Expected outcomes`

export const SHIFT_NOTES_GENERATION_PROMPT = `Generate professional shift notes:

**Shift Details:**
- Brand: {brand}
- Platform: {platform}
- Date: {date}
- Time: {start_time} - {end_time}

**Key Products:**
{products}

**Special Instructions:**
{special_instructions}

**Generate concise, actionable notes for the host and support team.**`

/**
 * Generate shift notes
 */
export function generateShiftNotesPrompt(data: {
  brand: string
  platform: string
  date: string
  start_time: string
  end_time: string
  products?: string[]
  special_instructions?: string
}): string {
  return SHIFT_NOTES_GENERATION_PROMPT
    .replace('{brand}', data.brand)
    .replace('{platform}', data.platform)
    .replace('{date}', data.date)
    .replace('{start_time}', data.start_time)
    .replace('{end_time}', data.end_time)
    .replace('{products}', data.products?.join(', ') || 'N/A')
    .replace('{special_instructions}', data.special_instructions || 'None')
}
