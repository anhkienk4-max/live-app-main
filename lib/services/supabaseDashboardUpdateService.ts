import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardUpdate } from '@/lib/types/database.types'
import { createClient } from '@/lib/supabase/client'

type DashboardUpdateRepository = {
  getByShift(shiftId: string): Promise<DashboardUpdate[]>
  create(data: Omit<DashboardUpdate, 'id' | 'created_at' | 'updated_at'>): Promise<DashboardUpdate>
  remove(id: string, reason: string): Promise<boolean>
}

function mapRow(row: Record<string, unknown>): DashboardUpdate {
  return {
    ...(row as unknown as DashboardUpdate),
    id: String(row.id),
    shift_id: String(row.shift_id),
    time: String(row.time),
    revenue: Number(row.revenue || 0),
    orders: Number(row.orders || 0),
    peak_viewers: Number(row.peak_viewers || 0),
    current_viewers: Number(row.current_viewers || 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export function createSupabaseDashboardUpdateRepository(client: SupabaseClient): DashboardUpdateRepository {
  return {
    async getByShift(shiftId) {
      const result = await client.from('dashboard_updates').select('*').eq('shift_id', shiftId).is('deleted_at', null).order('time', { ascending: false })
      if (result.error) throw new Error('Dashboard updates could not be loaded.')
      return (result.data || []).map(row => mapRow(row as Record<string, unknown>))
    },
    async create(data) {
      const result = await client.rpc('create_dashboard_update', {
        p_data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
      }).single()
      if (result.error || !result.data) throw new Error('Dashboard update could not be persisted.')
      return mapRow(result.data as Record<string, unknown>)
    },
    async remove(id, reason) {
      const result = await client.rpc('delete_dashboard_update', { p_update_id: id, p_reason: reason })
      if (result.error) throw new Error('Dashboard update could not be removed.')
      return result.data === true
    },
  }
}

let browserRepository: DashboardUpdateRepository | null = null
let testRepository: DashboardUpdateRepository | undefined

export function getSupabaseDashboardUpdateRepository() {
  if (testRepository) return testRepository
  if (!browserRepository) browserRepository = createSupabaseDashboardUpdateRepository(createClient())
  return browserRepository
}

export function setSupabaseDashboardUpdateRepositoryForTests(repository: DashboardUpdateRepository | undefined) {
  testRepository = repository
}
