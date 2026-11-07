import { getAuthMode } from '@/lib/auth/authMode'
import { createClient } from '@/lib/supabase/client'
import type { ShiftOperationalNote, ShiftOperationalNoteCategory } from '@/lib/types/database.types'

let inMemoryNotes: ShiftOperationalNote[] = [
  {
    id: 'note-001',
    shift_id: 'SFT-001',
    date: '2026-09-10',
    category: 'normal',
    note: 'Ca diễn ra bình thường, studio setup đúng giờ và đầy đủ thiết bị.',
    author_id: 'USR-ADMIN',
    author_name: 'Admin ADA',
    author_role: 'admin',
    event_time: '2026-09-10T07:15:00.000Z',
    created_at: '2026-09-10T07:15:00.000Z',
    updated_at: '2026-09-10T07:15:00.000Z',
  },
  {
    id: 'note-002',
    shift_id: 'SFT-002',
    date: '2026-09-11',
    category: 'incident',
    note: 'Sự cố mic chập chờn 10 phút đầu ca, kỹ thuật đã đổi mic dự phòng hoạt động ổn định.',
    author_id: 'USR-LEADER',
    author_name: 'Leader Ops',
    author_role: 'team_leader',
    event_time: '2026-09-11T16:10:00.000Z',
    created_at: '2026-09-11T16:10:00.000Z',
    updated_at: '2026-09-11T16:10:00.000Z',
  },
]

export const shiftNoteService = {
  async getForShift(shiftId: string): Promise<ShiftOperationalNote[]> {
    if (getAuthMode() === 'supabase') {
      try {
        const client = createClient()
        const { data, error } = await client
          .from('shift_operational_notes')
          .select('*')
          .eq('shift_id', shiftId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
        if (!error && Array.isArray(data)) {
          return data as ShiftOperationalNote[]
        }
      } catch {
        // Table not present yet in environment; fall back gracefully to local store
      }
    }
    return Promise.resolve(
      inMemoryNotes
        .filter(n => n.shift_id === shiftId && !n.deleted_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    )
  },

  async getByDate(date: string): Promise<ShiftOperationalNote[]> {
    if (getAuthMode() === 'supabase') {
      try {
        const client = createClient()
        const { data, error } = await client
          .from('shift_operational_notes')
          .select('*')
          .eq('date', date)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
        if (!error && Array.isArray(data)) {
          return data as ShiftOperationalNote[]
        }
      } catch {
        // Table not present yet in environment; fall back gracefully to local store
      }
    }
    return Promise.resolve(
      inMemoryNotes
        .filter(n => n.date === date && !n.deleted_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    )
  },

  async create(input: {
    shiftId?: string
    shift_id?: string
    date?: string
    category: ShiftOperationalNoteCategory
    note: string
    authorId?: string
    author_id?: string
    authorName?: string
    author_name?: string
    authorRole?: string
    author_role?: string
    eventTime?: string
    event_time?: string
  }): Promise<ShiftOperationalNote> {
    const trimmed = input.note?.trim()
    if (!trimmed) throw new Error('NOTE_EMPTY: Nội dung ghi chú không được để trống.')

    const shiftId = input.shiftId || input.shift_id || ''
    const date = input.date || new Date().toISOString().slice(0, 10)
    const authorId = input.authorId || input.author_id || ''
    const authorName = input.authorName || input.author_name || 'Nhân sự'
    const authorRole = input.authorRole || input.author_role || 'staff'
    const now = new Date().toISOString()
    const eventTime = input.eventTime || input.event_time || now

    const newNote: ShiftOperationalNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      shift_id: shiftId,
      date,
      category: input.category,
      note: trimmed,
      author_id: authorId,
      author_name: authorName,
      author_role: authorRole,
      event_time: eventTime,
      created_at: now,
      updated_at: now,
    }

    if (getAuthMode() === 'supabase') {
      try {
        const client = createClient()
        const { data, error } = await client
          .from('shift_operational_notes')
          .insert({
            id: newNote.id,
            shift_id: newNote.shift_id,
            date: newNote.date,
            category: newNote.category,
            note: newNote.note,
            author_id: newNote.author_id,
            author_name: newNote.author_name,
            author_role: newNote.author_role,
            event_time: newNote.event_time,
          })
          .select()
          .single()
        if (!error && data) {
          inMemoryNotes.unshift(data as ShiftOperationalNote)
          return data as ShiftOperationalNote
        }
      } catch {
        // Fall through to in-memory store
      }
    }

    inMemoryNotes.unshift(newNote)
    return Promise.resolve(newNote)
  },

  /** Clear or seed notes (for test harnesses) */
  resetNotes(notes: ShiftOperationalNote[] = []) {
    inMemoryNotes = [...notes]
  },
}
