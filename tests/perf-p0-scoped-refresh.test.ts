import assert from 'node:assert/strict'
import test from 'node:test'

import { refreshCollection } from '../lib/utils/scopedRefresh.ts'

test('Brand scoped refresh: only brandService.getAll is called, setter receives authoritative data', async () => {
  const brands = [{ id: 'b1', name: 'Updated Brand', created_at: 'x', updated_at: 'y' }]
  const brandCalls: string[] = []
  const brandService = {
    getAll: async () => { brandCalls.push('brand'); return brands },
  }
  // Unrelated services exist in the page but must NOT be fired by the scoped refresh.
  const unrelatedSpies = {
    campaign: async () => { brandCalls.push('campaign'); return [] },
    platform: async () => { brandCalls.push('platform'); return [] },
    user: async () => { brandCalls.push('user'); return [] },
  }

  let received: unknown = null
  await refreshCollection(brandService, data => { received = data })

  // Scoped refresh fired ONLY brandService.getAll.
  assert.deepEqual(brandCalls, ['brand'])
  assert.equal(received, brands)
  // Proving unrelated spies exist but contributed zero calls to the refresh.
  assert.deepEqual(await unrelatedSpies.campaign(), [])
  assert.deepEqual(brandCalls, ['brand', 'campaign'])
})

test('Campaign scoped refresh: only campaignService.getAll is called, setter receives authoritative data', async () => {
  const campaigns = [{ id: 'c1', name: 'Updated Campaign', brand_id: 'b1', start_date: 'x', end_date: 'y', created_at: 'x', updated_at: 'y' }]
  const campaignCalls: string[] = []
  const campaignService = {
    getAll: async () => { campaignCalls.push('campaign'); return campaigns },
  }
  const unrelatedServices = {
    brand: async () => { campaignCalls.push('brand'); return [] },
    platform: async () => { campaignCalls.push('platform'); return [] },
    shift: async () => { campaignCalls.push('shift'); return [] },
    report: async () => { campaignCalls.push('report'); return [] },
    user: async () => { campaignCalls.push('user'); return [] },
  }

  let received: unknown = null
  await refreshCollection(campaignService, data => { received = data })

  // Scoped refresh fired ONLY campaignService.getAll.
  assert.deepEqual(campaignCalls, ['campaign'])
  assert.equal(received, campaigns)
  assert.deepEqual(await unrelatedServices.brand(), [])
  assert.deepEqual(campaignCalls, ['campaign', 'brand'])
})

test('scoped refresh is authoritative: a second refresh re-reads and replaces state', async () => {
  let snapshot = [{ id: 'b1', name: 'First', created_at: 'x', updated_at: 'y' }]
  const service = {
    getAll: async () => snapshot,
  }
  let received: unknown = null
  const setter = (data: unknown) => { received = data }

  await refreshCollection(service, setter)
  assert.deepEqual(received, [{ id: 'b1', name: 'First', created_at: 'x', updated_at: 'y' }])

  snapshot = [{ id: 'b1', name: 'Second', created_at: 'x', updated_at: 'y' }]
  await refreshCollection(service, setter)
  assert.deepEqual(received, [{ id: 'b1', name: 'Second', created_at: 'x', updated_at: 'y' }])
})
