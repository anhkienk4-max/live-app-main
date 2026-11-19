import { getAuthMode } from '@/lib/auth/authMode'
import { createClient } from '@/lib/supabase/client'
import type { OperationalRole, ShiftOperationalNote, ShiftOperationalNoteCategory } from '@/lib/types/database.types'

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
  }): Promise<ShiftOperationalNote> {
    const trimmed = input.note?.trim()
    if (!trimmed) throw new Error('NOTE_EMPTY: Nội dung ghi chú không được để trống.')

    const shiftId = input.shiftId || input.shift_id || ''
    const businessDate = input.businessDate || input.business_date || input.date || new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    const actualEventTime = input.actualEventTime || input.actual_event_time || input.eventTime || input.event_time || now
    const affectedRole = input.affectedRole !== undefined ? input.affectedRole : input.affected_role ?? null
    const affectedUserId = input.affectedUserId !== undefined ? input.affectedUserId : input.affected_user_id ?? null

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
      return persisted
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
      version: 1,
      created_at: now,
      updated_at: now,
    }

    inMemoryNotes.unshift(newNote)
    return Promise.resolve(newNote)
  },

  /** Clear or seed notes (for test harnesses) */
  resetNotes(notes: ShiftOperationalNote[] = []) {
    inMemoryNotes = [...notes]
  },
}
