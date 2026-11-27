import 'server-only'

import { z } from 'zod'
import { hasExactOrigin, readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { createClient } from '@/lib/supabase/server'
import type { ShiftOperationalNoteWorkflowV1Response } from '@/lib/types/shiftOperationalNoteWorkflow'

const requestSchema = z.object({
  action: z.enum(['save_draft', 'submit', 'approve', 'request_correction', 'reject']),
  noteId: z.string().trim().min(1).max(120).nullable(),
  expectedVersion: z.number().int().positive().nullable(),
  idempotencyKey: z.string().uuid(),
  shiftId: z.string().trim().min(1).max(120).nullable(),
  businessDate: z.string().date().nullable(),
  category: z.enum(['normal', 'attendance', 'swap', 'incident', 'sales', 'other']).nullable(),
  note: z.string().max(10_000).nullable(),
  actualEventTime: z.string().datetime({ offset: true }).nullable(),
  affectedRole: z.enum(['host', 'support', 'technical']).nullable(),
  affectedUserId: z.string().trim().min(1).max(120).nullable(),
  staffingSegmentId: z.string().trim().min(1).max(120).nullable(),
  canonicalIncidentId: z.string().uuid().nullable(),
}).strict()

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const failure = (code: string, status: number) => Response.json({ ok: false, error: { code } }, { status, headers })

const statusForCode = (code: string) => {
  if (code === 'AUTHENTICATION_REQUIRED') return 401
  if (['PERMISSION_DENIED', 'NOTE_REVIEW_PERMISSION_REQUIRED', 'NOTE_AUTHOR_REQUIRED', 'NOTE_SUBJECT_SCOPE_DENIED', 'NOTE_INCIDENT_SCOPE_MISMATCH'].includes(code)) return 403
  if (['NOTE_NOT_FOUND', 'SHIFT_NOT_FOUND'].includes(code)) return 404
  if (['NOTE_VERSION_CONFLICT', 'IDEMPOTENCY_KEY_REUSED'].includes(code)) return 409
  if (['NOTE_NOT_EDITABLE', 'NOTE_NOT_SUBMITTABLE', 'NOTE_NOT_REVIEWABLE'].includes(code)) return 409
  if (['NOTE_REQUEST_INVALID', 'NOTE_EMPTY', 'INVALID_CATEGORY', 'INVALID_AFFECTED_ROLE', 'BUSINESS_DATE_MISMATCH', 'NOTE_SEGMENT_SHIFT_MISMATCH', 'NOTE_SUBJECT_NOT_ASSIGNED', 'AFFECTED_USER_NOT_FOUND', 'NOTE_SHIFT_IMMUTABLE'].includes(code)) return 400
  return 503
}

export async function handleShiftOperationalNoteWorkflow(request: Request): Promise<Response> {
  try {
    if (!hasExactOrigin(request)) return failure('SHIFT_NOTE_ORIGIN_INVALID', 403)
    const parsed = requestSchema.safeParse(await readJsonBody(request, 16_384))
    if (!parsed.success) return failure('SHIFT_NOTE_REQUEST_INVALID', 400)
    const input = parsed.data

    const client = await createClient()
    const mutation = await client.rpc('mutate_shift_operational_note_v1', {
      p_action: input.action,
      p_note_id: input.noteId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_shift_id: input.shiftId,
      p_business_date: input.businessDate,
      p_category: input.category,
      p_note: input.note,
      p_actual_event_time: input.actualEventTime,
      p_affected_role: input.affectedRole,
      p_affected_user_id: input.affectedUserId,
      p_staffing_segment_id: input.staffingSegmentId,
      p_canonical_incident_id: input.canonicalIncidentId,
    })
    if (mutation.error) {
      const known = [
        'AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'NOTE_REVIEW_PERMISSION_REQUIRED', 'NOTE_AUTHOR_REQUIRED',
        'NOTE_SUBJECT_SCOPE_DENIED', 'NOTE_INCIDENT_SCOPE_MISMATCH', 'NOTE_NOT_FOUND', 'SHIFT_NOT_FOUND',
        'NOTE_VERSION_CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'NOTE_NOT_EDITABLE', 'NOTE_NOT_SUBMITTABLE',
        'NOTE_NOT_REVIEWABLE', 'NOTE_REQUEST_INVALID', 'NOTE_EMPTY', 'INVALID_CATEGORY', 'INVALID_AFFECTED_ROLE',
        'BUSINESS_DATE_MISMATCH', 'NOTE_SEGMENT_SHIFT_MISMATCH', 'NOTE_SUBJECT_NOT_ASSIGNED', 'AFFECTED_USER_NOT_FOUND', 'NOTE_SHIFT_IMMUTABLE',
      ].find((code) => mutation.error?.message.includes(code))
      const code = known ?? 'SHIFT_NOTE_MUTATION_FAILED'
      return failure(code, statusForCode(code))
    }

    const body = mutation.data as { note?: { id?: string }; replayed?: boolean; revision?: number } | null
    if (!body?.note?.id) return failure('SHIFT_NOTE_READBACK_REQUIRED', 503)
    const { data: note, error: readError } = await client
      .from('shift_operational_notes')
      .select('id,shift_id,business_date,category,note,author_id,actual_event_time,affected_role,affected_user_id,version,workflow_state,staffing_segment_id,canonical_incident_id,created_at,updated_at')
      .eq('id', body.note.id)
      .is('deleted_at', null)
      .single()
    if (readError || !note || note.version !== body.revision) return failure('SHIFT_NOTE_READBACK_REQUIRED', 503)

    const result: ShiftOperationalNoteWorkflowV1Response = {
      note,
      replayed: body.replayed === true,
      revision: body.revision ?? note.version,
    }
    return Response.json({ ok: true, data: result }, { headers })
  } catch (error) {
    if (error instanceof RequestBodyError) return failure(error.code, error.status)
    return failure('SHIFT_NOTE_MUTATION_FAILED', 503)
  }
}
