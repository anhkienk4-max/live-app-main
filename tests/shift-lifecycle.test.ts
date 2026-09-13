import { test, describe, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { shiftService } from '../lib/services/dataService'
import { deriveAutomaticShiftStatus, resolveShiftDateTime } from '../lib/utils/shiftUtils'

const adminLifecycleMigration = readFileSync(
  'supabase/migrations/20260831120000_core_v1_shift_lifecycle_admin_guard.sql',
  'utf8',
)
const statusModeMigration = readFileSync(
  'supabase/migrations/20260913120000_shift_status_mode_and_auto_completion.sql',
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
    } as Parameters<typeof shiftService.create>[0])
    assert.strictEqual(shift.status, 'scheduled')
    
    const updated = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    assert.ok(updated)
    assert.strictEqual(updated.status, 'preparing')
    assert.strictEqual(updated.version, shift.version + 1)
  })

  test('B preparing → live', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const prep = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const live = await shiftService.update(shift.id, { status: 'live', version: prep!.version })
    assert.strictEqual(live!.status, 'live')
  })

  test('C live → paused', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const prep = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const live = await shiftService.update(shift.id, { status: 'live', version: prep!.version })
    const paused = await shiftService.update(shift.id, { status: 'paused', version: live!.version })
    assert.strictEqual(paused!.status, 'paused')
  })

  test('D paused → live', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const prep = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const paused = await shiftService.update(shift.id, { status: 'paused', version: prep!.version })
    const live = await shiftService.update(shift.id, { status: 'live', version: paused!.version })
    assert.strictEqual(live!.status, 'live')
  })

  test('E live → completed', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const prep = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const live = await shiftService.update(shift.id, { status: 'live', version: prep!.version })
    const completed = await shiftService.update(shift.id, { status: 'completed', version: live!.version })
    assert.strictEqual(completed!.status, 'completed')
  })

  test('F paused → completed', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const prep = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const paused = await shiftService.update(shift.id, { status: 'paused', version: prep!.version })
    const completed = await shiftService.update(shift.id, { status: 'completed', version: paused!.version })
    assert.strictEqual(completed!.status, 'completed')
  })

  test('G scheduled → cancelled', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const cancelled = await shiftService.update(shift.id, { status: 'cancelled', version: shift.version })
    assert.strictEqual(cancelled!.status, 'cancelled')
  })

  test('H preparing → cancelled', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const prep = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const cancelled = await shiftService.update(shift.id, { status: 'cancelled', version: prep!.version })
    assert.strictEqual(cancelled!.status, 'cancelled')
  })

  test('N expected_version from current shift is passed', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const updated = await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    assert.strictEqual(updated!.version, shift.version + 1)
  })

  test('O stale version returns STALE_WRITE', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    try {
      await shiftService.update(shift.id, { status: 'live', version: shift.version }) // Stale version
      assert.fail('Should have thrown an error')
    } catch (error: unknown) {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes('STALE_WRITE') || error.message.includes('Mismatched expected version'))
    }
  })

  test('new shift forced to scheduled', async () => {
    const created = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00', title: 'Test', status: 'live'
    } as Parameters<typeof shiftService.create>[0])
    assert.strictEqual(created.status, 'scheduled')
    assert.strictEqual(created.status_mode, 'auto')
  })

  test('automatic timeline uses preparation, start, and end boundaries', () => {
    const shift = {
      date: '2026-10-10', start_time: '10:00', end_time: '12:00', timezone: 'Asia/Ho_Chi_Minh',
      registration_cutoff_at: '2026-10-10T02:00:00.000Z',
    } as Parameters<typeof deriveAutomaticShiftStatus>[0]
    assert.strictEqual(deriveAutomaticShiftStatus(shift, new Date('2026-10-10T01:59:59.999Z')), 'scheduled')
    assert.strictEqual(deriveAutomaticShiftStatus(shift, new Date('2026-10-10T02:00:00.000Z')), 'preparing')
    assert.strictEqual(deriveAutomaticShiftStatus(shift, new Date('2026-10-10T03:00:00.000Z')), 'live')
    assert.strictEqual(deriveAutomaticShiftStatus(shift, new Date('2026-10-10T05:00:00.000Z')), 'completed')
  })

  test('overnight automatic completion uses the canonical business-time end instant', () => {
    const shift = {
      date: '2026-10-10', start_time: '23:00', end_time: '01:00', timezone: 'Asia/Ho_Chi_Minh',
    } as Parameters<typeof deriveAutomaticShiftStatus>[0]
    const resolved = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
    assert.ok(resolved?.valid)
    assert.strictEqual(resolved?.crossesMidnight, true)
    assert.strictEqual(resolved?.endDate, '2026-10-11')
    assert.strictEqual(deriveAutomaticShiftStatus(shift, new Date(resolved!.startAt.getTime() - 7 * 60 * 60 * 1000)), 'scheduled')
    assert.strictEqual(deriveAutomaticShiftStatus(shift, resolved!.startAt), 'live')
    assert.strictEqual(deriveAutomaticShiftStatus(shift, resolved!.endAt), 'completed')
    assert.strictEqual(deriveAutomaticShiftStatus(shift, new Date(resolved!.endAt.getTime() + 1)), 'completed')
  })

  test('automatic completion can be manually corrected and returned to auto', async () => {
    const shift = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-01-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const completed = await shiftService.getById(shift.id)
    assert.strictEqual(completed?.status, 'completed')
    assert.strictEqual(completed?.status_mode, 'auto')
    const live = await shiftService.update(shift.id, { status: 'live', version: completed?.version })
    assert.strictEqual(live?.status, 'live')
    assert.strictEqual(live?.status_mode, 'manual')
    const persistedManual = await shiftService.getById(shift.id)
    assert.strictEqual(persistedManual?.status, 'live')
    assert.strictEqual(persistedManual?.status_mode, 'manual')
    const automatic = await shiftService.returnToAutomatic(shift.id, undefined, persistedManual?.version)
    assert.strictEqual(automatic?.status, 'completed')
    assert.strictEqual(automatic?.status_mode, 'auto')
  })

  test('cancelled and manual completed shifts are not time-overwritten', async () => {
    const cancelled = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-01-11', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const removed = await shiftService.update(cancelled.id, { status: 'cancelled', version: cancelled.version })
    const rereadCancelled = await shiftService.getById(cancelled.id)
    assert.strictEqual(rereadCancelled?.status, removed?.status)
    assert.strictEqual(rereadCancelled?.status_mode, 'manual')

    const manualCompleted = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-11', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const prep = await shiftService.update(manualCompleted.id, { status: 'preparing', version: manualCompleted.version })
    const live = await shiftService.update(manualCompleted.id, { status: 'live', version: prep!.version })
    const done = await shiftService.update(manualCompleted.id, { status: 'completed', version: live!.version })
    assert.strictEqual(done?.status_mode, 'manual')
    assert.strictEqual((await shiftService.getById(manualCompleted.id))?.status, 'completed')
  })

  test('mock updates reject illegal lifecycle transitions', async () => {
    const completed = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-10', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const prep = await shiftService.update(completed.id, { status: 'preparing', version: completed.version })
    const live = await shiftService.update(completed.id, { status: 'live', version: prep!.version })
    const done = await shiftService.update(completed.id, { status: 'completed', version: live!.version })
    await assert.rejects(
      () => shiftService.update(completed.id, { status: 'live', version: done!.version }),
      /SHIFT_STATUS_TRANSITION_NOT_ALLOWED/,
    )
    await assert.rejects(
      () => shiftService.update(completed.id, { status: 'preparing', version: done!.version }),
      /SHIFT_STATUS_TRANSITION_NOT_ALLOWED/,
    )

    const cancelled = await shiftService.create({
      brand_id: 'b1', platform_id: 'p1', date: '2026-10-11', start_time: '10:00', end_time: '12:00',
    } as Parameters<typeof shiftService.create>[0])
    const removed = await shiftService.update(cancelled.id, { status: 'cancelled', version: cancelled.version })
    await assert.rejects(
      () => shiftService.update(cancelled.id, { status: 'preparing', version: removed!.version }),
      /SHIFT_STATUS_TRANSITION_NOT_ALLOWED/,
    )
    await assert.rejects(
      () => shiftService.update(cancelled.id, { status: 'live', version: removed!.version }),
      /SHIFT_STATUS_TRANSITION_NOT_ALLOWED/,
    )
  })

  test('normal Admin lifecycle uses the same canonical state machine as Leader', () => {
    assert.match(adminLifecycleMigration, /actor_permission in \('leader', 'admin'\)/i)
    assert.match(adminLifecycleMigration, /SHIFT_STATUS_TRANSITION_NOT_ALLOWED/i)
    assert.doesNotMatch(adminLifecycleMigration, /p_override|override_reason/i)
  })

  test('database status mode contract is guarded and auditable', () => {
    assert.match(statusModeMigration, /status_mode text/i)
    assert.match(statusModeMigration, /when status in \('paused', 'completed', 'cancelled'\) then 'manual'[\s\S]*else 'auto'/i)
    assert.match(statusModeMigration, /status_mode set default 'auto'/i)
    assert.match(statusModeMigration, /status_mode set not null/i)
    assert.match(statusModeMigration, /check \(status_mode in \('auto', 'manual'\)\)/i)
    assert.match(statusModeMigration, /refresh_automatic_shift_statuses/i)
    assert.match(statusModeMigration, /return_shift_to_automatic/i)
    assert.match(statusModeMigration, /create or replace function public\.update_shift\([\s\S]*p_confirm_impact boolean,[\s\S]*p_expected_version integer/i)
    assert.match(statusModeMigration, /p_expected_version is null or p_expected_version <> current_shift\.version/i)
    assert.match(statusModeMigration, /source_value.*current_setting\('app\.audit_source'/i)
    assert.match(statusModeMigration, /after_row \? 'status_mode'[\s\S]*jsonb_build_object\('status_mode'/i)
    assert.match(statusModeMigration, /existing_shift\.status_mode = 'auto'/i)
    assert.match(statusModeMigration, /and shift\.status_mode = 'auto'[\s\S]*and shift\.version = desired\.version/i)
  })
})
