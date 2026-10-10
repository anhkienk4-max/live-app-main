import type { SupabaseClient } from '@supabase/supabase-js'
import type { Shift, ShiftStaffingSummary } from '@/lib/types/database.types'

export async function readShiftStaffingSummary(client: SupabaseClient, shiftIds: string[]): Promise<ShiftStaffingSummary[]> {
  const rows: ShiftStaffingSummary[] = []
  const ids = [...new Set(shiftIds)]
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await client.rpc('get_shift_staffing_summary', { p_shift_ids: ids.slice(offset, offset + 100) })
    if (result.error) throw new Error(result.error.message)
    rows.push(...(result.data ?? []))
  }
  return rows
}

export async function withShiftStaffingSummary(client: SupabaseClient, shifts: Shift[]): Promise<Shift[]> {
  const summary = await readShiftStaffingSummary(client, shifts.map(shift => shift.id))
  const byShift = new Map<string, ShiftStaffingSummary[]>()
  for (const row of summary) byShift.set(row.shift_id, [...(byShift.get(row.shift_id) ?? []), row])
  return shifts.map(shift => ({ ...shift, staffing_summary: byShift.get(shift.id) ?? [] }))
}
