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

test('G2.1 — Concurrency > 3 displays visible streams and 1 overflow badge (+N ca khác) in Lane 2', () => {
  const shifts = [
    mockShift({ id: 's1', start_time: '14:00', end_time: '16:00' }),
    mockShift({ id: 's2', start_time: '14:05', end_time: '16:05' }),
    mockShift({ id: 's3', start_time: '14:10', end_time: '16:10' }),
    mockShift({ id: 's4', start_time: '14:15', end_time: '16:15' }),
    mockShift({ id: 's5', start_time: '14:20', end_time: '16:20' }),
  ]
  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 1)
  assert.equal(layout.renderedShifts.length, 2)
  assert.equal(layout.renderedShifts[0].lane, 0)
  assert.equal(layout.renderedShifts[1].lane, 1)

  assert.equal(layout.overflowBadges.length, 1)
  const badge = layout.overflowBadges[0]
  assert.equal(badge.lane, 2)
  assert.equal(badge.totalLanes, 3)
  assert.equal(badge.count, 3)
  assert.equal(badge.allClusterShifts.length, 5)
  assert.equal(badge.overflowShifts.length, 3)
  assert.ok(Math.abs(badge.leftPercent - 66.666) < 0.1)
})

test('G2-FIX-01 — 1-minute skewed intervals accurately detected via sweep-line', () => {
  const skewedShifts = [
    mockShift({ id: 'A', start_time: '08:01', end_time: '10:00' }),
    mockShift({ id: 'B', start_time: '08:02', end_time: '10:00' }),
    mockShift({ id: 'C', start_time: '08:03', end_time: '10:00' }),
    mockShift({ id: 'D', start_time: '08:04', end_time: '10:00' }),
  ]
  const layout = computeDayTimelineLayout(skewedShifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.renderedShifts.length, 2)
  assert.equal(layout.renderedShifts[0].id, 'A')
  assert.equal(layout.renderedShifts[0].lane, 0)
  assert.equal(layout.renderedShifts[1].id, 'B')
  assert.equal(layout.renderedShifts[1].lane, 1)

  assert.equal(layout.overflowBadges.length, 1)
  const badge = layout.overflowBadges[0]
  assert.equal(badge.lane, 2)
  assert.equal(badge.count, 2)
  assert.equal(badge.allClusterShifts.length, 4)
  assert.deepEqual(badge.allClusterShifts.map(s => s.id).sort(), ['A', 'B', 'C', 'D'])
})

test('G2-FIX-01 — Three 1-minute skewed shifts fit cleanly into 3 lanes without overflow', () => {
  const skewedShifts = [
    mockShift({ id: 'A', start_time: '08:01', end_time: '10:00' }),
    mockShift({ id: 'B', start_time: '08:02', end_time: '10:00' }),
    mockShift({ id: 'C', start_time: '08:03', end_time: '10:00' }),
  ]
  const layout = computeDayTimelineLayout(skewedShifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.renderedShifts.length, 3)
  assert.equal(layout.overflowBadges.length, 0)
  assert.deepEqual(layout.renderedShifts.map(s => s.lane).sort(), [0, 1, 2])
})

test('G2-FIX-01 — Boundary condition (end == start) is NOT counted as overlap', () => {
  const boundaryShifts = [
    mockShift({ id: 'A', start_time: '08:00', end_time: '10:00' }),
    mockShift({ id: 'B', start_time: '10:00', end_time: '12:00' }),
    mockShift({ id: 'C', start_time: '10:00', end_time: '12:00' }),
    mockShift({ id: 'D', start_time: '10:00', end_time: '12:00' }),
  ]
  const layout = computeDayTimelineLayout(boundaryShifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.renderedShifts.length, 4)
  assert.equal(layout.overflowBadges.length, 0)

  const a = layout.renderedShifts.find(s => s.id === 'A')
  const b = layout.renderedShifts.find(s => s.id === 'B')
  assert.ok(a && b)
  assert.equal(a.lane, 0)
  assert.equal(b.lane, 0)
})

test('G2-FIX-02 — Local overflow only: long shift with localized burst renders non-overloaded times individually', () => {
  const shifts = [
    mockShift({ id: 'L', start_time: '08:00', end_time: '18:00' }),
    mockShift({ id: 'S1', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'S2', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'S3', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'S4', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'M1', start_time: '13:00', end_time: '14:00' }),
    mockShift({ id: 'M2', start_time: '13:00', end_time: '14:00' }),
    mockShift({ id: 'E1', start_time: '16:00', end_time: '17:00' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 1)
  assert.equal(layout.overflowBadges.length, 1)
  assert.equal(layout.overflowBadges[0].timeLabel, '09:00 – 10:00')
  assert.equal(layout.overflowBadges[0].count, 3)
  assert.equal(layout.overflowBadges[0].allClusterShifts.length, 5)

  assert.equal(layout.renderedShifts.length, 5)

  const lShift = layout.renderedShifts.find(s => s.id === 'L')
  const s1Shift = layout.renderedShifts.find(s => s.id === 'S1')
  const m1Shift = layout.renderedShifts.find(s => s.id === 'M1')
  const m2Shift = layout.renderedShifts.find(s => s.id === 'M2')
  const e1Shift = layout.renderedShifts.find(s => s.id === 'E1')

  assert.ok(lShift && s1Shift && m1Shift && m2Shift && e1Shift)
  assert.equal(lShift.lane, 0)
  assert.equal(s1Shift.lane, 1)

  assert.equal(m1Shift.lane, 1)
  assert.equal(m2Shift.lane, 2)

  assert.equal(e1Shift.lane, 1)
})

test('G2-FIX-02 — Badges never overlap each other when multiple bursts occur', () => {
  const shifts = [
    mockShift({ id: 'w1-1', start_time: '08:00', end_time: '09:30' }),
    mockShift({ id: 'w1-2', start_time: '08:00', end_time: '09:30' }),
    mockShift({ id: 'w1-3', start_time: '08:00', end_time: '09:30' }),
    mockShift({ id: 'w1-4', start_time: '08:00', end_time: '09:30' }),

    mockShift({ id: 'w2-1', start_time: '14:00', end_time: '15:30' }),
    mockShift({ id: 'w2-2', start_time: '14:00', end_time: '15:30' }),
    mockShift({ id: 'w2-3', start_time: '14:00', end_time: '15:30' }),
    mockShift({ id: 'w2-4', start_time: '14:00', end_time: '15:30' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.overflowBadges.length, 2)
  const b1 = layout.overflowBadges[0]
  const b2 = layout.overflowBadges[1]

  assert.ok(b1.topPx + b1.heightPx <= b2.topPx)
})

test('G2.1 & G2.2 — Distinct time slots form independent clusters and never merge into a single giant block', () => {
  const shifts = [
    mockShift({ id: 'm1', start_time: '08:00', end_time: '10:00' }),
    mockShift({ id: 'm2', start_time: '08:30', end_time: '10:30' }),

    mockShift({ id: 'a1', start_time: '13:00', end_time: '15:00' }),
    mockShift({ id: 'a2', start_time: '13:15', end_time: '15:15' }),
    mockShift({ id: 'a3', start_time: '13:30', end_time: '15:30' }),

    mockShift({ id: 'e1', start_time: '19:00', end_time: '21:00' }),
  ]
  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 3)
  assert.equal(layout.renderedShifts.length, 6)
  assert.equal(layout.overflowBadges.length, 0)

  const morningShifts = layout.renderedShifts.filter(s => s.start_time.startsWith('08'))
  assert.equal(morningShifts.length, 2)
  assert.equal(morningShifts[0].totalLanes, 2)
  assert.equal(morningShifts[1].totalLanes, 2)

  const afternoonShifts = layout.renderedShifts.filter(s => s.start_time.startsWith('13'))
  assert.equal(afternoonShifts.length, 3)
  assert.equal(afternoonShifts[0].totalLanes, 3)
  assert.equal(afternoonShifts[1].totalLanes, 3)
  assert.equal(afternoonShifts[2].totalLanes, 3)

  const eveningShift = layout.renderedShifts.find(s => s.id === 'e1')
  assert.ok(eveningShift)
  assert.equal(eveningShift.totalLanes, 1)
  assert.equal(eveningShift.widthPercent, 100)
})

test('G2.2 — Dense 37-shift day (Owner UAT scenario Nov 10-11) is partitioned into separate time clusters', () => {
  const shifts: Shift[] = []

  for (let i = 1; i <= 8; i++) {
    shifts.push(mockShift({ id: `w1-${i}`, start_time: '07:30', end_time: '09:30' }))
  }

  for (let i = 1; i <= 10; i++) {
    shifts.push(mockShift({ id: `w2-${i}`, start_time: '12:00', end_time: '13:45' }))
  }

  for (let i = 1; i <= 12; i++) {
    shifts.push(mockShift({ id: `w3-${i}`, start_time: '16:00', end_time: '18:00' }))
  }

  for (let i = 1; i <= 7; i++) {
    shifts.push(mockShift({ id: `w4-${i}`, start_time: '20:15', end_time: '22:15' }))
  }

  assert.equal(shifts.length, 37)

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 4)
  assert.equal(layout.renderedShifts.length, 8)
  assert.equal(layout.overflowBadges.length, 4)

  const totalRepresented = layout.renderedShifts.length + layout.overflowBadges.reduce((sum, b) => sum + b.count, 0)
  assert.equal(totalRepresented, 37)
})

test('G2.1 — Short shifts nested alongside long shifts reuse available lanes cleanly', () => {
  const shifts = [
    mockShift({ id: 'long', start_time: '08:00', end_time: '12:00' }),
    mockShift({ id: 'short1', start_time: '08:00', end_time: '09:30' }),
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
  assert.equal(short1.lane, 1)
  assert.equal(short2.lane, 1)
  assert.equal(longShift.totalLanes, 2)
})

test('G2.2 — Overnight continuation and midnight-boundary shifts bound properly without displacement', () => {
  const shifts = [
    mockShift({ id: 'overnight-cont', start_time: '00:00', end_time: '02:00', ...({ continuation: true } as object) }),
    mockShift({ id: 'late-night', start_time: '22:00', end_time: '24:00' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.clusterCount, 2)
  const cont = layout.renderedShifts.find(s => s.id === 'overnight-cont')
  const late = layout.renderedShifts.find(s => s.id === 'late-night')

  assert.ok(cont && late)
  assert.equal(cont.topPx, 0)
  assert.equal(cont.heightPx, 2 * 44)

  assert.equal(late.topPx, 22 * 44)
  assert.equal(late.heightPx, 2 * 44)
  assert.ok(late.topPx + late.heightPx <= 24 * 44)
})

test('G2-FIX-03 — Overnight shift 23:45–01:45 crosses midnight correctly without boundary overflow', () => {
  const rawShift = mockShift({ id: 'cross-mid', date: '2026-11-10', start_time: '23:45', end_time: '01:45' })
  const day10Shifts = shiftsForGridDate([rawShift], '2026-11-10')
  const day11Shifts = shiftsForGridDate([rawShift], '2026-11-11')

  assert.equal(day10Shifts.length, 1)
  assert.equal(day10Shifts[0].end_time, '24:00')
  assert.equal(day10Shifts[0].continuation, false)

  const day10Layout = computeDayTimelineLayout(day10Shifts, { hourHeight: 44, maxLanes: 3 })
  assert.equal(day10Layout.renderedShifts.length, 1)
  const day10Rendered = day10Layout.renderedShifts[0]
  assert.ok(day10Rendered.topPx + day10Rendered.heightPx <= 24 * 44)

  assert.equal(day11Shifts.length, 1)
  assert.equal(day11Shifts[0].continuation, true)
  assert.equal(day11Shifts[0].start_time, '00:00')
  assert.equal(day11Shifts[0].end_time, '01:45')

  const day11Layout = computeDayTimelineLayout(day11Shifts, { hourHeight: 44, maxLanes: 3 })
  assert.equal(day11Layout.renderedShifts.length, 1)
  const day11Rendered = day11Layout.renderedShifts[0]
  assert.equal(day11Rendered.topPx, 0)
  assert.equal(day11Rendered.heightPx, Math.round((105 / 60) * 44))
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
