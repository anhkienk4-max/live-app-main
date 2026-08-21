import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import type {
  OperationalRole,
  Shift,
  ShiftRegistration,
} from '@/lib/types/database.types'

const registrationColumns = [
  'id',
  'shift_id',
  'user_id',
  'operational_role',
  'status',
  'source',
  'requested_at',
  'reviewed_by',
  'reviewed_at',
  'review_notes',
  'cancelled_at',
  'created_at',
  'updated_at',
].join(',')

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
  'deleted_at',
  'deleted_by',
  'archived_at',
  'archived_by',
  'deletion_reason',
].join(',')

type Nullable<T> = { [Key in keyof T]: T[Key] | null }
type RegistrationRow = Nullable<ShiftRegistration> &
  Pick<ShiftRegistration, 'id' | 'shift_id' | 'user_id' | 'operational_role' | 'status' | 'source' | 'requested_at' | 'created_at' | 'updated_at'>
type ShiftRow = Nullable<Shift> &
  Pick<Shift, 'id' | 'date' | 'start_time' | 'end_time' | 'brand_id' | 'platform_id' | 'status' | 'created_at' | 'updated_at'> & {
    timezone: string
    crosses_midnight: boolean
    duration_minutes: number
    end_date: string
    required_host_count: number
    required_support_count: number
    required_technical_count: number
    host_names: string[]
    assistant_names: string[]
    technical_names: string[]
    registration_locked: boolean
    allow_multi_role: boolean
  }

interface SupabaseErrorShape {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export class RegistrationRequestError extends Error {
  constructor(
    message: string,
    public readonly code = 'REGISTRATION_REQUEST_FAILED',
  ) {
    super(message)
    this.name = 'RegistrationRequestError'
  }
}

function requestError(operation: string, error: SupabaseErrorShape): RegistrationRequestError {
  const message = error.message?.trim() || `Supabase ${operation} failed.`
  return new RegistrationRequestError(message, error.code || 'REGISTRATION_REQUEST_FAILED')
}

function requiredRow<T>(
  operation: string,
  result: { data: T | null; error: SupabaseErrorShape | null },
): T {
  if (result.error) throw requestError(operation, result.error)
  if (result.data === null) {
    throw new RegistrationRequestError(
      `Supabase ${operation} returned no persisted row.`,
      'REGISTRATION_WRITE_NOT_APPLIED',
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

function registrationFromRow(row: RegistrationRow): ShiftRegistration {
  return {
    id: row.id,
    shift_id: row.shift_id,
    user_id: row.user_id,
    operational_role: row.operational_role,
    status: row.status,
    source: row.source,
    requested_at: row.requested_at,
    reviewed_by: row.reviewed_by ?? undefined,
    reviewed_at: row.reviewed_at ?? undefined,
    review_notes: row.review_notes ?? undefined,
    cancelled_at: row.cancelled_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
    status: row.status,
    live_link: row.live_link ?? undefined,
    product_notes: row.product_notes ?? undefined,
    updated_by: row.updated_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
    deleted_by: row.deleted_by ?? undefined,
    archived_at: row.archived_at ?? undefined,
    archived_by: row.archived_by ?? undefined,
    deletion_reason: row.deletion_reason ?? undefined,
  }
}

export interface ShiftRoleCapacity {
  role: OperationalRole
  required: number
  approved: number
  pending: number
  remaining: number
}

const roleRequiredField: Record<
  OperationalRole,
  'required_host_count' | 'required_support_count' | 'required_technical_count'
> = {
  host: 'required_host_count',
  support: 'required_support_count',
  technical: 'required_technical_count',
}

export const isStaffedRegistration = (
  registration: Pick<ShiftRegistration, 'status'>,
): boolean =>
  registration.status === 'approved' || registration.status === 'manually_assigned'

export interface SupabaseShiftRegistrationRepository {
  getAll(): Promise<ShiftRegistration[]>
  getForShift(shiftId: string): Promise<ShiftRegistration[]>
  getForUser(userId: string): Promise<ShiftRegistration[]>
  getCapacity(shiftId: string): Promise<ShiftRoleCapacity[]>
  getMyApprovedShifts(userId: string): Promise<Shift[]>
  register(shiftId: string, role: OperationalRole): Promise<ShiftRegistration>
  cancel(id: string, notes?: string): Promise<ShiftRegistration>
  approve(id: string, notes?: string): Promise<ShiftRegistration>
  reject(id: string, notes?: string): Promise<ShiftRegistration>
  assignManually(shiftId: string, userId: string, role: OperationalRole, notes?: string): Promise<ShiftRegistration>
  removeAssignment(id: string, notes?: string): Promise<ShiftRegistration>
}

export function createSupabaseShiftRegistrationRepository(
  client: SupabaseClient,
): SupabaseShiftRegistrationRepository {
  const selectRegistrations = () => client.from('shift_registrations').select(registrationColumns)
  const selectShifts = () => client.from('shifts').select(shiftColumns)

  const capacityFor = (
    registrations: ShiftRegistration[],
    shift: Shift,
    role: OperationalRole,
  ): ShiftRoleCapacity => {
    const roleRegistrations = registrations.filter(registration =>
      registration.shift_id === shift.id &&
      registration.operational_role === role &&
      (isStaffedRegistration(registration) || registration.status === 'pending'),
    )
    const required = shift[roleRequiredField[role]] ?? 1
    const approved = roleRegistrations.filter(isStaffedRegistration).length
    const pending = roleRegistrations.filter(registration => registration.status === 'pending').length
    return {
      role,
      required,
      approved,
      pending,
      remaining: Math.max(0, required - approved),
    }
  }

  return {
    async getAll() {
      const result = await selectRegistrations()
        .order('requested_at', { ascending: true })
      return optionalRows('registration read', result)
        .map(row => registrationFromRow(row as unknown as RegistrationRow))
    },

    async getForShift(shiftId) {
      const result = await selectRegistrations()
        .eq('shift_id', shiftId)
        .order('requested_at', { ascending: true })
      return optionalRows('registration shift read', result)
        .map(row => registrationFromRow(row as unknown as RegistrationRow))
    },

    async getForUser(userId) {
      const result = await selectRegistrations()
        .eq('user_id', userId)
        .order('requested_at', { ascending: true })
      return optionalRows('registration user read', result)
        .map(row => registrationFromRow(row as unknown as RegistrationRow))
    },

    async getCapacity(shiftId) {
      const shiftResult = await selectShifts().eq('id', shiftId).maybeSingle()
      if (shiftResult.error) throw requestError('shift capacity read', shiftResult.error)
      if (!shiftResult.data) return []
      const shift = shiftFromRow(shiftResult.data as unknown as ShiftRow)
      const regResult = await selectRegistrations().eq('shift_id', shiftId)
      const registrations = optionalRows('shift capacity registrations read', regResult)
        .map(row => registrationFromRow(row as unknown as RegistrationRow))
      return (['host', 'support', 'technical'] as OperationalRole[]).map(role =>
        capacityFor(registrations, shift, role))
    },

    async getMyApprovedShifts(userId) {
      const regResult = await selectRegistrations()
        .eq('user_id', userId)
        .in('status', ['approved', 'manually_assigned'])
      const registrations = optionalRows('my approved registrations read', regResult)
        .map(row => registrationFromRow(row as unknown as RegistrationRow))
      if (registrations.length === 0) return []
      const shiftIds = registrations.map(registration => registration.shift_id)
      const shiftResult = await selectShifts()
        .in('id', shiftIds)
        .is('deleted_at', null)
      return optionalRows('my approved shifts read', shiftResult)
        .map(row => shiftFromRow(row as unknown as ShiftRow))
    },

    async register(shiftId, role) {
      const result = await client.rpc('register_for_shift', {
        p_shift_id: shiftId,
        p_role: role,
      }).single()
      return registrationFromRow(
        requiredRow('registration register', result) as unknown as RegistrationRow,
      )
    },

    async cancel(id, notes) {
      const result = await client.rpc('cancel_own_shift_registration', {
        p_registration_id: id,
        p_notes: notes ?? null,
      }).single()
      return registrationFromRow(
        requiredRow('registration cancel', result) as unknown as RegistrationRow,
      )
    },

    async approve(id, notes) {
      const result = await client.rpc('approve_shift_registration', {
        p_registration_id: id,
        p_notes: notes ?? null,
      }).single()
      return registrationFromRow(
        requiredRow('registration approve', result) as unknown as RegistrationRow,
      )
    },

    async reject(id, notes) {
      const result = await client.rpc('reject_shift_registration', {
        p_registration_id: id,
        p_notes: notes ?? null,
      }).single()
      return registrationFromRow(
        requiredRow('registration reject', result) as unknown as RegistrationRow,
      )
    },

    async assignManually(shiftId, userId, role, notes) {
      const result = await client.rpc('manual_assign_shift_staff', {
        p_shift_id: shiftId,
        p_user_id: userId,
        p_role: role,
        p_notes: notes ?? null,
      }).single()
      return registrationFromRow(
        requiredRow('registration manual assign', result) as unknown as RegistrationRow,
      )
    },

    async removeAssignment(id, notes) {
      const result = await client.rpc('remove_shift_staffing', {
        p_registration_id: id,
        p_notes: notes ?? null,
      }).single()
      return registrationFromRow(
        requiredRow('registration remove assignment', result) as unknown as RegistrationRow,
      )
    },
  }
}

let browserRepository: SupabaseShiftRegistrationRepository | null = null
let testRepository: SupabaseShiftRegistrationRepository | undefined

export function getSupabaseShiftRegistrationRepository(): SupabaseShiftRegistrationRepository {
  if (testRepository) return testRepository
  if (!browserRepository) browserRepository = createSupabaseShiftRegistrationRepository(createClient())
  return browserRepository
}

export function setSupabaseShiftRegistrationRepositoryForTests(
  repository: SupabaseShiftRegistrationRepository | undefined,
): void {
  testRepository = repository
}
