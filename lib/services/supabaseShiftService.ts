import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import type {
  DeletionImpact,
  LifecycleMetadata,
  Shift,
  ShiftStatus,
} from '@/lib/types/database.types'
import { businessLocalDate, DEFAULT_BUSINESS_TIMEZONE } from '@/lib/utils/shiftUtils'

const shiftColumns = [
  'id',
  'date',
  'start_time',
  'end_time',
  'timezone',
  'start_at',
  'end_at',
  'end_date',
  'crosses_midnight',
  'duration_minutes',
  'brand_id',
  'platform_id',
  'campaign_id',
  'title',
  'studio',
  'host_id',
  'support_id',
  'technical_id',
  'host_names',
  'assistant_names',
  'technical_names',
  'required_host_count',
  'required_support_count',
  'required_technical_count',
  'registration_locked',
  'registration_cutoff_at',
  'allow_multi_role',
  'import_batch_id',
  'status',
  'live_link',
  'product_notes',
  'updated_by',
  'created_at',
  'updated_at',
  'version',
  'deleted_at',
  'deleted_by',
  'archived_at',
  'archived_by',
  'deletion_reason',
].join(',')

type Nullable<T> = { [Key in keyof T]: T[Key] | null }
type ShiftRow = Nullable<Shift> &
  Pick<
    Shift,
    | 'id'
    | 'date'
    | 'start_time'
    | 'end_time'
    | 'brand_id'
    | 'platform_id'
    | 'status'
    | 'created_at'
    | 'updated_at'
    | 'version'
  > & {
    timezone: string
    crosses_midnight: boolean
    duration_minutes: number
    end_date: string
    required_host_count: number
    required_support_count: number
    required_technical_count: number
    registration_locked: boolean
    allow_multi_role: boolean
    host_names: string[]
    assistant_names: string[]
    technical_names: string[]
  }

interface SupabaseErrorShape {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export class ShiftRequestError extends Error {
  constructor(
    message: string,
    public readonly code = 'SHIFT_REQUEST_FAILED',
  ) {
    super(message)
    this.name = 'ShiftRequestError'
  }
}

export type ShiftStaffingLabels = Required<Pick<
  Shift,
  'host_names' | 'assistant_names' | 'technical_names'
>>

function requestError(operation: string, error: SupabaseErrorShape): ShiftRequestError {
  const message = error.message?.trim() || `Supabase ${operation} failed.`
  const code = message.includes('STALE_WRITE') ? 'STALE_WRITE' : error.code || 'SHIFT_REQUEST_FAILED'
  return new ShiftRequestError(message, code)
}

function requiredRow<T>(
  operation: string,
  result: { data: T | null; error: SupabaseErrorShape | null },
): T {
  if (result.error) throw requestError(operation, result.error)
  if (result.data === null) {
    throw new ShiftRequestError(
      `Supabase ${operation} returned no persisted row.`,
      'SHIFT_WRITE_NOT_APPLIED',
    )
  }
  return result.data
}

function optionalRows<T>(
  operation: string,
  result: { data: T[] | null; error: SupabaseErrorShape | null },
): T[] {
  if (result.error) throw requestError(operation, result.error)
  return result.data ?? []
}

function lifecycle(row: {
  deleted_at?: string | null
  deleted_by?: string | null
  archived_at?: string | null
  archived_by?: string | null
  deletion_reason?: string | null
}): LifecycleMetadata {
  return {
    deleted_at: row.deleted_at ?? undefined,
    deleted_by: row.deleted_by ?? undefined,
    archived_at: row.archived_at ?? undefined,
    archived_by: row.archived_by ?? undefined,
    deletion_reason: row.deletion_reason ?? undefined,
  }
}

/** Postgres `time` columns return `HH:MM:SS`; the app contract is `HH:MM`. */
function normalizeTime(value: string | null | undefined): string {
  if (!value) return ''
  return value.length > 5 ? value.slice(0, 5) : value
}

function shiftFromRow(row: ShiftRow): Shift {
  return {
    id: row.id,
    date: row.date,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    timezone: row.timezone || DEFAULT_BUSINESS_TIMEZONE,
    start_at: row.start_at ?? undefined,
    end_at: row.end_at ?? undefined,
    end_date: row.end_date ?? undefined,
    crosses_midnight: row.crosses_midnight,
    duration_minutes: row.duration_minutes,
    brand_id: row.brand_id,
    platform_id: row.platform_id,
    campaign_id: row.campaign_id ?? undefined,
    title: row.title ?? undefined,
    studio: row.studio ?? undefined,
    host_id: row.host_id ?? undefined,
    support_id: row.support_id ?? undefined,
    technical_id: row.technical_id ?? undefined,
    host_names: row.host_names ?? [],
    assistant_names: row.assistant_names ?? [],
    technical_names: row.technical_names ?? [],
    required_host_count: row.required_host_count,
    required_support_count: row.required_support_count,
    required_technical_count: row.required_technical_count,
    registration_locked: row.registration_locked,
    registration_cutoff_at: row.registration_cutoff_at ?? undefined,
    allow_multi_role: row.allow_multi_role,
    import_batch_id: row.import_batch_id ?? undefined,
    status: row.status as ShiftStatus,
    live_link: row.live_link ?? undefined,
    product_notes: row.product_notes ?? undefined,
    updated_by: row.updated_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version ?? undefined,
    ...lifecycle(row),
  }
}

/** RPC payload for create_shift. Only fields the RPC accepts. */
function createPayload(data: Omit<Shift, 'id' | 'created_at' | 'updated_at'>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    date: data.date,
    start_time: data.start_time,
    end_time: data.end_time,
    timezone: data.timezone || DEFAULT_BUSINESS_TIMEZONE,
    brand_id: data.brand_id,
    platform_id: data.platform_id,
    campaign_id: data.campaign_id,
    title: data.title,
    studio: data.studio,
    host_id: data.host_id,
    support_id: data.support_id,
    technical_id: data.technical_id,
    host_names: data.host_names ?? [],
    assistant_names: data.assistant_names ?? [],
    technical_names: data.technical_names ?? [],
    required_host_count: data.required_host_count,
    required_support_count: data.required_support_count,
    required_technical_count: data.required_technical_count,
    registration_cutoff_at: data.registration_cutoff_at,
    allow_multi_role: data.allow_multi_role,
    import_batch_id: data.import_batch_id,
    status: data.status,
    live_link: data.live_link,
    product_notes: data.product_notes,
  }
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}

/** RPC payload for update_shift. Only fields the RPC accepts. */
function updatePayload(data: Partial<Shift>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    date: data.date,
    start_time: data.start_time,
    end_time: data.end_time,
    brand_id: data.brand_id,
    platform_id: data.platform_id,
    campaign_id: data.campaign_id,
    title: data.title,
    studio: data.studio,
    required_host_count: data.required_host_count,
    required_support_count: data.required_support_count,
    required_technical_count: data.required_technical_count,
    status: data.status,
    live_link: data.live_link,
    product_notes: data.product_notes,
    registration_cutoff_at: data.registration_cutoff_at,
    allow_multi_role: data.allow_multi_role,
  }
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}

export interface SupabaseShiftRepository {
  getAll(includeDeleted?: boolean): Promise<Shift[]>
  getArchivedShifts(): Promise<Shift[]>
  getById(id: string): Promise<Shift | null>
  getByDate(date: string): Promise<Shift[]>
  getByDateRange(startDate: string, endDate: string): Promise<Shift[]>
  getByStatus(status: string): Promise<Shift[]>
  getOpen(): Promise<Shift[]>
  getToday(): Promise<Shift[]>
  getDeletionImpact(id: string): Promise<DeletionImpact | null>
  create(data: Omit<Shift, 'id' | 'created_at' | 'updated_at'>): Promise<Shift>
  update(id: string, data: Partial<Shift>, confirmImpact?: boolean, expectedVersion?: number): Promise<Shift | null>
  updateStaffingLabels(id: string, labels: ShiftStaffingLabels, expectedVersion?: number): Promise<Shift | null>
  setRegistrationLock(id: string, locked: boolean, expectedVersion?: number): Promise<Shift | null>
  remove(id: string, reason: string, expectedVersion?: number): Promise<DeletionImpact | null>
  restore(id: string, expectedVersion?: number): Promise<Shift | null>
}

export function createSupabaseShiftRepository(
  client: SupabaseClient,
): SupabaseShiftRepository {
  const selectShifts = () => client.from('shifts').select(shiftColumns)

  return {
    async getAll(includeDeleted = false) {
      let query = selectShifts().order('date', { ascending: true }).order('start_time', { ascending: true })
      if (!includeDeleted) query = query.is('deleted_at', null).is('archived_at', null)
      const result = await query
      return optionalRows('shift read', result).map(row => shiftFromRow(row as unknown as ShiftRow))
    },

    async getArchivedShifts() {
      const result = await selectShifts()
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      return optionalRows('shift archived read', result)
        .map(row => shiftFromRow(row as unknown as ShiftRow))
    },

    async getById(id) {
      const result = await selectShifts().eq('id', id).maybeSingle()
      if (result.error) throw requestError('shift lookup', result.error)
      return result.data ? shiftFromRow(result.data as unknown as ShiftRow) : null
    },

    async getByDate(date) {
      const result = await selectShifts()
        .eq('date', date)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('start_time', { ascending: true })
      return optionalRows('shift date read', result)
        .map(row => shiftFromRow(row as unknown as ShiftRow))
    },

    async getByDateRange(startDate, endDate) {
      const result = await selectShifts()
        .gte('date', startDate)
        .lte('date', endDate)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
      return optionalRows('shift date-range read', result)
        .map(row => shiftFromRow(row as unknown as ShiftRow))
    },

    async getByStatus(status) {
      const result = await selectShifts()
        .eq('status', status)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('date', { ascending: true })
      return optionalRows('shift status read', result)
        .map(row => shiftFromRow(row as unknown as ShiftRow))
    },

    async getOpen() {
      const result = await selectShifts()
        .eq('status', 'scheduled')
        .eq('registration_locked', false)
        .is('deleted_at', null)
        .is('archived_at', null)
        .gt('end_at', new Date().toISOString())
        .order('date', { ascending: true })
      return optionalRows('shift open read', result)
        .map(row => shiftFromRow(row as unknown as ShiftRow))
    },

    async getToday() {
      const today = businessLocalDate()
      return this.getByDate(today)
    },

    async getDeletionImpact(id) {
      const shift = await this.getById(id)
      if (!shift) return null
      const registrationResult = await client.from('shift_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('shift_id', id)
        .not('status', 'in', '("cancelled","rejected")')
      if (registrationResult.error) throw requestError('shift deletion impact read', registrationResult.error)
      const registrationCount = registrationResult.count ?? 0
      const requiresHistory = registrationCount > 0 || ['preparing', 'live', 'paused', 'completed'].includes(shift.status)
      return {
        entity_type: 'shift',
        entity_id: shift.id,
        entity_name: shift.title || `${shift.date} ${shift.start_time}-${shift.end_time}`,
        action: requiresHistory ? 'soft_delete' : 'delete',
        consequence: requiresHistory
          ? 'The shift will be cancelled and hidden from operational lists. Related history remains available.'
          : 'The empty, not-yet-live shift will be permanently removed.',
        reversible: requiresHistory,
        related_records: registrationCount > 0
          ? [{ entity_type: 'shift_registration', entity_id: '*', entity_name: 'Shift registrations', count: registrationCount }]
          : [],
      }
    },

    async create(data) {
      const result = await client.rpc('create_shift', { p_data: createPayload(data) }).single()
      return shiftFromRow(requiredRow('shift create', result) as unknown as ShiftRow)
    },

    async update(id, data, confirmImpact = false, expectedVersion) {
      const result = await client.rpc('update_shift', {
        p_shift_id: id,
        p_patch: updatePayload(data),
        p_confirm_impact: confirmImpact,
        p_expected_version: expectedVersion ?? null,
      }).single()
      if (result.error) throw requestError('shift update', result.error)
      return result.data ? shiftFromRow(result.data as unknown as ShiftRow) : null
    },

    async updateStaffingLabels(id, labels, expectedVersion) {
      const result = await client.rpc('update_shift_staffing_labels', {
        p_shift_id: id,
        p_host_names: labels.host_names,
        p_assistant_names: labels.assistant_names,
        p_technical_names: labels.technical_names,
        p_expected_version: expectedVersion ?? null,
      }).single()
      if (result.error) throw requestError('shift staffing label update', result.error)
      return result.data ? shiftFromRow(result.data as unknown as ShiftRow) : null
    },

    async setRegistrationLock(id, locked, expectedVersion) {
      const result = await client.rpc('set_shift_registration_lock', {
        p_shift_id: id,
        p_locked: locked,
        p_expected_version: expectedVersion ?? null,
      }).single()
      if (result.error) throw requestError('shift lock update', result.error)
      return result.data ? shiftFromRow(result.data as unknown as ShiftRow) : null
    },

    async remove(id, reason, expectedVersion) {
      const result = await client.rpc('soft_delete_shift', {
        p_shift_id: id,
        p_reason: reason ?? null,
        p_expected_version: expectedVersion ?? null,
      }).single()
      if (result.error) throw requestError('shift soft delete', result.error)
      const shift = shiftFromRow(requiredRow('shift soft delete', result) as unknown as ShiftRow)
      return {
        entity_type: 'shift',
        entity_id: shift.id,
        entity_name: shift.title || `${shift.date} ${shift.start_time}-${shift.end_time}`,
        action: 'soft_delete',
        consequence: 'The shift has been cancelled and hidden from operational lists. Related history remains available.',
        reversible: true,
        related_records: [],
      }
    },

    async restore(id, expectedVersion) {
      const result = await client.rpc('restore_shift', {
        p_shift_id: id,
        p_expected_version: expectedVersion ?? null,
      }).single()
      if (result.error) throw requestError('shift restore', result.error)
      return result.data ? shiftFromRow(result.data as unknown as ShiftRow) : null
    },
  }
}

let browserRepository: SupabaseShiftRepository | null = null
let testRepository: SupabaseShiftRepository | undefined

export function getSupabaseShiftRepository(): SupabaseShiftRepository {
  if (testRepository) return testRepository
  if (!browserRepository) browserRepository = createSupabaseShiftRepository(createClient())
  return browserRepository
}

export function setSupabaseShiftRepositoryForTests(
  repository: SupabaseShiftRepository | undefined,
): void {
  testRepository = repository
}
