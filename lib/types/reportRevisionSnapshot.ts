import { z } from 'zod'

const noteCategories = ['normal', 'attendance', 'swap', 'incident', 'sales', 'other'] as const
const noteStates = ['draft', 'submitted', 'reviewed', 'correction_requested'] as const
const incidentTypes = ['skip', 'absent', 'authorized_absence', 'late', 'early_leave',
  'approved_pass', 'approved_swap', 'planned_reassignment', 'other'] as const
const incidentStates = ['pending', 'confirmed', 'rejected', 'corrected'] as const

export const ReportRevisionSourceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  notes: z.array(z.object({
    noteId: z.string().min(1),
    version: z.number().int().positive(),
    businessDate: z.string().date(),
    actualEventTime: z.string().datetime({ offset: true }),
    category: z.enum(noteCategories),
    note: z.string(),
    workflowState: z.enum(noteStates),
    authorId: z.string().min(1),
    authorName: z.string().nullable(),
    authorRole: z.string().nullable(),
    affectedRole: z.enum(['host', 'support', 'technical']).nullable(),
    affectedUserId: z.string().nullable(),
    staffingSegmentId: z.string().nullable(),
    canonicalIncidentId: z.string().uuid().nullable(),
  }).strict()),
  noteRefs: z.array(z.object({
    noteId: z.string().min(1), version: z.number().int().positive(),
    canonicalIncidentId: z.string().uuid().nullable(),
  }).strict()),
  incidents: z.array(z.object({
    incidentId: z.string().uuid(),
    version: z.number().int().positive(),
    staffingSegmentId: z.string().nullable(),
    originalRegistrationId: z.string().min(1),
    originalStaffId: z.string().min(1),
    replacementRegistrationId: z.string().nullable(),
    replacementStaffId: z.string().nullable(),
    replacementReceiptId: z.string().uuid().nullable(),
    role: z.enum(['host', 'support', 'technical']),
    businessDate: z.string().date(),
    type: z.enum(incidentTypes),
    reviewState: z.enum(incidentStates),
    effectiveAt: z.string().datetime({ offset: true }).nullable(),
    reason: z.string(),
    evidenceReferenceId: z.string().nullable(),
    verifiedLateMinutes: z.number().int().nonnegative().nullable(),
    createdBy: z.string().min(1),
  }).strict()),
  incidentRefs: z.array(z.object({ incidentId: z.string().uuid(), version: z.number().int().positive() }).strict()),
  approvedExternalSummary: z.object({
    summaryId: z.string().uuid(),
    version: z.number().int().positive(),
    approvedBy: z.string().min(1),
    approvedAt: z.string().datetime({ offset: true }),
  }).strict().optional(),
}).strict()

export const ReportExternalProjectionSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.string().min(1),
  revisionVersion: z.number().int().nonnegative(),
  status: z.enum(['draft', 'in_review', 'confirmed', 'reopened', 'archived']),
  metrics: z.object({
    revenue: z.number(),
    orders: z.number().int(),
    peakViewer: z.number().int(),
    averageViewer: z.number().int(),
    gmv: z.number().nullable(),
    viewers: z.number().int().nullable(),
    productClicks: z.number().int().nullable(),
    ctr: z.number().nullable(),
    cvr: z.number().nullable(),
    averageOrderValue: z.number().nullable(),
    liveDurationMinutes: z.number().int().nullable(),
    dashboardPlatform: z.string(),
  }).strict(),
  operationalSummary: z.object({
    version: z.number().int().positive(),
    content: z.string().min(1).max(4000),
  }).strict().nullable().optional(),
}).strict()

export const ReportRevisionSnapshotResponseSchema = z.union([
  z.object({
    kind: z.literal('preview'),
    reportId: z.string().min(1),
    shiftId: z.string().min(1),
    currentVersion: z.number().int().nonnegative(),
    audience: z.literal('internal'),
    sourceSnapshot: ReportRevisionSourceSnapshotSchema,
  }).strict(),
  z.object({
    kind: z.literal('preview'),
    reportId: z.string().min(1),
    shiftId: z.string().min(1),
    currentVersion: z.number().int().nonnegative(),
    audience: z.literal('external'),
    externalProjection: ReportExternalProjectionSchema,
  }).strict(),
  z.object({
    kind: z.literal('revision'),
    reportId: z.string().min(1),
    revisionId: z.string().min(1),
    revisionVersion: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    audience: z.literal('internal'),
    sourceSnapshot: ReportRevisionSourceSnapshotSchema,
  }).strict(),
  z.object({
    kind: z.literal('revision'),
    reportId: z.string().min(1),
    revisionId: z.string().min(1),
    revisionVersion: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    audience: z.literal('external'),
    externalProjection: ReportExternalProjectionSchema,
  }).strict(),
])

export const UpdateReportRevisionSnapshotRequestSchema = z.object({
  reportId: z.string().trim().min(1).max(128),
  patch: z.record(z.string(), z.unknown()),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().max(1000).nullable().optional(),
  event: z.enum(['save', 'confirm', 'reopen', 'upload_image', 'remove_image']),
  idempotencyKey: z.string().uuid(),
}).strict()

export const UpdateReportRevisionSnapshotResponseSchema = z.object({
  report: z.record(z.string(), z.unknown()),
  revisionId: z.string().min(1),
  revisionVersion: z.number().int().positive(),
  replayed: z.boolean(),
}).strict()

export type ReportRevisionSourceSnapshot = z.infer<typeof ReportRevisionSourceSnapshotSchema>
export type ReportExternalProjection = z.infer<typeof ReportExternalProjectionSchema>
export type ReportRevisionSnapshotResponse = z.infer<typeof ReportRevisionSnapshotResponseSchema>
export type UpdateReportRevisionSnapshotRequest = z.infer<typeof UpdateReportRevisionSnapshotRequestSchema>
export type UpdateReportRevisionSnapshotResponse = z.infer<typeof UpdateReportRevisionSnapshotResponseSchema>

/**
 * GET /api/reports/revision-snapshots?report_id=...&audience=internal|external
 * Add revision_version=<n> to read an immutable persisted revision.
 * POST to the same route with UpdateReportRevisionSnapshotRequestSchema for a
 * CAS + idempotent report write. Existing update_report remains compatible and
 * also receives the automatic same-transaction snapshot hook.
 */
