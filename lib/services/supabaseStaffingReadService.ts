import type { SupabaseClient } from '@supabase/supabase-js'
import type { Shift, ShiftStaffingSummary } from '@/lib/types/database.types'

export async function readShiftStaffingSummary(client: SupabaseClient, shiftIds: string[]): Promise<ShiftStaffingSummary[]> {
  const rows: ShiftStaffingSummary[] = []
  const ids = [...new Set(shiftIds)]
  for (let offset = 0; offset < ids.length; offset += 400) { const batch = [0, 100, 200, 300].map(d => offset + d).filter(o => o < ids.length); const results = await Promise.all(batch.map(o => client.rpc('get_shift_staffing_summary', { p_shift_ids: ids.slice(o, o + 100) }))); for (const result of results) {
    void offset
    if (result.error) throw new Error(result.error.message)
    rows.push(...(result.data ?? []))
  } }
  return rows
}

export async function withShiftStaffingSummary(client: SupabaseClient, shifts: Shift[]): Promise<Shift[]> {
  const summary = await readShiftStaffingSummary(client, shifts.map(shift => shift.id))
  const byShift = new Map<string, ShiftStaffingSummary[]>()
  for (const row of summary) byShift.set(row.shift_id, [...(byShift.get(row.shift_id) ?? []), row])
  return shifts.map(shift => ({ ...shift, staffing_summary: byShift.get(shift.id) ?? [] }))
}
