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

test('G2-EDGE-01 — Minimum visual duration: A (08:00–08:01) and B (08:01–08:02) never overlap in the same lane', () => {
  const shifts = [
    mockShift({ id: 'A', start_time: '08:00', end_time: '08:01' }),
    mockShift({ id: 'B', start_time: '08:01', end_time: '08:02' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  assert.equal(layout.renderedShifts.length, 2)
  assert.equal(layout.overflowBadges.length, 0)

  const a = layout.renderedShifts.find(s => s.id === 'A')
  const b = layout.renderedShifts.find(s => s.id === 'B')
  assert.ok(a && b)

  // Must be in different lanes to avoid visual collision!
  assert.notEqual(a.lane, b.lane)
  assert.equal(layout.renderedShifts[0].totalLanes, 2)
  assert.equal(layout.renderedShifts[1].totalLanes, 2)
  assert.equal(layout.renderedShifts[0].widthPercent, 50)
  assert.equal(layout.renderedShifts[1].widthPercent, 50)
})

test('G2-EDGE-02 — Overflow gap: two bursts separated by 10, 20, 29, 30 min render gap shifts individually and badges never collide', () => {
  for (const gap of [10, 20, 29, 30]) {
    const burst1End = 600 // 10:00
    const burst2Start = burst1End + gap
    const burst2End = burst2Start + 60

    const b2StartStr = `${String(Math.floor(burst2Start / 60)).padStart(2, '0')}:${String(burst2Start % 60).padStart(2, '0')}`
    const b2EndStr = `${String(Math.floor(burst2End / 60)).padStart(2, '0')}:${String(burst2End % 60).padStart(2, '0')}`

    const shifts = [
      // Burst 1: 4 shifts (09:00 - 10:00)
      mockShift({ id: `b1-1-${gap}`, start_time: '09:00', end_time: '10:00' }),
      mockShift({ id: `b1-2-${gap}`, start_time: '09:00', end_time: '10:00' }),
      mockShift({ id: `b1-3-${gap}`, start_time: '09:00', end_time: '10:00' }),
      mockShift({ id: `b1-4-${gap}`, start_time: '09:00', end_time: '10:00' }),

      // Shift running in the gap between bursts
      mockShift({ id: `gap-shift-${gap}`, start_time: '10:00', end_time: b2StartStr }),

      // Burst 2: 4 shifts
      mockShift({ id: `b2-1-${gap}`, start_time: b2StartStr, end_time: b2EndStr }),
      mockShift({ id: `b2-2-${gap}`, start_time: b2StartStr, end_time: b2EndStr }),
      mockShift({ id: `b2-3-${gap}`, start_time: b2StartStr, end_time: b2EndStr }),
      mockShift({ id: `b2-4-${gap}`, start_time: b2StartStr, end_time: b2EndStr }),
    ]

    const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

    // Must have 2 distinct badges, NOT 1 giant merged badge
    assert.equal(layout.overflowBadges.length, 2, `Failed for gap ${gap}`)

    // The gap shift must be rendered individually
    const gapShiftRendered = layout.renderedShifts.find(s => s.id === `gap-shift-${gap}`)
    assert.ok(gapShiftRendered, `Gap shift not rendered for gap ${gap}`)

    // Badges must never visually collide in Lane 2
    const [b1, b2] = layout.overflowBadges
    assert.ok(b1.topPx + b1.heightPx <= b2.topPx, `Badge collision detected for gap ${gap}: b1 bottom=${b1.topPx + b1.heightPx}, b2 top=${b2.topPx}`)
  }
})

test('G2-EDGE-03 — Long shift (08:00–18:00) across two independent overflow bursts: accurate counts, popups, and gap visibility', () => {
  const shifts = [
    // Long shift 08:00 - 18:00
    mockShift({ id: 'L', start_time: '08:00', end_time: '18:00' }),

    // Burst 1: 09:00 - 10:00 (4 short shifts)
    mockShift({ id: 'a1', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'a2', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'a3', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'a4', start_time: '09:00', end_time: '10:00' }),

    // Gap 1: 11:00 - 12:00 (1 shift), 13:00 - 14:00 (2 shifts)
    mockShift({ id: 'g1', start_time: '11:00', end_time: '12:00' }),
    mockShift({ id: 'g2', start_time: '13:00', end_time: '14:00' }),
    mockShift({ id: 'g3', start_time: '13:00', end_time: '14:00' }),

    // Burst 2: 15:00 - 16:00 (4 short shifts)
    mockShift({ id: 'b1', start_time: '15:00', end_time: '16:00' }),
    mockShift({ id: 'b2', start_time: '15:00', end_time: '16:00' }),
    mockShift({ id: 'b3', start_time: '15:00', end_time: '16:00' }),
    mockShift({ id: 'b4', start_time: '15:00', end_time: '16:00' }),

    // Gap 2: 16:30 - 17:30 (1 shift)
    mockShift({ id: 'g4', start_time: '16:30', end_time: '17:30' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  // 1. Two separate badges
  assert.equal(layout.overflowBadges.length, 2)
  const [b1, b2] = layout.overflowBadges

  assert.equal(b1.timeLabel, '09:00 – 10:00')
  assert.equal(b1.count, 3)
  assert.deepEqual(b1.allClusterShifts.map(s => s.id).sort(), ['L', 'a1', 'a2', 'a3', 'a4'])

  assert.equal(b2.timeLabel, '15:00 – 16:00')
  assert.equal(b2.count, 3)
  assert.deepEqual(b2.allClusterShifts.map(s => s.id).sort(), ['L', 'b1', 'b2', 'b3', 'b4'])

  // 2. Exact preservation: total rendered + hidden equals 13
  const totalCount = layout.renderedShifts.length + layout.overflowBadges.reduce((sum, b) => sum + b.count, 0)
  assert.equal(totalCount, 13)

  // 3. Gap shifts are all individually rendered
  const g1 = layout.renderedShifts.find(s => s.id === 'g1')
  const g2 = layout.renderedShifts.find(s => s.id === 'g2')
  const g3 = layout.renderedShifts.find(s => s.id === 'g3')
  const g4 = layout.renderedShifts.find(s => s.id === 'g4')
  assert.ok(g1 && g2 && g3 && g4)
  assert.equal(g3.lane, 2) // Lane 2 was available during Gap 1!
})

test('G2-EDGE-04 — UI DOM geometry verification: no vertical overlap between cards in the same lane or with badges in Lane 2', () => {
  const shifts = [
    mockShift({ id: 'L', start_time: '08:00', end_time: '18:00' }),
    mockShift({ id: 'a1', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'a2', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'a3', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'a4', start_time: '09:00', end_time: '10:00' }),
    mockShift({ id: 'g1', start_time: '11:00', end_time: '12:00' }),
    mockShift({ id: 'g2', start_time: '13:00', end_time: '14:00' }),
    mockShift({ id: 'g3', start_time: '13:00', end_time: '14:00' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  // Check 1: Cards in the same lane never overlap vertically in DOM pixels
  for (let l = 0; l < 3; l++) {
    const laneShifts = layout.renderedShifts.filter(s => s.lane === l)
    for (let i = 0; i < laneShifts.length; i++) {
      for (let j = i + 1; j < laneShifts.length; j++) {
        const s1 = laneShifts[i]
        const s2 = laneShifts[j]
        const overlaps = Math.max(s1.topPx, s2.topPx) < Math.min(s1.topPx + s1.heightPx, s2.topPx + s2.heightPx)
        assert.equal(overlaps, false, `DOM pixel collision in Lane ${l} between ${s1.id} and ${s2.id}`)
      }
    }
  }

  // Check 2: In Lane 2, no rendered shift collides with any overflow badge
  const lane2Shifts = layout.renderedShifts.filter(s => s.lane === 2)
  for (const shift of lane2Shifts) {
    for (const badge of layout.overflowBadges) {
      const overlaps = Math.max(shift.topPx, badge.topPx) < Math.min(shift.topPx + shift.heightPx, badge.topPx + badge.heightPx)
      assert.equal(overlaps, false, `DOM pixel collision in Lane 2 between shift ${shift.id} and badge ${badge.id}`)
    }
  }

  // Check 3: All cards and badges are strictly bounded within [0, 24 * 44 = 1056px]
  for (const s of layout.renderedShifts) {
    assert.ok(s.topPx >= 0 && s.topPx + s.heightPx <= 1056)
  }
  for (const b of layout.overflowBadges) {
    assert.ok(b.topPx >= 0 && b.topPx + b.heightPx <= 1056)
  }
})

test('G2-DENSITY-01 — Four consecutive 1-minute shifts: zero DOM collision, localized overflow in Lane 2, complete popup list', () => {
  const shifts = [
    mockShift({ id: 'A', start_time: '08:00', end_time: '08:01' }),
    mockShift({ id: 'B', start_time: '08:01', end_time: '08:02' }),
    mockShift({ id: 'C', start_time: '08:02', end_time: '08:03' }),
    mockShift({ id: 'D', start_time: '08:03', end_time: '08:04' }),
  ]

  const layout = computeDayTimelineLayout(shifts, { hourHeight: 44, maxLanes: 3 })

  // 1. Two visible streams in Lane 0 and Lane 1
  assert.equal(layout.renderedShifts.length, 2)
  const a = layout.renderedShifts.find(s => s.id === 'A')
  const b = layout.renderedShifts.find(s => s.id === 'B')
  assert.ok(a && b)
  assert.equal(a.lane, 0)
  assert.equal(b.lane, 1)

  // 2. One overflow badge in Lane 2 for C and D
  assert.equal(layout.overflowBadges.length, 1)
  const badge = layout.overflowBadges[0]
  assert.equal(badge.lane, 2)
  assert.equal(badge.count, 2)
  assert.deepEqual(badge.overflowShifts.map(s => s.id).sort(), ['C', 'D'])

  // 3. Popup contains all 4 shifts in this visual burst
  assert.equal(badge.allClusterShifts.length, 4)
  assert.deepEqual(badge.allClusterShifts.map(s => s.id).sort(), ['A', 'B', 'C', 'D'])

  // 4. Exact preservation: rendered + overflow = 4
  const totalCount = layout.renderedShifts.length + layout.overflowBadges.reduce((sum, bg) => sum + bg.count, 0)
  assert.equal(totalCount, 4)

  // 5. Zero DOM collision in any lane
  for (let l = 0; l < 3; l++) {
    const laneShifts = layout.renderedShifts.filter(s => s.lane === l)
    for (let i = 0; i < laneShifts.length; i++) {
      for (let j = i + 1; j < laneShifts.length; j++) {
        const s1 = laneShifts[i]
        const s2 = laneShifts[j]
        const overlaps = Math.max(s1.topPx, s2.topPx) < Math.min(s1.topPx + s1.heightPx, s2.topPx + s2.heightPx)
        assert.equal(overlaps, false, `DOM collision in Lane ${l} between ${s1.id} and ${s2.id}`)
      }
    }
  }
  const lane2Shifts = layout.renderedShifts.filter(s => s.lane === 2)
  for (const s of lane2Shifts) {
    const overlaps = Math.max(s.topPx, badge.topPx) < Math.min(s.topPx + s.heightPx, badge.topPx + badge.heightPx)
    assert.equal(overlaps, false, `DOM collision in Lane 2 between ${s.id} and badge`)
  }
})

test('G2-DENSITY-02 — 5 and 10 consecutive short shifts: zero collision, all shifts preserved in popup', () => {
  // Test 5 consecutive shifts
  const fiveShifts = [
    mockShift({ id: 's1', start_time: '09:00', end_time: '09:01' }),
    mockShift({ id: 's2', start_time: '09:01', end_time: '09:02' }),
    mockShift({ id: 's3', start_time: '09:02', end_time: '09:03' }),
    mockShift({ id: 's4', start_time: '09:03', end_time: '09:04' }),
    mockShift({ id: 's5', start_time: '09:04', end_time: '09:05' }),
  ]
  const layout5 = computeDayTimelineLayout(fiveShifts, { hourHeight: 44, maxLanes: 3 })
  assert.equal(layout5.renderedShifts.length, 2)
  assert.equal(layout5.overflowBadges.length, 1)
  assert.equal(layout5.overflowBadges[0].count, 3)
  assert.equal(layout5.overflowBadges[0].allClusterShifts.length, 5)
  assert.equal(layout5.renderedShifts.length + layout5.overflowBadges[0].count, 5)

  // Test 10 consecutive shifts
  const tenShifts = Array.from({ length: 10 }, (_, i) => {
    const mins = String(i).padStart(2, '0')
    const nextMins = String(i + 1).padStart(2, '0')
    return mockShift({ id: `ten-${i}`, start_time: `10:${mins}`, end_time: `10:${nextMins}` })
  })
  const layout10 = computeDayTimelineLayout(tenShifts, { hourHeight: 44, maxLanes: 3 })
  assert.equal(layout10.renderedShifts.length, 2)
  assert.equal(layout10.overflowBadges.length, 1)
  assert.equal(layout10.overflowBadges[0].count, 8)
  assert.equal(layout10.overflowBadges[0].allClusterShifts.length, 10)
  assert.equal(layout10.renderedShifts.length + layout10.overflowBadges[0].count, 10)
})

test('G2-DENSITY-03 — Comprehensive Property-based Test: 50 randomized shift scenarios guarantee 0 DOM collisions and 100% preservation', () => {
  // Simple deterministic PRNG for reproducible test
  let seed = 42
  function rnd(min: number, max: number): number {
    seed = (seed * 9301 + 49297) % 233280
    return min + Math.floor((seed / 233280) * (max - min + 1))
  }

  for (let trial = 0; trial < 50; trial++) {
    const shiftCount = rnd(1, 25)
    const testShifts: Shift[] = []

    for (let i = 0; i < shiftCount; i++) {
      const startH = rnd(6, 21)
      const startM = rnd(0, 58)
      const duration = rnd(1, 180)
      const endTotal = startH * 60 + startM + duration
      const boundedEnd = Math.min(endTotal, 1440)
      const endH = Math.floor(boundedEnd / 60)
      const endM = boundedEnd % 60

      const start_time = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
      const end_time = boundedEnd === 1440 ? '24:00' : `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

      testShifts.push(mockShift({ id: `rnd-${trial}-${i}`, start_time, end_time }))
    }

    const layout = computeDayTimelineLayout(testShifts, { hourHeight: 44, maxLanes: 3 })

    // Invariant 1: Total represented shifts === input shifts (no loss, no duplication)
    const totalRepresented = layout.renderedShifts.length + layout.overflowBadges.reduce((s, b) => s + b.count, 0)
    assert.equal(totalRepresented, testShifts.length, `Trial ${trial}: Shift count mismatch: got ${totalRepresented}, expected ${testShifts.length}`)

    // Invariant 2: Maximum 3 lanes at all times
    for (const s of layout.renderedShifts) {
      assert.ok(s.lane >= 0 && s.lane < 3, `Trial ${trial}: Invalid lane ${s.lane}`)
      assert.ok(s.totalLanes >= 1 && s.totalLanes <= 3, `Trial ${trial}: Invalid totalLanes ${s.totalLanes}`)
    }
    for (const b of layout.overflowBadges) {
      assert.equal(b.lane, 2, `Trial ${trial}: Overflow badge must be in Lane 2`)
      assert.equal(b.totalLanes, 3, `Trial ${trial}: Badge totalLanes must be 3`)
    }

    // Invariant 3: Zero DOM collisions between rendered cards in ANY lane
    for (let l = 0; l < 3; l++) {
      const laneShifts = layout.renderedShifts.filter(s => s.lane === l)
      for (let i = 0; i < laneShifts.length; i++) {
        for (let j = i + 1; j < laneShifts.length; j++) {
          const s1 = laneShifts[i]
          const s2 = laneShifts[j]
          const overlaps = Math.max(s1.topPx, s2.topPx) < Math.min(s1.topPx + s1.heightPx, s2.topPx + s2.heightPx)
          assert.equal(overlaps, false, `Trial ${trial}: DOM collision in lane ${l} between ${s1.id} and ${s2.id}`)
        }
      }
    }

    // Invariant 4: Zero DOM collisions in Lane 2 between rendered shifts and badges
    const lane2Shifts = layout.renderedShifts.filter(s => s.lane === 2)
    for (const s of lane2Shifts) {
      for (const b of layout.overflowBadges) {
        const overlaps = Math.max(s.topPx, b.topPx) < Math.min(s.topPx + s.heightPx, b.topPx + b.heightPx)
        assert.equal(overlaps, false, `Trial ${trial}: DOM collision in Lane 2 between shift ${s.id} and badge ${b.id}`)
      }
    }

    // Invariant 5: Zero DOM collisions between badges themselves in Lane 2
    for (let i = 0; i < layout.overflowBadges.length; i++) {
      for (let j = i + 1; j < layout.overflowBadges.length; j++) {
        const b1 = layout.overflowBadges[i]
        const b2 = layout.overflowBadges[j]
        const overlaps = Math.max(b1.topPx, b2.topPx) < Math.min(b1.topPx + b1.heightPx, b2.topPx + b2.heightPx)
        assert.equal(overlaps, false, `Trial ${trial}: Badge collision in Lane 2 between ${b1.id} and ${b2.id}`)
      }
    }

    // Invariant 6: All overflow shifts belonging to a badge are in the badge's popup list
    for (const b of layout.overflowBadges) {
      for (const ov of b.overflowShifts) {
        const found = b.allClusterShifts.some(c => c.id === ov.id)
        assert.ok(found, `Trial ${trial}: Overflow shift ${ov.id} missing from allClusterShifts in badge ${b.id}`)
      }
    }
  }
})
