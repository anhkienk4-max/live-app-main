import { getAuthMode } from '@/lib/auth/authMode'
import { createClient } from '@/lib/supabase/client'
import type { OperationalRole, ShiftOperationalNote, ShiftOperationalNoteCategory } from '@/lib/types/database.types'
import type {
  ShiftOperationalNoteWorkflowAction,
  ShiftOperationalNoteWorkflowState,
  ShiftOperationalNoteWorkflowV1Request,
  ShiftOperationalNoteWorkflowV1Response,
} from '@/lib/types/shiftOperationalNoteWorkflow'

let inMemoryNotes: ShiftOperationalNote[] = [
  {
    id: 'note-001',
    shift_id: 'SFT-001',
    business_date: '2026-09-10',
    date: '2026-09-10',
    category: 'normal',
    note: 'Ca diễn ra bình thường, studio setup đúng giờ và đầy đủ thiết bị.',
    author_id: 'USR-ADMIN',
    author_name: 'Admin ADA',
    author_role: 'admin',
    actual_event_time: '2026-09-10T07:15:00.000Z',
    event_time: '2026-09-10T07:15:00.000Z',
    version: 1,
    created_at: '2026-09-10T07:15:00.000Z',
    updated_at: '2026-09-10T07:15:00.000Z',
  },
  {
    id: 'note-002',
    shift_id: 'SFT-002',
    business_date: '2026-09-11',
    date: '2026-09-11',
    category: 'incident',
    note: 'Sự cố mic chập chờn 10 phút đầu ca, kỹ thuật đã đổi mic dự phòng hoạt động ổn định.',
    author_id: 'USR-LEADER',
    author_name: 'Leader Ops',
    author_role: 'team_leader',
    actual_event_time: '2026-09-11T16:10:00.000Z',
    event_time: '2026-09-11T16:10:00.000Z',
    version: 1,
    created_at: '2026-09-11T16:10:00.000Z',
    updated_at: '2026-09-11T16:10:00.000Z',
  },
]

export class ShiftNoteServiceError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'ShiftNoteServiceError'
    this.code = code
  }
}

export const shiftNoteService = {
  async getForShift(shiftId: string): Promise<ShiftOperationalNote[]> {
    if (getAuthMode() === 'supabase') {
      const client = createClient()
      const { data, error } = await client
        .from('shift_operational_notes')
        .select('*')
        .eq('shift_id', shiftId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) {
        // FAIL CLOSED: No silent mock fallback in Supabase mode.
        const isMissingRelation =
          error.code === '42P01' ||
          error.message?.includes('relation "public.shift_operational_notes" does not exist')
        throw new ShiftNoteServiceError(
          isMissingRelation
            ? 'SCHEMA_NOT_DEPLOYED: Tính năng Ghi chú vận hành chưa được triển khai trên môi trường này.'
            : `SHIFT_NOTES_READ_FAILED: ${error.message}`,
          isMissingRelation ? 'SCHEMA_NOT_DEPLOYED' : 'READ_FAILED',
        )
      }
      return (data ?? []).map(row => ({
        ...row,
        business_date: row.business_date || row.date,
        date: row.date || row.business_date,
        actual_event_time: row.actual_event_time || row.event_time,
        event_time: row.event_time || row.actual_event_time,
        version: row.version ?? 1,
      })) as ShiftOperationalNote[]
    }
    return Promise.resolve(
      inMemoryNotes
        .filter(n => n.shift_id === shiftId && !n.deleted_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    )
  },

  async getByDate(date: string): Promise<ShiftOperationalNote[]> {
    if (getAuthMode() === 'supabase') {
      const client = createClient()
      const { data, error } = await client
        .from('shift_operational_notes')
        .select('*')
        .or(`business_date.eq.${date},date.eq.${date}`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) {
        const isMissingRelation =
          error.code === '42P01' ||
          error.message?.includes('relation "public.shift_operational_notes" does not exist')
        throw new ShiftNoteServiceError(
          isMissingRelation
            ? 'SCHEMA_NOT_DEPLOYED: Tính năng Ghi chú vận hành chưa được triển khai trên môi trường này.'
            : `SHIFT_NOTES_READ_FAILED: ${error.message}`,
          isMissingRelation ? 'SCHEMA_NOT_DEPLOYED' : 'READ_FAILED',
        )
      }
      return (data ?? []).map(row => ({
        ...row,
        business_date: row.business_date || row.date,
        date: row.date || row.business_date,
        actual_event_time: row.actual_event_time || row.event_time,
        event_time: row.event_time || row.actual_event_time,
        version: row.version ?? 1,
      })) as ShiftOperationalNote[]
    }
    return Promise.resolve(
      inMemoryNotes
        .filter(n => (n.business_date === date || n.date === date) && !n.deleted_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    )
  },

  async create(input: {
    shiftId?: string
    shift_id?: string
    businessDate?: string
    business_date?: string
    date?: string
    category: ShiftOperationalNoteCategory
    note: string
    authorId?: string
    author_id?: string
    authorName?: string
    author_name?: string
    authorRole?: string
    author_role?: string
    actualEventTime?: string
    actual_event_time?: string
    eventTime?: string
    event_time?: string
    affectedRole?: OperationalRole | null
    affected_role?: OperationalRole | null
    affectedUserId?: string | null
    affected_user_id?: string | null
    status?: 'draft' | 'published'
    isDraft?: boolean
    incidentId?: string | null
    incident_id?: string | null
  }): Promise<ShiftOperationalNote> {
    const trimmed = input.note?.trim()
    if (!trimmed) throw new Error('NOTE_EMPTY: Nội dung ghi chú không được để trống.')

    const shiftId = input.shiftId || input.shift_id || ''
    const businessDate = input.businessDate || input.business_date || input.date || new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    const actualEventTime = input.actualEventTime || input.actual_event_time || input.eventTime || input.event_time || now
    const affectedRole = input.affectedRole !== undefined ? input.affectedRole : input.affected_role ?? null
    const affectedUserId = input.affectedUserId !== undefined ? input.affectedUserId : input.affected_user_id ?? null
    const status = input.status || (input.isDraft ? 'draft' : 'published')
    const incidentId = input.incidentId !== undefined ? input.incidentId : input.incident_id ?? null

    if (getAuthMode() === 'supabase') {
      const { data, error } = await createClient().rpc('add_shift_operational_note', {
        p_shift_id: shiftId,
        p_business_date: businessDate,
        p_category: input.category,
        p_note: trimmed,
        p_actual_event_time: actualEventTime,
        p_affected_role: affectedRole,
        p_affected_user_id: affectedUserId,
      })
      if (error) {
        const isMissingSchema =
          error.code === '42P01' ||
          error.code === '42883' ||
          error.code === 'PGRST202' ||
          error.message?.includes('shift_operational_notes') ||
          error.message?.includes('add_shift_operational_note')
        throw new ShiftNoteServiceError(
          isMissingSchema
            ? 'SCHEMA_NOT_DEPLOYED: Tính năng Ghi chú vận hành chưa được triển khai trên môi trường này.'
            : `SHIFT_NOTE_CREATE_FAILED: ${error.message}`,
          isMissingSchema ? 'SCHEMA_NOT_DEPLOYED' : 'CREATE_FAILED',
        )
      }

      const persisted = (Array.isArray(data) ? data[0] : data) as ShiftOperationalNote | null
      if (!persisted?.id || !persisted.author_id || persisted.shift_id !== shiftId) {
        throw new ShiftNoteServiceError('SHIFT_NOTE_CREATE_FAILED: Invalid persisted note receipt.', 'INVALID_RECEIPT')
      }
      return {
        ...persisted,
        status,
        incident_id: incidentId,
      }
    }

    const authorId = input.authorId || input.author_id || ''
    const authorName = input.authorName || input.author_name || 'Nhân sự'
    const authorRole = input.authorRole || input.author_role || 'staff'
    const newNote: ShiftOperationalNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      shift_id: shiftId,
      business_date: businessDate,
      date: businessDate,
      category: input.category,
      note: trimmed,
      author_id: authorId,
      author_name: authorName,
      author_role: authorRole,
      actual_event_time: actualEventTime,
      event_time: actualEventTime,
      affected_role: affectedRole,
      affected_user_id: affectedUserId,
      status,
      incident_id: incidentId,
      version: 1,
      created_at: now,
      updated_at: now,
    }

    inMemoryNotes.unshift(newNote)
    return Promise.resolve(newNote)
  },

  async update(input: {
    noteId: string
    expectedVersion: number
    note?: string
    category?: ShiftOperationalNoteCategory
    status?: 'draft' | 'published'
    affectedUserId?: string | null
    affectedRole?: OperationalRole | null
  }): Promise<ShiftOperationalNote> {
    const { noteId, expectedVersion } = input
    if (!noteId) throw new Error('NOTE_ID_REQUIRED: Missing note ID.')

    if (getAuthMode() === 'supabase') {
      const client = createClient()
      // First attempt rpc if backend implements update_shift_operational_note
      const { data, error } = await client.rpc('update_shift_operational_note', {
        p_note_id: noteId,
        p_expected_version: expectedVersion,
        p_note: input.note,
        p_category: input.category,
        p_status: input.status,
        p_affected_user_id: input.affectedUserId,
        p_affected_role: input.affectedRole,
      })

      if (error) {
        if (error.message?.includes('NOTE_VERSION_CONFLICT') || error.code === '40001') {
          throw new ShiftNoteServiceError('NOTE_VERSION_CONFLICT: Phiên bản ghi chú đã bị thay đổi bởi người khác.', 'NOTE_VERSION_CONFLICT')
        }
        const isMissingSchema =
          error.code === '42P01' ||
          error.code === '42883' ||
          error.code === 'PGRST202' ||
          error.message?.includes('update_shift_operational_note') ||
          error.message?.includes('shift_operational_notes')
        if (isMissingSchema) {
          throw new ShiftNoteServiceError(
            'SCHEMA_NOT_DEPLOYED: Tính năng cập nhật ghi chú chưa được triển khai trên môi trường này.',
            'SCHEMA_NOT_DEPLOYED',
          )
        }
        throw new ShiftNoteServiceError(`SHIFT_NOTE_UPDATE_FAILED: ${error.message}`, 'UPDATE_FAILED')
      }

      const updated = (Array.isArray(data) ? data[0] : data) as ShiftOperationalNote
      return updated
    }

    const idx = inMemoryNotes.findIndex(n => n.id === noteId)
    if (idx === -1) {
      throw new ShiftNoteServiceError('NOTE_NOT_FOUND: Không tìm thấy ghi chú.', 'NOT_FOUND')
    }
    const current = inMemoryNotes[idx]
    if (current.version !== expectedVersion) {
      throw new ShiftNoteServiceError(
        `NOTE_VERSION_CONFLICT: Phiên bản ghi chú hiện tại (${current.version}) không khớp với phiên bản dự kiến (${expectedVersion}).`,
        'NOTE_VERSION_CONFLICT',
      )
    }

    const updatedNote: ShiftOperationalNote = {
      ...current,
      note: input.note !== undefined ? input.note : current.note,
      category: input.category || current.category,
      status: input.status || current.status,
      affected_user_id: input.affectedUserId !== undefined ? input.affectedUserId : current.affected_user_id,
      affected_role: input.affectedRole !== undefined ? input.affectedRole : current.affected_role,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    }
    inMemoryNotes[idx] = updatedNote
    return Promise.resolve(updatedNote)
  },

  async executeWorkflow(
    request: ShiftOperationalNoteWorkflowV1Request,
  ): Promise<ShiftOperationalNoteWorkflowV1Response> {
    if (getAuthMode() === 'mock') {
      const now = new Date().toISOString()
      const noteId = request.noteId || `note-${Date.now()}`
      let noteItem = inMemoryNotes.find(n => n.id === noteId)
      const version = (request.expectedVersion ?? 0) + 1
      if (!noteItem) {
        noteItem = {
          id: noteId,
          shift_id: request.shiftId || '',
          business_date: request.businessDate || now.slice(0, 10),
          date: request.businessDate || now.slice(0, 10),
          category: request.category || 'normal',
          note: request.note || '',
          author_id: 'mock-user',
          author_name: 'Mock User',
          author_role: 'admin',
          actual_event_time: request.actualEventTime || now,
          event_time: request.actualEventTime || now,
          version,
          created_at: now,
          updated_at: now,
        }
        inMemoryNotes.unshift(noteItem)
      } else {
        noteItem.version = version
        noteItem.note = request.note ?? noteItem.note
        noteItem.category = request.category ?? noteItem.category
        noteItem.updated_at = now
      }
      const workflowStateMap: Record<ShiftOperationalNoteWorkflowAction, ShiftOperationalNoteWorkflowState> = {
        save_draft: 'draft',
        submit: 'submitted',
        approve: 'reviewed',
        request_correction: 'correction_requested',
        reject: 'rejected',
      }
      return {
        note: {
          id: noteItem.id,
          shift_id: noteItem.shift_id,
          business_date: noteItem.business_date,
          category: noteItem.category,
          note: noteItem.note,
          author_id: noteItem.author_id,
          actual_event_time: noteItem.actual_event_time,
          affected_role: request.affectedRole,
          affected_user_id: request.affectedUserId,
          version: noteItem.version,
          workflow_state: workflowStateMap[request.action],
          staffing_segment_id: request.staffingSegmentId,
          canonical_incident_id: request.canonicalIncidentId,
          created_at: noteItem.created_at,
          updated_at: noteItem.updated_at,
        },
        replayed: false,
        revision: version,
      }
    }

    let response: Response
    try {
      response = await fetch('/api/operational-notes/workflow-v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
    } catch (err: unknown) {
      throw new ShiftNoteServiceError(
        `D2_WORKFLOW_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR',
      )
    }

    if (response.status === 404 || response.status === 503) {
      throw new ShiftNoteServiceError(
        'D2_WORKFLOW_UNAVAILABLE: Luồng ghi chú vận hành V1 chưa được triển khai trên môi trường này.',
        'D2_WORKFLOW_UNAVAILABLE',
      )
    }

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const code = payload?.error?.code || `HTTP_${response.status}`
      const message = payload?.error?.message || payload?.error || `Giao tác thất bại với mã lỗi ${code}`
      throw new ShiftNoteServiceError(message, code)
    }

    return payload as ShiftOperationalNoteWorkflowV1Response
  },

  async saveDraft(input: {
    noteId?: string | null
    expectedVersion?: number | null
    shiftId?: string | null
    businessDate?: string | null
    category?: ShiftOperationalNoteCategory | null
    note?: string | null
    actualEventTime?: string | null
    affectedRole?: OperationalRole | null
    affectedUserId?: string | null
    staffingSegmentId?: string | null
    canonicalIncidentId?: string | null
    idempotencyKey?: string
  }): Promise<ShiftOperationalNoteWorkflowV1Response> {
    return this.executeWorkflow({
      action: 'save_draft',
      noteId: input.noteId ?? null,
      expectedVersion: input.expectedVersion ?? null,
      idempotencyKey: input.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`),
      shiftId: input.shiftId ?? null,
      businessDate: input.businessDate ?? null,
      category: input.category ?? null,
      note: input.note ?? null,
      actualEventTime: input.actualEventTime ?? null,
      affectedRole: input.affectedRole ?? null,
      affectedUserId: input.affectedUserId ?? null,
      staffingSegmentId: input.staffingSegmentId ?? null,
      canonicalIncidentId: input.canonicalIncidentId ?? null,
    })
  },

  async submitNote(input: {
    noteId?: string | null
    expectedVersion?: number | null
    shiftId?: string | null
    businessDate?: string | null
    category?: ShiftOperationalNoteCategory | null
    note?: string | null
    actualEventTime?: string | null
    affectedRole?: OperationalRole | null
    affectedUserId?: string | null
    staffingSegmentId?: string | null
    canonicalIncidentId?: string | null
    idempotencyKey?: string
  }): Promise<ShiftOperationalNoteWorkflowV1Response> {
    return this.executeWorkflow({
      action: 'submit',
      noteId: input.noteId ?? null,
      expectedVersion: input.expectedVersion ?? null,
      idempotencyKey: input.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`),
      shiftId: input.shiftId ?? null,
      businessDate: input.businessDate ?? null,
      category: input.category ?? null,
      note: input.note ?? null,
      actualEventTime: input.actualEventTime ?? null,
      affectedRole: input.affectedRole ?? null,
      affectedUserId: input.affectedUserId ?? null,
      staffingSegmentId: input.staffingSegmentId ?? null,
      canonicalIncidentId: input.canonicalIncidentId ?? null,
    })
  },

  async approveNote(input: {
    noteId: string
    expectedVersion: number
    idempotencyKey?: string
  }): Promise<ShiftOperationalNoteWorkflowV1Response> {
    return this.executeWorkflow({
      action: 'approve',
      noteId: input.noteId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`),
      shiftId: null,
      businessDate: null,
      category: null,
      note: null,
      actualEventTime: null,
      affectedRole: null,
      affectedUserId: null,
      staffingSegmentId: null,
      canonicalIncidentId: null,
    })
  },

  async requestCorrection(input: {
    noteId: string
    expectedVersion: number
    note?: string | null
    idempotencyKey?: string
  }): Promise<ShiftOperationalNoteWorkflowV1Response> {
    return this.executeWorkflow({
      action: 'request_correction',
      noteId: input.noteId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`),
      shiftId: null,
      businessDate: null,
      category: null,
      note: input.note ?? null,
      actualEventTime: null,
      affectedRole: null,
      affectedUserId: null,
      staffingSegmentId: null,
      canonicalIncidentId: null,
    })
  },

  async rejectNote(input: {
    noteId: string
    expectedVersion: number
    reason?: string | null
    idempotencyKey?: string
  }): Promise<ShiftOperationalNoteWorkflowV1Response> {
    return this.executeWorkflow({
      action: 'reject',
      noteId: input.noteId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`),
      shiftId: null,
      businessDate: null,
      category: null,
      note: input.reason ?? null,
      actualEventTime: null,
      affectedRole: null,
      affectedUserId: null,
      staffingSegmentId: null,
      canonicalIncidentId: null,
    })
  },

  /** Clear or seed notes (for test harnesses) */
  resetNotes(notes: ShiftOperationalNote[] = []) {
    inMemoryNotes = [...notes]
  },
}
