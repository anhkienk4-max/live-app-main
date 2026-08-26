import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { OperationalRole, SwapRequest, SwapStatus } from '@/lib/types/database.types'

const swapRequestColumns = [
  'id','requester_id','source_registration_id','source_shift_id','target_shift_id','counterpart_registration_id','counterpart_id','operational_role','mode','status','reason','notes','created_at','updated_at','responded_at','responded_by','approved_at','approved_by','completed_at','shift_id','original_staff_id','replacement_staff_id','new_host_id','new_support_id','new_technical_id','approval_history','deleted_at','deleted_by','deletion_reason',
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
function requestError(op: string, e: SupabaseErrorShape): SwapRequestError { return new SwapRequestError(e.message?.trim() || `Supabase ${op} failed.`, e.code || 'SWAP_REQUEST_FAILED') }
function swapFromRow(row: NullableSwapRow): SwapRequest {
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
    deleted_at: row.deleted_at as string | undefined,
    deleted_by: row.deleted_by as string | undefined,
  }
}
function rows<T>(op:string, r:{data:T[]|null;error:SupabaseErrorShape|null}):T[] { if(r.error) throw requestError(op,r.error); return r.data ?? [] }
function one<T>(op:string, r:{data:T|null;error:SupabaseErrorShape|null}):T { if(r.error) throw requestError(op,r.error); if(r.data===null) throw new SwapRequestError(`Supabase ${op} returned no persisted row.`,'SWAP_WRITE_NOT_APPLIED'); return r.data }

export interface SupabaseSwapRequestRepository {
  getAll(): Promise<SwapRequest[]>
  getPending(): Promise<SwapRequest[]>
  create(data: { shift_id?: string; sourceRegistrationId: string; targetShiftId?: string | null; replacementStaffId?: string | null; counterpartRegistrationId?: string | null; operational_role?: OperationalRole; replacement_staff_id?: string; reason: string; notes?: string; mode: 'replacement' | 'move' | 'exchange' }): Promise<SwapRequest>
  approve(id: string, notes?: string): Promise<SwapRequest>
  reject(id: string, notes?: string): Promise<SwapRequest>
  cancel(id: string, reason: string): Promise<SwapRequest>
  accept(id: string, notes?: string): Promise<SwapRequest>
  respond(id: string, action: 'accept' | 'reject', notes?: string): Promise<SwapRequest>
}

export function createSupabaseSwapRequestRepository(client: SupabaseClient): SupabaseSwapRequestRepository {
  const select = () => client.from('swap_requests').select(swapRequestColumns)
  return {
    async getAll() { return rows('swap request read', await select().is('deleted_at',null).order('created_at',{ascending:false})).map(r=>swapFromRow(r as unknown as NullableSwapRow)) },
    async getPending() { return rows('pending swap request read', await select().eq('status','pending').is('deleted_at',null).order('created_at',{ascending:true})).map(r=>swapFromRow(r as unknown as NullableSwapRow)) },
    async create(data) {
      if (!data.sourceRegistrationId) throw new SwapRequestError('A source registration is required.', 'SOURCE_REGISTRATION_REQUIRED')
      // legacy replacement
      const result = await client.rpc('create_shift_swap_request', {
        p_source_registration_id: data.sourceRegistrationId,
        p_mode: data.mode,
        p_target_shift_id: data.targetShiftId ?? null,
        p_replacement_staff_id: data.replacementStaffId ?? data.replacement_staff_id ?? null,
        p_counterpart_registration_id: data.counterpartRegistrationId ?? null,
        p_reason: data.reason,
        p_notes: data.notes ?? null,
      }).single()
      // fallback to legacy RPC if new fails due to missing overload — try legacy
      return swapFromRow(one('swap request create', result) as unknown as NullableSwapRow)
    },
    async approve(id, notes) {
      const result = await client.rpc('approve_shift_swap_request', { p_request_id: id, p_notes: notes ?? null }).single()
      return swapFromRow(one('swap request approve', result) as unknown as NullableSwapRow)
    },
    async reject(id, notes) {
      const result = await client.rpc('reject_shift_swap_request', { p_request_id: id, p_notes: notes ?? null }).single()
      return swapFromRow(one('swap request reject', result) as unknown as NullableSwapRow)
    },
    async accept(id, notes) {
      const result = await client.rpc('respond_shift_swap_request', { p_request_id: id, p_action: 'accept', p_notes: notes ?? null }).single()
      return swapFromRow(one('swap request accept', result) as unknown as NullableSwapRow)
    },
    async respond(id, action, notes) {
      const result = await client.rpc('respond_shift_swap_request', { p_request_id: id, p_action: action, p_notes: notes ?? null }).single()
      return swapFromRow(one('swap request response', result) as unknown as NullableSwapRow)
    },
    async cancel(id, reason) {
      const result = await client.rpc('cancel_own_shift_swap_request', { p_request_id: id, p_reason: reason }).single()
      return swapFromRow(one('swap request cancel', result) as unknown as NullableSwapRow)
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
