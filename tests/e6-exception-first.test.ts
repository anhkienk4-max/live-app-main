import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deduplicateOperationalAttention,
  deriveDataQualityAttention,
  deriveLeaderAttention,
  deriveMemberAttention,
  deriveReportAttention,
  deriveShiftAttention,
  deriveSwapAttention,
  isActionableAttention,
  mergeAttentionSummary,
  sortOperationalAttention,
  type OperationalAttention,
} from '../lib/ui/operational-attention'

test('E6 exception-first architecture', async t => {
  await t.test('healthy summaries stay empty and resolved states disappear', () => {
    assert.equal(deriveLeaderAttention({ pendingRegistrationCount: 0, actionableSwapCount: 0, waitingSwapCount: 0, pendingReportCount: 0, dqErrorCount: 0 }).healthy, true)
    assert.deepEqual(deriveShiftAttention({
      shiftId: 'shift-1', shiftDate: '2026-08-31', shiftStatus: 'cancelled', pendingCount: 2, isUpcoming: true,
      required: { host: 1, support: 0, technical: 0 }, staffed: { host: 0, support: 0, technical: 0 },
    }), [])
    assert.deepEqual(deriveSwapAttention({ swapId: 'swap-1', status: 'completed', actorHasValidAction: false }), [])
    assert.deepEqual(deriveReportAttention('report-1', 'confirmed'), [])
  })

  await t.test('role summaries expose only the role-owned exceptions', () => {
    const member = deriveMemberAttention({ pendingRegistrationCount: 1, actionableSwapCount: 0, waitingSwapCount: 0, hasUpcomingShift: true })
    assert.deepEqual(member.items.map(item => item.scope), ['personal'])
    assert.equal(member.items[0].href, '/calendar?tab=open')
    assert.equal(member.items[0].actionable, true)

    const leader = deriveLeaderAttention({ pendingRegistrationCount: 1, actionableSwapCount: 0, waitingSwapCount: 0, pendingReportCount: 0, dqErrorCount: 0 })
    assert.equal(leader.items[0].scope, 'team')
    assert.equal(leader.items[0].actionable, true)

    const admin = deriveDataQualityAttention(1, 0, 0)
    assert.equal(admin[0].scope, 'organization')
  })

  await t.test('ranking is deterministic by severity, urgency, deadline, then key', () => {
    const items: OperationalAttention[] = [
      { key: 'warning-later', severity: 'warning', urgency: 'soon', deadline: '2026-09-02', label: 'later' },
      { key: 'critical', severity: 'critical', urgency: 'now', label: 'critical' },
      { key: 'warning-now', severity: 'warning', urgency: 'now', deadline: '2026-09-03', label: 'now' },
      { key: 'warning-now-earlier', severity: 'warning', urgency: 'now', deadline: '2026-09-01', label: 'earlier' },
    ]
    assert.deepEqual(sortOperationalAttention(items).map(item => item.key), ['critical', 'warning-now-earlier', 'warning-now', 'warning-later'])
  })

  await t.test('duplicate exceptions are removed within a surface', () => {
    const item = { key: 'shift-1-gap', severity: 'attention' as const, label: 'staffingGap' }
    assert.equal(deduplicateOperationalAttention([item, { ...item }]).length, 1)
    assert.equal(mergeAttentionSummary([[item], [{ ...item }]]).items.length, 1)
  })

  await t.test('actionable items always have a resolution route', () => {
    const summary = deriveLeaderAttention({ pendingRegistrationCount: 1, actionableSwapCount: 1, waitingSwapCount: 0, pendingReportCount: 0, dqErrorCount: 0 })
    for (const item of summary.items) {
      if (isActionableAttention(item)) assert.ok(item.href, `${item.key} should have a route`)
    }
  })
})
