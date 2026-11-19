import { z } from 'zod'

export const attendanceReviewBodySchema = z.object({
  event_id: z.string().uuid(),
  evidence_request_id: z.string().uuid(),
  expected_version: z.number().int().nonnegative(),
  decision: z.enum(['approved', 'rejected', 'correction_requested']),
  reason: z.string().trim().min(8).max(2000),
}).strict()
