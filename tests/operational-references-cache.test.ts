import assert from 'node:assert/strict'
import test from 'node:test'
import { brandService, campaignService, currentUserService, platformService, userService } from '../lib/services/dataService.ts'
import { invalidatePageCache } from '../lib/services/operationsPageCache.ts'
import { getOperationalReferences } from '../lib/services/operationalReferences.ts'
import type { Brand, User } from '../lib/types/database.types.ts'

const actor = (id = 'actor-a'): User => ({
  id, email: `${id}@example.test`, full_name: id, role: 'admin', status: 'active',
  join_date: '2026-01-01', created_at: '2026-01-01', updated_at: 'v1',
})

test('operational references refetch once after a cache invalidation and return only fresh values', async () => {
  const original = [brandService.getAll, platformService.getAll, campaignService.getAll, userService.getAll]
  const env = { nodeEnv: process.env.NODE_ENV, mock: process.env.NEXT_PUBLIC_USE_MOCK_DATA }
  let release!: (value: Brand[]) => void
  const pending = new Promise<Brand[]>(resolve => { release = resolve })
  let brandCalls = 0
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  invalidatePageCache()
  brandService.getAll = async () => {
    brandCalls++
    if (brandCalls === 1) return pending
    return [{ id: 'fresh-brand', name: 'fresh' }] as Brand[]
  }
  platformService.getAll = async () => []
  campaignService.getAll = async () => []
  userService.getAll = async () => []
  try {
    const result = getOperationalReferences(actor())
    await new Promise(resolve => setTimeout(resolve, 0))
    invalidatePageCache()
    release([{ id: 'stale-brand', name: 'stale' } as Brand])
    assert.deepEqual((await result).brands.map(brand => brand.id), ['fresh-brand'])
    assert.equal(brandCalls, 2)
  } finally {
    ;[brandService.getAll, platformService.getAll, campaignService.getAll, userService.getAll] = original
    if (env.nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = env.nodeEnv
    if (env.mock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = env.mock
    invalidatePageCache()
  }
})

test('operational references do not retry after actor changes during invalidation', async () => {
  const original = [brandService.getAll, platformService.getAll, campaignService.getAll, userService.getAll]
  const originalActor = currentUserService.getCurrent
  let actorChecks = 0
  let brandCalls = 0
  const env = { nodeEnv: process.env.NODE_ENV, mock: process.env.NEXT_PUBLIC_USE_MOCK_DATA }
  process.env.NODE_ENV = 'test'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  currentUserService.getCurrent = async () => ++actorChecks === 1 ? actor() : actor('actor-b')
  brandService.getAll = async () => {
    brandCalls++
    invalidatePageCache()
    return [{ id: 'actor-a-data', name: 'private' }] as Brand[]
  }
  platformService.getAll = async () => []
  campaignService.getAll = async () => []
  userService.getAll = async () => []
  try {
    await assert.rejects(getOperationalReferences(actor()), /CACHE_IDENTITY_CHANGED/)
    assert.equal(brandCalls, 1)
    assert.equal(actorChecks, 2)
  } finally {
    ;[brandService.getAll, platformService.getAll, campaignService.getAll, userService.getAll] = original
    currentUserService.getCurrent = originalActor
    if (env.nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = env.nodeEnv
    if (env.mock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = env.mock
    invalidatePageCache()
  }
})

test('operational reference service failures are not retried', async () => {
  const original = [brandService.getAll, platformService.getAll, campaignService.getAll, userService.getAll]
  const env = { nodeEnv: process.env.NODE_ENV, mock: process.env.NEXT_PUBLIC_USE_MOCK_DATA }
  let calls = 0
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  invalidatePageCache()
  brandService.getAll = async () => { calls++; throw new Error('REFERENCE_NETWORK_ERROR') }
  platformService.getAll = async () => []
  campaignService.getAll = async () => []
  userService.getAll = async () => []
  try {
    await assert.rejects(getOperationalReferences(actor()), /REFERENCE_NETWORK_ERROR/)
    assert.equal(calls, 1)
  } finally {
    ;[brandService.getAll, platformService.getAll, campaignService.getAll, userService.getAll] = original
    if (env.nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = env.nodeEnv
    if (env.mock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = env.mock
    invalidatePageCache()
  }
})
