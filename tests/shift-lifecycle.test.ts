import { test, describe, afterEach } from 'node:test'
import * as assert from 'node:assert'

import { shiftService } from '../lib/services/dataService'

describe('Shift Lifecycle', () => {
  test('New shifts default to scheduled and ignore arbitrary status', async () => {
    // This validates that any attempt to create a shift bypassing the UI
    // (or if the UI sends a bogus status) correctly forces it to 'scheduled'.
    const created = await shiftService.create({
      brand_id: 'b1',
      platform_id: 'p1',
      date: '2026-10-10',
      start_time: '10:00',
      end_time: '12:00',
      title: 'Test',
      status: 'live' // Attempting to bypass logic
    } as any)
    
    assert.strictEqual(created.status, 'scheduled')
  })
})
