import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeDayTimelineLayout,
  groupTimeGridShifts,
  shiftsForGridDate,
} from '@/lib/utils/timeGrid'
import type { Shift } from '@/lib/types/database.types'

function mockShift(partial: Partial<Shift> & { id: string; start_time: string; end_time: string; date?: string }): Shift {
  return {
    id: partial.id,
    title: partial.title || `Shift ${partial.id}`,
    date: partial.date || '2026-11-11',
    start_time: partial.start_time,
    end_time: partial.end_time,
    brand_id: partial.brand_id || 'brand-1',
    platform_id: partial.platform_id || 'plat-1',
    status: partial.status || 'scheduled',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    host_id: partial.host_id || null,
    support_id: partial.support_id || null,
    studio: partial.studio || 'Studio 1',
    ...partial,
  } as Shift
}

test('G2.1 — Single shift occupies 1 lane with 100% width and lane 0', () => {
  const shifts = [mockShift({ id: 's1', start_time: '08:00', end_time: '10:00' })]
  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 1)
  assert.equal(layout.renderedShifts.length, 1)
  assert.equal(layout.overflowBadges.length, 0)

  const s1 = layout.renderedShifts[0]
  assert.equal(s1.lane, 0)
  assert.equal(s1.totalLanes, 1)
  assert.equal(s1.leftPercent, 0)
  assert.equal(s1.widthPercent, 100)
  assert.equal(s1.topPx, (8 * 44))
  assert.equal(s1.heightPx, (2 * 44))
})

test('G2.1 — Two overlapping shifts occupy 2 lanes with 50% width', () => {
  const shifts = [
    mockShift({ id: 's1', start_time: '09:00', end_time: '11:00' }),
    mockShift({ id: 's2', start_time: '09:30', end_time: '11:30' }),
  ]
  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 1)
  assert.equal(layout.renderedShifts.length, 2)
  assert.equal(layout.overflowBadges.length, 0)

  assert.equal(layout.renderedShifts[0].lane, 0)
  assert.equal(layout.renderedShifts[0].totalLanes, 2)
  assert.equal(layout.renderedShifts[0].widthPercent, 50)
  assert.equal(layout.renderedShifts[0].leftPercent, 0)

  assert.equal(layout.renderedShifts[1].lane, 1)
  assert.equal(layout.renderedShifts[1].totalLanes, 2)
  assert.equal(layout.renderedShifts[1].widthPercent, 50)
  assert.equal(layout.renderedShifts[1].leftPercent, 50)
})

test('G2.1 — Three overlapping shifts occupy exactly 3 lanes with 33.33% width', () => {
  const shifts = [
    mockShift({ id: 's1', start_time: '10:00', end_time: '12:00' }),
    mockShift({ id: 's2', start_time: '10:15', end_time: '12:15' }),
    mockShift({ id: 's3', start_time: '10:30', end_time: '12:30' }),
  ]
  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 1)
  assert.equal(layout.renderedShifts.length, 3)
  assert.equal(layout.overflowBadges.length, 0)

  for (let i = 0; i < 3; i++) {
    assert.equal(layout.renderedShifts[i].lane, i)
    assert.equal(layout.renderedShifts[i].totalLanes, 3)
    assert.ok(Math.abs(layout.renderedShifts[i].widthPercent - 33.333) < 0.1)
  }
})

test('G2.1 — Concurrency > 3 displays 2 visible streams and 1 overflow badge (+N ca khác) in Lane 2', () => {
  const shifts = [
    mockShift({ id: 's1', start_time: '14:00', end_time: '16:00' }),
    mockShift({ id: 's2', start_time: '14:05', end_time: '16:05' }),
    mockShift({ id: 's3', start_time: '14:10', end_time: '16:10' }),
    mockShift({ id: 's4', start_time: '14:15', end_time: '16:15' }),
    mockShift({ id: 's5', start_time: '14:20', end_time: '16:20' }),
  ]
  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 1)
  // Lane 0 and Lane 1 hold 2 shifts
  assert.equal(layout.renderedShifts.length, 2)
  assert.equal(layout.renderedShifts[0].lane, 0)
  assert.equal(layout.renderedShifts[1].lane, 1)

  // Lane 2 holds overflow badge
  assert.equal(layout.overflowBadges.length, 1)
  const badge = layout.overflowBadges[0]
  assert.equal(badge.lane, 2)
  assert.equal(badge.totalLanes, 3)
  assert.equal(badge.count, 3) // 3 overflow shifts
  assert.equal(badge.allClusterShifts.length, 5) // all 5 shifts belong to this window
  assert.equal(badge.overflowShifts.length, 3)
  assert.ok(Math.abs(badge.leftPercent - 66.666) < 0.1)
})

test('G2.1 & G2.2 — Distinct time slots form independent clusters and never merge into a single giant block', () => {
  const shifts = [
    // Morning cluster (08:00 - 10:00)
    mockShift({ id: 'm1', start_time: '08:00', end_time: '10:00' }),
    mockShift({ id: 'm2', start_time: '08:30', end_time: '10:30' }),

    // Afternoon cluster (13:00 - 15:00)
    mockShift({ id: 'a1', start_time: '13:00', end_time: '15:00' }),
    mockShift({ id: 'a2', start_time: '13:15', end_time: '15:15' }),
    mockShift({ id: 'a3', start_time: '13:30', end_time: '15:30' }),

    // Evening cluster (19:00 - 21:00)
    mockShift({ id: 'e1', start_time: '19:00', end_time: '21:00' }),
  ]
  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  // 3 independent clusters
  assert.equal(layout.clusterCount, 3)
  assert.equal(layout.renderedShifts.length, 6)
  assert.equal(layout.overflowBadges.length, 0)

  // Morning cluster has 2 lanes
  const morningShifts = layout.renderedShifts.filter(s => s.start_time.startsWith('08'))
  assert.equal(morningShifts.length, 2)
  assert.equal(morningShifts[0].totalLanes, 2)
  assert.equal(morningShifts[1].totalLanes, 2)

  // Afternoon cluster has 3 lanes
  const afternoonShifts = layout.renderedShifts.filter(s => s.start_time.startsWith('13'))
  assert.equal(afternoonShifts.length, 3)
  assert.equal(afternoonShifts[0].totalLanes, 3)
  assert.equal(afternoonShifts[1].totalLanes, 3)
  assert.equal(afternoonShifts[2].totalLanes, 3)

  // Evening cluster has 1 lane (100% width)
  const eveningShift = layout.renderedShifts.find(s => s.id === 'e1')
  assert.ok(eveningShift)
  assert.equal(eveningShift.totalLanes, 1)
  assert.equal(eveningShift.widthPercent, 100)
})

test('G2.2 — Dense 37-shift day (Owner UAT scenario Nov 10-11) is partitioned into separate time clusters', () => {
  // Construct 37 shifts across 4 discrete windows
  const shifts: Shift[] = []

  // Window 1: Morning (07:00 - 10:00), 8 shifts
  for (let i = 1; i <= 8; i++) {
    shifts.push(mockShift({ id: `w1-${i}`, start_time: '07:30', end_time: '09:30' }))
  }

  // Window 2: Midday (11:30 - 14:00), 10 shifts
  for (let i = 1; i <= 10; i++) {
    shifts.push(mockShift({ id: `w2-${i}`, start_time: '12:00', end_time: '13:45' }))
  }

  // Window 3: Afternoon/Evening (16:00 - 18:30), 12 shifts
  for (let i = 1; i <= 12; i++) {
    shifts.push(mockShift({ id: `w3-${i}`, start_time: '16:00', end_time: '18:00' }))
  }

  // Window 4: Late night (20:00 - 22:30), 7 shifts
  for (let i = 1; i <= 7; i++) {
    shifts.push(mockShift({ id: `w4-${i}`, start_time: '20:15', end_time: '22:15' }))
  }

  assert.equal(shifts.length, 37)

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  // MUST create 4 separate clusters, NEVER 1 giant group of 37!
  assert.equal(layout.clusterCount, 4)

  // Each cluster has 2 visible lanes (8 visible shifts total) and 1 overflow badge (4 badges total)
  assert.equal(layout.renderedShifts.length, 8)
  assert.equal(layout.overflowBadges.length, 4)

  // Verify total shifts represented across rendered + badges equals 37
  const totalRepresented = layout.renderedShifts.length + layout.overflowBadges.reduce((sum, b) => sum + b.count, 0)
  assert.equal(totalRepresented, 37)
})

test('G2.1 — Short shifts nested alongside long shifts reuse available lanes cleanly', () => {
  const shifts = [
    // Long shift occupying lane 0 for 4 hours (08:00 - 12:00)
    mockShift({ id: 'long', start_time: '08:00', end_time: '12:00' }),
    // First short shift (08:00 - 09:30)
    mockShift({ id: 'short1', start_time: '08:00', end_time: '09:30' }),
    // Second short shift (09:45 - 11:15) starting after short1 ends
    mockShift({ id: 'short2', start_time: '09:45', end_time: '11:15' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 1)
  assert.equal(layout.renderedShifts.length, 3)
  assert.equal(layout.overflowBadges.length, 0)

  const longShift = layout.renderedShifts.find(s => s.id === 'long')
  const short1 = layout.renderedShifts.find(s => s.id === 'short1')
  const short2 = layout.renderedShifts.find(s => s.id === 'short2')

  assert.ok(longShift && short1 && short2)
  assert.equal(longShift.lane, 0)
  // Both short shifts sequentially share Lane 1!
  assert.equal(short1.lane, 1)
  assert.equal(short2.lane, 1)
  assert.equal(longShift.totalLanes, 2)
})

test('G2.2 — Overnight continuation and midnight-boundary shifts bound properly without displacement', () => {
  const shifts = [
    // Overnight continuation shift starting at 00:00
    mockShift({ id: 'overnight-cont', start_time: '00:00', end_time: '02:00', ...({ continuation: true } as object) }),
    // Regular shift ending at midnight (22:00 - 24:00)
    mockShift({ id: 'late-night', start_time: '22:00', end_time: '24:00' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 2)
  const cont = layout.renderedShifts.find(s => s.id === 'overnight-cont')
  const late = layout.renderedShifts.find(s => s.id === 'late-night')

  assert.ok(cont && late)
  assert.equal(cont.topPx, 0) // starts at top of grid
  assert.equal(cont.heightPx, 2 * 44)

  assert.equal(late.topPx, 22 * 44)
  assert.equal(late.heightPx, 2 * 44)
  // Grid height upper bound check (never exceeds 24 * 44 = 1056)
  assert.ok(late.topPx + late.heightPx <= 24 * 44)
})

test('Backward compatibility — shiftsForGridDate and groupTimeGridShifts still work as expected', () => {
  const sampleShifts = [
    mockShift({ id: 's1', date: '2026-11-10', start_time: '09:00', end_time: '11:00' }),
    mockShift({ id: 's2', date: '2026-11-10', start_time: '23:00', end_time: '01:00' }),
  ]

  const day10 = shiftsForGridDate(sampleShifts, '2026-11-10')
  assert.equal(day10.length, 2)

  const day11 = shiftsForGridDate(sampleShifts, '2026-11-11')
  assert.equal(day11.length, 1)
  assert.equal(day11[0].continuation, true)
  assert.equal(day11[0].start_time, '00:00')
  assert.equal(day11[0].end_time, '01:00')

  const groups = groupTimeGridShifts([{ id: 'a', start_time: '09:00', end_time: '10:00' }])
  assert.equal(groups.length, 1)
  assert.equal(groups[0][0].id, 'a')
})
