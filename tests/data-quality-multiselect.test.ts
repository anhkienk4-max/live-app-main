import assert from 'node:assert/strict'
import test from 'node:test'
import { filterDataQualityIssues } from '../lib/utils/dataQuality.ts'
import type { DataQualityIssue } from '../lib/types/dataQuality.ts'
import { listFiltersSchema } from '../lib/server/operationsCollectionHandler.ts'

const issues: DataQualityIssue[] = [
  { id: '1', severity: 'error', source: 'report', issue_code: 'E1', title: 'Report error', message: '', recoverable: false, created_at: '' },
  { id: '2', severity: 'warning', source: 'report', issue_code: 'W1', title: 'Report warning', message: '', recoverable: false, created_at: '' },
  { id: '3', severity: 'info', source: 'staffing', issue_code: 'I1', title: 'Staffing info', message: '', recoverable: false, created_at: '' },
]

test('data quality filters OR within each dimension, AND across dimensions, and empty means all', () => {
  assert.deepEqual(filterDataQualityIssues(issues, ['error', 'warning'], ['report']).map(issue => issue.id), ['1', '2'])
  assert.deepEqual(filterDataQualityIssues(issues, ['error', 'warning'], ['staffing']).map(issue => issue.id), [])
  assert.deepEqual(filterDataQualityIssues(issues, [], []).map(issue => issue.id), ['1', '2', '3'])
})

test('operations API accepts bounded severity and source multi-select arrays', () => {
  assert.equal(listFiltersSchema.safeParse({ severity: ['error', 'warning'], qualitySources: ['report', 'staffing'] }).success, true)
  assert.equal(listFiltersSchema.safeParse({ severity: 'error' }).success, false)
  assert.equal(listFiltersSchema.safeParse({ severity: ['invalid'] }).success, false)
})
