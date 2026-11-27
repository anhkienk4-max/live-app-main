import { z } from 'zod'

export const ExternalSummaryStateSchema = z.enum([
  'draft', 'submitted', 'approved', 'rejected', 'correction_requested',
])

export const ReportExternalSummaryWorkflowResponseSchema = z.object({
  reportId: z.string().min(1),
  summary: z.object({
    id: z.string().uuid(),
    content: z.string().min(1).max(4000),
    workflowState: ExternalSummaryStateSchema,
    version: z.number().int().positive(),
    createdBy: z.string().min(1),
    updatedBy: z.string().min(1),
    submittedBy: z.string().nullable(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
    reviewedBy: z.string().nullable(),
    reviewedAt: z.string().datetime({ offset: true }).nullable(),
    reviewReason: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  }).strict().nullable(),
}).strict()

export const ReportExternalSummaryWorkflowRequestSchema = z.object({
  action: z.enum(['save_draft', 'submit', 'approve', 'reject', 'request_correction']),
  reportId: z.string().trim().min(1).max(128),
  summaryId: z.string().uuid().nullable(),
  content: z.string().max(4000).nullable(),
  expectedVersion: z.number().int().nonnegative().nullable(),
  reason: z.string().max(1000).nullable(),
  idempotencyKey: z.string().uuid(),
}).strict()

export const ReportExternalSummaryWorkflowResultSchema = z.object({
  reportId: z.string().min(1),
  summaryId: z.string().uuid(),
  version: z.number().int().positive(),
  workflowState: ExternalSummaryStateSchema,
  replayed: z.boolean(),
  reportRevisionId: z.string().nullable(),
}).strict()

export const ReportExternalSummaryMutationResponseSchema = z.object({
  mutation: ReportExternalSummaryWorkflowResultSchema,
  readback: ReportExternalSummaryWorkflowResponseSchema,
}).strict()

export type ReportExternalSummaryWorkflowResponse = z.infer<typeof ReportExternalSummaryWorkflowResponseSchema>
export type ReportExternalSummaryWorkflowRequest = z.infer<typeof ReportExternalSummaryWorkflowRequestSchema>
export type ReportExternalSummaryWorkflowResult = z.infer<typeof ReportExternalSummaryWorkflowResultSchema>
export type ReportExternalSummaryMutationResponse = z.infer<typeof ReportExternalSummaryMutationResponseSchema>
