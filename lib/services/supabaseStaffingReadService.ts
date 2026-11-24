import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersistedStaffingSegment, Shift, ShiftStaffingSummary } from '@/lib/types/database.types'
import { persistedSegmentToDraft } from '@/lib/utils/staffingSemantics'

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

export async function readShiftStaffingSegments(
  client: SupabaseClient,
  shiftIds: string[],
): Promise<PersistedStaffingSegment[]> {
  const ids = [...new Set(shiftIds.filter(Boolean))]
  if (!ids.length || typeof client.from !== 'function') return []
  const rows: PersistedStaffingSegment[] = []
  for (let offset = 0; offset < ids.length; offset += 400) {
    const batch = [0, 100, 200, 300].map(d => offset + d).filter(o => o < ids.length)
    const results = await Promise.all(
      batch.map(o =>
        client
          .from('shift_staffing_segments')
          .select(
            'id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,required_technical_count,planned_host_names,planned_support_names,planned_technical_names',
          )
          .in('shift_id', ids.slice(o, o + 100))
          .order('start_at')
          .order('id'),
      ),
    )
    for (const result of results) {
      if (result.error) throw new Error(result.error.message)
      rows.push(...((result.data ?? []) as PersistedStaffingSegment[]))
    }
  }
  return rows
}

export async function withShiftStaffingSummary<T extends Shift>(client: SupabaseClient, shifts: T[]): Promise<T[]> {
  if (!shifts.length) return []
  const shiftIds = shifts.map(shift => shift.id)
  const [summary, segments] = await Promise.all([
    readShiftStaffingSummary(client, shiftIds),
    readShiftStaffingSegments(client, shiftIds),
  ])
  const byShift = new Map<string, ShiftStaffingSummary[]>()
  for (const row of summary) byShift.set(row.shift_id, [...(byShift.get(row.shift_id) ?? []), row])
  const segmentsByShift = new Map<string, PersistedStaffingSegment[]>()
  for (const segment of segments) {
    segmentsByShift.set(segment.shift_id, [...(segmentsByShift.get(segment.shift_id) ?? []), segment])
  }
  return shifts.map(shift => {
    const rawSegments = segmentsByShift.get(shift.id)
    const shiftSegments = rawSegments
      ? [...rawSegments].sort(
          (a, b) => a.segment_index - b.segment_index || a.start_at.localeCompare(b.start_at) || a.id.localeCompare(b.id),
        )
      : undefined
    return {
      ...shift,
      staffing_summary: byShift.get(shift.id) ?? [],
      ...(shiftSegments
        ? {
            persisted_staffing_segments: shiftSegments,
            staffing_segments: shiftSegments.map(seg => persistedSegmentToDraft(seg, shift.timezone)),
          }
        : {}),
    }
  })
}
