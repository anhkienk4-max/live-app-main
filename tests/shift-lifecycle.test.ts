import { test, describe, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { shiftService } from '../lib/services/dataService'

const adminLifecycleMigration = readFileSync(
  'supabase/migrations/20260831120000_core_v1_shift_lifecycle_admin_guard.sql',
  'utf8',
)

describe('Shift Lifecycle UI State Flow', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  })

  test('A scheduled → preparing', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    assert.strictEqual(shift.status, 'scheduled')
    
    const updated = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    assert.ok(updated)
    assert.strictEqual(updated.status, 'preparing')
    assert.strictEqual(updated.version, shift.version + 1)
  })

  test('B preparing → live', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const prep = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const live = await shiftService.update(shift.id, { status: 'live', version: prep!.version })
    assert.strictEqual(live!.status, 'live')
  })

  test('C live → paused', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const live = await shiftService.update(shift.id, { status: 'live', version: shift.version })
    const paused = await shiftService.update(shift.id, { status: 'paused', version: live!.version })
    assert.strictEqual(paused!.status, 'paused')
  })

  test('D paused → live', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const paused = await shiftService.update(shift.id, { status: 'paused', version: shift.version })
    const live = await shiftService.update(shift.id, { status: 'live', version: paused!.version })
    assert.strictEqual(live!.status, 'live')
  })

  test('E live → completed', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const live = await shiftService.update(shift.id, { status: 'live', version: shift.version })
    const completed = await shiftService.update(shift.id, { status: 'completed', version: live!.version })
    assert.strictEqual(completed!.status, 'completed')
  })

  test('F paused → completed', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const paused = await shiftService.update(shift.id, { status: 'paused', version: shift.version })
    const completed = await shiftService.update(shift.id, { status: 'completed', version: paused!.version })
    assert.strictEqual(completed!.status, 'completed')
  })

  test('G scheduled → cancelled', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const cancelled = await shiftService.update(shift.id, { status: 'cancelled', version: shift.version })
    assert.strictEqual(cancelled!.status, 'cancelled')
  })

  test('H preparing → cancelled', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const prep = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const cancelled = await shiftService.update(shift.id, { status: 'cancelled', version: prep!.version })
    assert.strictEqual(cancelled!.status, 'cancelled')
  })

  test('N expected_version from current shift is passed', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const updated = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    assert.strictEqual(updated!.version, shift.version + 1)
  })

  test('O stale version returns STALE_WRITE', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    try {
      await shiftService.update(shift.id, { status: 'live', version: shift.version }) // Stale version
      assert.fail('Should have thrown an error')
    } catch (e: any) {
      assert.ok(e.message.includes('STALE_WRITE') || e.message.includes('Mismatched expected version'))
    }
  })

  test('new shift forced to scheduled', async () => {
    const created = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00', title: 'Test', status: 'live'
    } as any)
    assert.strictEqual(created.status, 'scheduled')
  })

  test('mock updates reject illegal lifecycle transitions', async () => {
    const completed = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as any)
    const live = await shiftService.update(completed.id, { status: 'live', version: completed.version })
    const done = await shiftService.update(completed.id, { status: 'completed', version: live!.version })
    await assert.rejects(
      () => shiftService.update(completed.id, { status: 'live', version: done!.version }),
      /SHIFT_STATUS_TRANSITION_NOT_ALLOWED/,
    )

    const cancelled = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-11', start_time: '10:00', end_time: '12:00',
    } as any)
    const removed = await shiftService.update(cancelled.id, { status: 'cancelled', version: cancelled.version })
    await assert.rejects(
      () => shiftService.update(cancelled.id, { status: 'preparing', version: removed!.version }),
      /SHIFT_STATUS_TRANSITION_NOT_ALLOWED/,
    )
  })

  test('normal Admin lifecycle uses the same canonical state machine as Leader', () => {
    assert.match(adminLifecycleMigration, /actor_permission in \('leader', 'admin'\)/i)
    assert.match(adminLifecycleMigration, /SHIFT_STATUS_TRANSITION_NOT_ALLOWED/i)
    assert.doesNotMatch(adminLifecycleMigration, /p_override|override_reason/i)
  })
})
