import { test, describe } from 'node:test'
import assert from 'node:assert'
import { calculateAggregate } from '../components/features/dashboard/DashboardOverview'

describe('Dashboard calculateAggregate Semantics', () => {
  const makeReport = (revenue) => ({
    id: 'test',
    shift_id: 'test',
    revenue,
    orders: null,
    peak_viewer: null,
    average_viewer: null,
    comments: null,
    shares: null,
  })

  test('A. [null, null] -> revenue = null', () => {
    const reports = [makeReport(null), makeReport(null)]
    assert.strictEqual(calculateAggregate(reports, 'revenue'), null)
  })

  test('B. [0, 0] -> revenue = 0', () => {
    const reports = [makeReport(0), makeReport(0)]
    assert.strictEqual(calculateAggregate(reports, 'revenue'), 0)
  })

  test('C. [100, null, 50] -> revenue = 150', () => {
    const reports = [makeReport(100), makeReport(null), makeReport(50)]
    assert.strictEqual(calculateAggregate(reports, 'revenue'), 150)
  })

  test('D. [] -> revenue = null', () => {
    const reports = []
    assert.strictEqual(calculateAggregate(reports, 'revenue'), null)
  })
})

describe('Dashboard Delta Semantics', () => {
  const calcDelta = (revenue, previousRevenue) => {
    return (revenue !== null && previousRevenue !== null && previousRevenue !== 0) 
      ? `${(((revenue - previousRevenue) / previousRevenue) * 100).toFixed(1)}%` 
      : '—'
  }

  test('current = null, previous = 100 -> delta = —', () => {
    assert.strictEqual(calcDelta(null, 100), '—')
  })

  test('current = 100, previous = null -> delta = —', () => {
    assert.strictEqual(calcDelta(100, null), '—')
  })

  test('current = 100, previous = 0 -> delta = —', () => {
    assert.strictEqual(calcDelta(100, 0), '—')
  })

  test('current = 0, previous = 100 -> delta = -100.0%', () => {
    assert.strictEqual(calcDelta(0, 100), '-100.0%')
  })

  test('current = 100, previous = 50 -> delta = 100.0%', () => {
    assert.strictEqual(calcDelta(100, 50), '100.0%')
  })
})
