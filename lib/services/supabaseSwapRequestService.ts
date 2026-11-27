import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { OperationalRole, SwapConflictCheckInput, SwapConflictCheckStatus, SwapIdempotencyKey, SwapRequest, SwapStatus } from '@/lib/types/database.types'

const swapRequestColumns = [
  'id','requester_id','source_registration_id','source_shift_id','target_shift_id','counterpart_registration_id','counterpart_id','operational_role','mode','status','reason','notes','created_at','updated_at','version','responded_at','responded_by','approved_at','approved_by','completed_at','shift_id','original_staff_id','replacement_staff_id','new_host_id','new_support_id','new_technical_id','approval_history','deleted_at','deleted_by','deletion_reason',
].join(',')

type NullableSwapRow = { [K in keyof SwapRequest]: SwapRequest[K] | null } & { mode: string | null }

interface SupabaseErrorShape { code?: string; message?: string; details?: string; hint?: string }

const swapHistoryActions = new Set(['created', 'accepted', 'rejected', 'cancelled', 'approved', 'completed'])
type SwapHistoryAction = NonNullable<SwapRequest['approval_history']>[number]['action']
type SwapHistoryEntry = NonNullable<SwapRequest['approval_history']>[number]

/** Normalize persisted history to the canonical actor_id shape.
 * Legacy rows written before P0 may contain `by`; that is read-only compatibility
 * and is never emitted by the current SQL or mock writers.
 */
function normalizeApprovalHistory(value: unknown): SwapRequest['approval_history'] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const actor = typeof record.actor_id === 'string' ? record.actor_id : typeof record.by === 'string' ? record.by : null
    const action = typeof record.action === 'string' && swapHistoryActions.has(record.action) ? record.action as SwapHistoryAction : null
    const at = typeof record.at === 'string' ? record.at : null
    if (!actor || !action || !at) return []
    const notes = typeof record.notes === 'string' ? record.notes : undefined
    const optionalString = (key: keyof SwapHistoryEntry): string | null | undefined => {
      const value = record[key]
      return typeof value === 'string' ? value : value === null ? null : undefined
    }
    const operationalRole = record.operational_role === 'host' || record.operational_role === 'support' || record.operational_role === 'technical'
      ? record.operational_role
      : undefined
    const mode = record.mode === 'replacement' || record.mode === 'move' || record.mode === 'exchange'
      ? record.mode
      : undefined
    const statusValues = new Set(['pending', 'accepted', 'rejected', 'cancelled', 'approved', 'completed'])
    const fromStatus = (typeof record.from_status === 'string' && statusValues.has(record.from_status) ? record.from_status : record.from_status === null ? null : undefined) as SwapRequest['status'] | null | undefined
    const toStatus = (typeof record.to_status === 'string' && statusValues.has(record.to_status) ? record.to_status : undefined) as SwapRequest['status'] | undefined
    return [{
      action,
      actor_id: actor,
      mode,
      requester_id: optionalString('requester_id') ?? undefined,
      counterpart_id: optionalString('counterpart_id') ?? null,
      replacement_staff_id: optionalString('replacement_staff_id') ?? null,
      source_registration_id: optionalString('source_registration_id') ?? undefined,
      counterpart_registration_id: optionalString('counterpart_registration_id') ?? null,
      source_shift_id: optionalString('source_shift_id') ?? undefined,
      target_shift_id: optionalString('target_shift_id') ?? null,
      operational_role: operationalRole,
      from_status: fromStatus,
      to_status: toStatus,
      reason: optionalString('reason') ?? undefined,
      at,
      ...(notes === undefined ? {} : { notes }),
    }]
  })
}

export class SwapRequestError extends Error {
  constructor(message: string, public readonly code = 'SWAP_REQUEST_FAILED') { super(message); this.name='SwapRequestError' }
}
function requestError(op: string, e: SupabaseErrorShape): SwapRequestError {
  const message = e.message?.trim() || `Supabase ${op} failed.`
  const code = message.includes('STALE_WRITE')
    ? 'STALE_WRITE'
    : message.includes('EXPECTED_VERSION_REQUIRED')
      ? 'EXPECTED_VERSION_REQUIRED'
      : e.code || 'SWAP_REQUEST_FAILED'
  return new SwapRequestError(message, code)
}
export function swapFromRow(row: NullableSwapRow): SwapRequest {
  return {
    id: row.id as string,
    shift_id: (row.shift_id as string) || (row.source_shift_id as string) || '',
    requester_id: row.requester_id as string,
    operational_role: row.operational_role as OperationalRole | undefined,
    mode: (row.mode as SwapRequest['mode']) || 'replacement',
    source_shift_id: row.source_shift_id as string | undefined,
    target_shift_id: row.target_shift_id as string | null ?? undefined,
    source_registration_id: row.source_registration_id as string | undefined,
    counterpart_registration_id: row.counterpart_registration_id as string | null ?? undefined,
    counterpart_id: row.counterpart_id as string | null ?? undefined,
    original_staff_id: row.original_staff_id as string | undefined,
    replacement_staff_id: row.replacement_staff_id as string | undefined,
    new_host_id: row.new_host_id as string | undefined,
    new_support_id: row.new_support_id as string | undefined,
    new_technical_id: row.new_technical_id as string | undefined,
    reason: row.reason as string,
    notes: row.notes as string | undefined,
    approval_history: normalizeApprovalHistory(row.approval_history),
    status: row.status as SwapStatus,
    approved_by: row.approved_by as string | undefined,
    approved_at: row.approved_at as string | undefined,
    responded_at: row.responded_at as string | undefined,
    responded_by: row.responded_by as string | undefined,
    completed_at: row.completed_at as string | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    version: row.version == null ? undefined : Number(row.version),
    deleted_at: row.deleted_at as string | undefined,
    deleted_by: row.deleted_by as string | undefined,
  }
}
function rows<T>(op:string, r:{data:T[]|null;error:SupabaseErrorShape|null}):T[] { if(r.error) throw requestError(op,r.error); return r.data ?? [] }
function one<T>(op:string, r:{data:T|null;error:SupabaseErrorShape|null}):T { if(r.error) throw requestError(op,r.error); if(r.data===null) throw new SwapRequestError(`Supabase ${op} returned no persisted row.`,'SWAP_WRITE_NOT_APPLIED'); return r.data }

type SwapOperation = 'create' | 'approve' | 'accept' | 'respond_reject' | 'reject' | 'cancel'
type PendingSwapKey = { key: string }
const pendingSwapKeys = new Map<string, PendingSwapKey>()
const swapKeyStoragePrefix = 'rc19:swap-operation:v1:'

function swapOperationSlot(action: SwapOperation, identity: string): string {
  return `${swapKeyStoragePrefix}${action}:${encodeURIComponent(identity)}`
}

function pendingKeyFor(slot: string): string | null {
  const memoryKey = pendingSwapKeys.get(slot)?.key
  if (memoryKey) return memoryKey
  if (typeof window === 'undefined') return null
  try {
    const saved = window.sessionStorage.getItem(slot)
    if (!saved) return null
    const parsed = JSON.parse(saved) as Partial<PendingSwapKey>
    if (typeof parsed.key !== 'string') return null
    pendingSwapKeys.set(slot, { key: parsed.key })
    return parsed.key
  } catch {
    return null
  }
}

function writePendingKey(slot: string, key: string): void {
  pendingSwapKeys.set(slot, { key })
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.setItem(slot, JSON.stringify({ key })) } catch {
      pendingSwapKeys.delete(slot)
      throw new SwapRequestError('Persistent retry storage is unavailable for this swap operation.', 'SWAP_IDEMPOTENCY_STORAGE_UNAVAILABLE')
    }
  }
}

function clearPendingKey(slot: string, key: string): void {
  if (pendingSwapKeys.get(slot)?.key === key) pendingSwapKeys.delete(slot)
  if (typeof window !== 'undefined') {
    try {
      const current = window.sessionStorage.getItem(slot)
      if (current && (JSON.parse(current) as Partial<PendingSwapKey>).key === key) window.sessionStorage.removeItem(slot)
    } catch { /* storage may be unavailable or malformed */ }
  }
}

function validIdempotencyKey(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
}

function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new SwapRequestError('Secure UUID generation is unavailable for this swap operation.', 'SWAP_IDEMPOTENCY_KEY_UNAVAILABLE')
  }
  return globalThis.crypto.randomUUID()
}

function resolveSwapIdempotencyKey(action: SwapOperation, identity: string, explicit?: SwapIdempotencyKey): { key: SwapIdempotencyKey; slot?: string } {
  if (explicit !== undefined) {
    if (!validIdempotencyKey(explicit)) throw new SwapRequestError('A valid UUID idempotency key is required.', 'SWAP_IDEMPOTENCY_KEY_INVALID')
    return { key: explicit }
  }
  const slot = swapOperationSlot(action, identity)
  const pending = pendingKeyFor(slot)
  const key = pending ?? newIdempotencyKey()
  if (!pending) writePendingKey(slot, key)
  return { key, slot }
}

async function swapOperation(
  client: SupabaseClient,
  op: string,
  action: SwapOperation,
  requestId: string | null,
  identity: string,
  payload: Record<string, unknown>,
  explicitKey?: SwapIdempotencyKey,
): Promise<SwapRequest> {
  const resolved = resolveSwapIdempotencyKey(action, identity, explicitKey)
  let result: { data: NullableSwapRow | null; error: SupabaseErrorShape | null }
  try {
    result = await client.rpc('shift_swap_operation_v1', {
      p_action: action,
      p_request_id: requestId,
      p_payload: payload,
      p_idempotency_key: resolved.key,
    }).single() as typeof result
  } catch (error) {
    // A transport exception can occur after PostgreSQL committed. Keep the key
    // so a retry replays the same transaction and response.
    throw error
  }
  if (result.error) {
    // PostgREST can report a transport failure as an RPC error object. Keep
    // the key for every error until a successful row proves the outcome.
    throw requestError(op, result.error)
  }
  const request = swapFromRow(one(op, result) as unknown as NullableSwapRow)
  if (resolved.slot) clearPendingKey(resolved.slot, resolved.key)
  return request
}

export interface SupabaseSwapRequestRepository {
  getAll(): Promise<SwapRequest[]>
  getPending(): Promise<SwapRequest[]>
  verifyConflict(data: SwapConflictCheckInput): Promise<SwapConflictCheckStatus>
  create(data: { shift_id?: string; sourceRegistrationId: string; targetShiftId?: string | null; replacementStaffId?: string | null; counterpartRegistrationId?: string | null; operational_role?: OperationalRole; replacement_staff_id?: string; reason: string; notes?: string; mode: 'replacement' | 'exchange' }, idempotencyKey?: SwapIdempotencyKey): Promise<SwapRequest>
  approve(id: string, notes?: string, expectedVersion?: number, idempotencyKey?: SwapIdempotencyKey): Promise<SwapRequest>
  reject(id: string, notes?: string, expectedVersion?: number, idempotencyKey?: SwapIdempotencyKey): Promise<SwapRequest>
  cancel(id: string, reason: string, expectedVersion?: number, idempotencyKey?: SwapIdempotencyKey): Promise<SwapRequest>
  accept(id: string, notes?: string, expectedVersion?: number, idempotencyKey?: SwapIdempotencyKey): Promise<SwapRequest>
  respond(id: string, action: 'accept' | 'reject', notes?: string, expectedVersion?: number, idempotencyKey?: SwapIdempotencyKey): Promise<SwapRequest>
}

export function createSupabaseSwapRequestRepository(client: SupabaseClient): SupabaseSwapRequestRepository {
  const select = () => client.from('swap_requests').select(swapRequestColumns)
  return {
    async getAll() { return rows('swap request read', await select().is('deleted_at',null).order('created_at',{ascending:false})).map(r=>swapFromRow(r as unknown as NullableSwapRow)) },
    async getPending() { return rows('pending swap request read', await select().eq('status','pending').is('deleted_at',null).order('created_at',{ascending:true})).map(r=>swapFromRow(r as unknown as NullableSwapRow)) },
    async verifyConflict(data) {
      const result = await client.rpc('check_shift_swap_conflict', {
        p_source_registration_id: data.sourceRegistrationId,
        p_mode: data.mode,
        p_replacement_staff_id: data.replacementStaffId ?? null,
        p_target_shift_id: data.targetShiftId ?? null,
        p_counterpart_registration_id: data.counterpartRegistrationId ?? null,
      })
      if (result.error) throw requestError('swap conflict verification', result.error)
      if (result.data === 'VERIFIED_CLEAR' || result.data === 'CONFLICT') return result.data
      return 'UNKNOWN'
    },
    async create(data, idempotencyKey) {
      if (!data.sourceRegistrationId) throw new SwapRequestError('A source registration is required.', 'SOURCE_REGISTRATION_REQUIRED')
      return swapOperation(client, 'swap request create', 'create', null, data.sourceRegistrationId, {
        source_registration_id: data.sourceRegistrationId,
        mode: data.mode,
        reason: data.reason,
        target_shift_id: data.targetShiftId ?? null,
        replacement_staff_id: data.replacementStaffId ?? data.replacement_staff_id ?? null,
        counterpart_registration_id: data.counterpartRegistrationId ?? null,
        notes: data.notes ?? null,
      }, idempotencyKey)
    },
    async approve(id, notes, expectedVersion, idempotencyKey) {
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new SwapRequestError('An expected request version is required.', 'EXPECTED_VERSION_REQUIRED')
      return swapOperation(client, 'swap request approve', 'approve', id, id, { notes: notes ?? null, expected_version: expectedVersion }, idempotencyKey)
    },
    async reject(id, notes, expectedVersion, idempotencyKey) {
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new SwapRequestError('An expected request version is required.', 'EXPECTED_VERSION_REQUIRED')
      return swapOperation(client, 'swap request reject', 'reject', id, id, { notes: notes ?? null, expected_version: expectedVersion }, idempotencyKey)
    },
    async accept(id, notes, expectedVersion, idempotencyKey) {
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new SwapRequestError('An expected request version is required.', 'EXPECTED_VERSION_REQUIRED')
      return swapOperation(client, 'swap request accept', 'accept', id, id, { notes: notes ?? null, expected_version: expectedVersion }, idempotencyKey)
    },
    async respond(id, action, notes, expectedVersion, idempotencyKey) {
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new SwapRequestError('An expected request version is required.', 'EXPECTED_VERSION_REQUIRED')
      return swapOperation(client, `swap request ${action}`, action === 'accept' ? 'accept' : 'respond_reject', id, id, { notes: notes ?? null, expected_version: expectedVersion }, idempotencyKey)
    },
    async cancel(id, reason, expectedVersion, idempotencyKey) {
      if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new SwapRequestError('An expected request version is required.', 'EXPECTED_VERSION_REQUIRED')
      return swapOperation(client, 'swap request cancel', 'cancel', id, id, { reason, expected_version: expectedVersion }, idempotencyKey)
    },
  }
}
let browserRepository: SupabaseSwapRequestRepository | null = null
let testRepository: SupabaseSwapRequestRepository | undefined
export function getSupabaseSwapRequestRepository(): SupabaseSwapRequestRepository {
  if (testRepository) return testRepository
  if (!browserRepository) browserRepository = createSupabaseSwapRequestRepository(createClient())
  return browserRepository
}
export function setSupabaseSwapRequestRepositoryForTests(repository: SupabaseSwapRequestRepository | undefined): void { testRepository = repository }
