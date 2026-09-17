import test from 'node:test'
import assert from 'node:assert'
import { getRoleLens, ROLE_LENS_CONFIG } from '../lib/ui/role-lens'

test('RoleLens configuration testing', async (t) => {
  await t.test('Admin lens', () => {
    const lens = getRoleLens('admin')
    assert.strictEqual(lens?.roleLabelKey, 'roleAdmin')
    assert.strictEqual(lens?.showActionQueue, true)
    assert.strictEqual(lens?.showGlobalMetrics, true)
    assert.strictEqual(lens?.showFinancials, true)
  })

  await t.test('Leader lens', () => {
    const lens = getRoleLens('leader')
    assert.strictEqual(lens?.roleLabelKey, 'roleLeader')
    assert.strictEqual(lens?.showActionQueue, true)
    assert.strictEqual(lens?.showGlobalMetrics, false)
    assert.strictEqual(lens?.showFinancials, false)
  })

  await t.test('Member lens', () => {
    const lens = getRoleLens('member')
    assert.strictEqual(lens?.roleLabelKey, 'roleMember')
    assert.strictEqual(lens?.showActionQueue, false)
    assert.strictEqual(lens?.showGlobalMetrics, false)
    assert.strictEqual(lens?.showFinancials, false)
  })

  await t.test('unknown/loading role behavior', () => {
    const lensUndefined = getRoleLens(undefined)
    assert.strictEqual(lensUndefined, null)

    const lensNull = getRoleLens(null as any)
    assert.strictEqual(lensNull, null)
  })
})
