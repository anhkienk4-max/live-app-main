import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getShiftNoteDraftKey,
  resolveShiftNoteDraftState,
  executeSaveNoteOperation,
  type ShiftNoteDraftEntry,
} from '../components/features/shifts/ShiftOperationalNotesSection.tsx'
import type { ShiftOperationalNote, ShiftOperationalNoteCategory } from '../lib/types/database.types.ts'

test('D06 Persistent Draft: Server draft identity and version restored even when local unsaved text exists in cache', () => {
  const serverDraftNote: ShiftOperationalNote = {
    id: 'server-note-456',
    shift_id: 'shift-101',
    business_date: '2026-11-28',
    date: '2026-11-28',
    category: 'incident',
    note: 'Server persisted draft text',
    status: 'draft',
    author_id: 'user-actor-1',
    author_name: 'Author Name',
    author_role: 'leader',
    actual_event_time: '2026-11-28T10:00:00.000Z',
    event_time: '2026-11-28T10:00:00.000Z',
    version: 4,
    affected_user_id: 'affected-user-99',
    created_at: '2026-11-28T10:00:00.000Z',
    updated_at: '2026-11-28T10:05:00.000Z',
  }

  const cachedUnsaved: ShiftNoteDraftEntry = {
    text: 'Local unsaved draft text typed by user',
    category: 'incident',
    // noteId and version not yet attached in cache
    noteId: null,
    version: undefined,
  }

  const result = resolveShiftNoteDraftState({
    shiftId: 'shift-101',
    currentShiftId: 'shift-101',
    currentUser: { id: 'user-actor-1' },
    currentUserId: 'user-actor-1',
    serverNotes: [serverDraftNote],
    cachedEntry: cachedUnsaved,
  })

  assert.equal(result.isStale, false)
  // Local unsaved text must be preserved
  assert.equal(result.noteText, 'Local unsaved draft text typed by user')
  // Server draft identity and expectedVersion must be authoritatively restored
  assert.equal(result.editingNoteId, 'server-note-456')
  assert.equal(result.editingVersion, 4)
  assert.equal(result.affectedUserId, 'affected-user-99')

  // Updated cache entry must retain local text while attaching server identity
  assert.ok(result.updatedCacheEntry)
  assert.equal(result.updatedCacheEntry?.text, 'Local unsaved draft text typed by user')
  assert.equal(result.updatedCacheEntry?.noteId, 'server-note-456')
  assert.equal(result.updatedCacheEntry?.version, 4)
  assert.equal(result.updatedCacheEntry?.authorId, 'user-actor-1')
})

test('D06 Persistent Draft: Server draft restores content and seeds cache when local cache has no unsaved text', () => {
  const serverDraftNote: ShiftOperationalNote = {
    id: 'server-note-789',
    shift_id: 'shift-102',
    business_date: '2026-11-28',
    date: '2026-11-28',
    category: 'swap',
    note: 'Authoritative server draft content',
    status: 'draft',
    author_id: 'user-actor-2',
    author_name: 'Staff Two',
    author_role: 'host',
    actual_event_time: '2026-11-28T14:00:00.000Z',
    event_time: '2026-11-28T14:00:00.000Z',
    version: 2,
    created_at: '2026-11-28T14:00:00.000Z',
    updated_at: '2026-11-28T14:10:00.000Z',
  }

  const result = resolveShiftNoteDraftState({
    shiftId: 'shift-102',
    currentShiftId: 'shift-102',
    currentUser: { id: 'user-actor-2' },
    currentUserId: 'user-actor-2',
    serverNotes: [serverDraftNote],
    cachedEntry: null,
  })

  assert.equal(result.isStale, false)
  assert.equal(result.noteText, 'Authoritative server draft content')
  assert.equal(result.category, 'swap')
  assert.equal(result.editingNoteId, 'server-note-789')
  assert.equal(result.editingVersion, 2)

  assert.ok(result.updatedCacheEntry)
  assert.equal(result.updatedCacheEntry?.text, 'Authoritative server draft content')
  assert.equal(result.updatedCacheEntry?.noteId, 'server-note-789')
  assert.equal(result.updatedCacheEntry?.version, 2)
  assert.equal(result.updatedCacheEntry?.category, 'swap')
})

test('D06 Persistent Draft: Mutation payload for saveDraft and submitNote includes authoritative noteId and expectedVersion (prevents duplicate drafts)', async () => {
  interface DraftPayload {
    noteId: string | null
    expectedVersion: number | null
    shiftId: string
    businessDate: string
    category: ShiftOperationalNoteCategory
    note: string
    affectedUserId: string | null
    idempotencyKey: string
  }
  interface SubmitPayload {
    noteId: string | null
    expectedVersion: number | null
    shiftId: string
    businessDate: string
    category: ShiftOperationalNoteCategory
    note: string
    affectedUserId: string | null
    idempotencyKey: string
  }

  let saveDraftPayload: DraftPayload | null = null
  let submitNotePayload: SubmitPayload | null = null

  const mockService = {
    saveDraft: async (payload: DraftPayload) => {
      saveDraftPayload = payload
      return { note: { id: payload.noteId || 'created-id', version: (payload.expectedVersion ?? 0) + 1 } }
    },
    submitNote: async (payload: SubmitPayload) => {
      submitNotePayload = payload
      return { success: true }
    },
  }

  const testCache = new Map<string, ShiftNoteDraftEntry>()

  // 1. saveDraft must include noteId and expectedVersion
  const saveResult = await executeSaveNoteOperation({
    asDraft: true,
    shiftId: 'shift-103',
    shiftDate: '2026-11-28',
    currentUser: { id: 'user-author-1' },
    noteText: 'Updated draft content',
    category: 'incident',
    affectedUserId: 'affected-user-55',
    editingNoteId: 'existing-draft-id-999',
    editingVersion: 5,
    idempotencyKey: 'idemp-save-1',
    service: mockService,
    draftCache: testCache,
  })

  assert.equal(saveResult.success, true)
  assert.ok(saveDraftPayload)
  assert.equal(saveDraftPayload?.noteId, 'existing-draft-id-999')
  assert.equal(saveDraftPayload?.expectedVersion, 5)
  assert.equal(saveDraftPayload?.shiftId, 'shift-103')
  assert.equal(saveDraftPayload?.businessDate, '2026-11-28')
  assert.equal(saveDraftPayload?.category, 'incident')
  assert.equal(saveDraftPayload?.note, 'Updated draft content')
  assert.equal(saveDraftPayload?.affectedUserId, 'affected-user-55')
  assert.equal(saveDraftPayload?.idempotencyKey, 'idemp-save-1')

  // Cache was updated with new version
  const cachedAfterSave = testCache.get('shift-103:user-author-1')
  assert.ok(cachedAfterSave)
  assert.equal(cachedAfterSave?.noteId, 'existing-draft-id-999')
  assert.equal(cachedAfterSave?.version, 6)

  // 2. submitNote must also include noteId and expectedVersion
  const submitResult = await executeSaveNoteOperation({
    asDraft: false,
    shiftId: 'shift-103',
    shiftDate: '2026-11-28',
    currentUser: { id: 'user-author-1' },
    noteText: 'Final submitted content',
    category: 'incident',
    affectedUserId: 'affected-user-55',
    editingNoteId: 'existing-draft-id-999',
    editingVersion: 6,
    idempotencyKey: 'idemp-submit-1',
    service: mockService,
    draftCache: testCache,
  })

  assert.equal(submitResult.success, true)
  assert.ok(submitNotePayload)
  assert.equal(submitNotePayload?.noteId, 'existing-draft-id-999')
  assert.equal(submitNotePayload?.expectedVersion, 6)
  assert.equal(submitNotePayload?.note, 'Final submitted content')

  // Cache entry deleted after submit
  assert.equal(testCache.has('shift-103:user-author-1'), false)
})

test('D06 Persistent Draft: Stale-version writes on CAS conflict (NOTE_VERSION_CONFLICT) are detected and fail safe', async () => {
  const conflictService = {
    saveDraft: async () => {
      const err = Object.assign(new Error('NOTE_VERSION_CONFLICT: Draft version mismatch during CAS write'), {
        code: 'NOTE_VERSION_CONFLICT',
      })
      throw err
    },
    submitNote: async () => {
      throw new Error('Unused')
    },
  }

  const result = await executeSaveNoteOperation({
    asDraft: true,
    shiftId: 'shift-104',
    shiftDate: '2026-11-28',
    currentUser: { id: 'user-author-2' },
    noteText: 'Stale draft edit attempt',
    category: 'normal',
    editingNoteId: 'stale-note-id',
    editingVersion: 1, // Stale version
    idempotencyKey: 'idemp-conflict-test',
    service: conflictService,
  })

  assert.equal(result.success, false)
  assert.equal(result.isConflict, true)
  assert.equal(result.retainedIdempotencyKey, 'idemp-conflict-test')
})

test('D06 Persistent Draft: Protection against stale asynchronous responses when switching shifts or accounts', () => {
  const serverDraftNote: ShiftOperationalNote = {
    id: 'server-note-old',
    shift_id: 'shift-prev',
    business_date: '2026-11-27',
    date: '2026-11-27',
    category: 'normal',
    note: 'Old shift note',
    status: 'draft',
    author_id: 'user-old',
    author_name: 'Old User',
    author_role: 'host',
    actual_event_time: '2026-11-27T10:00:00.000Z',
    event_time: '2026-11-27T10:00:00.000Z',
    created_at: '2026-11-27T10:00:00.000Z',
    updated_at: '2026-11-27T10:00:00.000Z',
  }

  // 1. Shift mismatch (user navigated to shift-curr while shift-prev response was in flight)
  const shiftMismatch = resolveShiftNoteDraftState({
    shiftId: 'shift-curr',
    currentShiftId: 'shift-prev',
    currentUser: { id: 'user-curr' },
    currentUserId: 'user-curr',
    serverNotes: [serverDraftNote],
    cachedEntry: null,
  })
  assert.equal(shiftMismatch.isStale, true)

  // 2. User mismatch (user switched accounts while response was in flight)
  const userMismatch = resolveShiftNoteDraftState({
    shiftId: 'shift-curr',
    currentShiftId: 'shift-curr',
    currentUser: { id: 'user-b' },
    currentUserId: 'user-a',
    serverNotes: [serverDraftNote],
    cachedEntry: null,
  })
  assert.equal(userMismatch.isStale, true)
})

test('D06 Persistent Draft: Cache isolation by authenticated identity and shift (${shift.id}:${currentUser.id})', () => {
  // Key format is strictly `${shiftId}:${userId}`
  assert.equal(getShiftNoteDraftKey('shift-100', 'user-alpha'), 'shift-100:user-alpha')
  assert.equal(getShiftNoteDraftKey('shift-100', 'user-beta'), 'shift-100:user-beta')
  assert.equal(getShiftNoteDraftKey('shift-200', 'user-alpha'), 'shift-200:user-alpha')

  // Different users on same shift have isolated keys
  assert.notEqual(
    getShiftNoteDraftKey('shift-100', 'user-alpha'),
    getShiftNoteDraftKey('shift-100', 'user-beta')
  )

  // Same user on different shifts has isolated keys
  assert.notEqual(
    getShiftNoteDraftKey('shift-100', 'user-alpha'),
    getShiftNoteDraftKey('shift-200', 'user-alpha')
  )

  // Unauthenticated or null user fails closed to empty key (no cross-tenant or unauthenticated leakage)
  assert.equal(getShiftNoteDraftKey('shift-100', null), '')
  assert.equal(getShiftNoteDraftKey('shift-100', undefined), '')
  assert.equal(getShiftNoteDraftKey('shift-100', ''), '')
})

test('D06 Persistent Draft: Idempotency key preserved on retry, new key generated on successful save', async () => {
  let attemptCount = 0
  const flakyService = {
    saveDraft: async () => {
      attemptCount++
      if (attemptCount === 1) {
        throw new Error('Network timeout during save')
      }
      return { note: { id: 'note-retry-success', version: 2 } }
    },
    submitNote: async () => ({ success: true }),
  }

  const initialKey = 'idemp-flaky-retry-key'

  // Attempt 1: Fails
  const firstAttempt = await executeSaveNoteOperation({
    asDraft: true,
    shiftId: 'shift-105',
    shiftDate: '2026-11-28',
    currentUser: { id: 'user-retry-1' },
    noteText: 'Draft to retry',
    category: 'normal',
    editingNoteId: null,
    editingVersion: 1,
    idempotencyKey: initialKey,
    service: flakyService,
  })

  assert.equal(firstAttempt.success, false)
  // MUST retain the exact same idempotency key for safe retry
  assert.equal(firstAttempt.retainedIdempotencyKey, initialKey)

  // Attempt 2: Succeeds using the retained key
  const secondAttempt = await executeSaveNoteOperation({
    asDraft: true,
    shiftId: 'shift-105',
    shiftDate: '2026-11-28',
    currentUser: { id: 'user-retry-1' },
    noteText: 'Draft to retry',
    category: 'normal',
    editingNoteId: null,
    editingVersion: 1,
    idempotencyKey: firstAttempt.retainedIdempotencyKey!,
    service: flakyService,
  })

  assert.equal(secondAttempt.success, true)
  assert.equal(secondAttempt.resolvedNoteId, 'note-retry-success')
  assert.equal(secondAttempt.resolvedVersion, 2)
  // MUST generate a fresh idempotency key for subsequent operations
  assert.ok(secondAttempt.nextIdempotencyKey)
  assert.notEqual(secondAttempt.nextIdempotencyKey, initialKey)
})
