import test from 'node:test'
import assert from 'node:assert/strict'
import { parseWorkforceYearDraft, workforcePeriodRange } from '@/lib/workforce/workforcePeriod'

test('workforce month/year periods use inclusive business-date bounds',()=>{
  assert.deepEqual(workforcePeriodRange('2024-02'),{from:'2024-02-01',to:'2024-02-29'})
  assert.deepEqual(workforcePeriodRange('2026-09'),{from:'2026-09-01',to:'2026-09-30'})
  assert.deepEqual(workforcePeriodRange('2026'),{from:'2026-01-01',to:'2026-12-31'})
})

test('workforce year input retains partial numeric edits and commits only a full year',()=>{
  assert.deepEqual(['2','20','202','2027'].map(parseWorkforceYearDraft),[
    {draft:'2'}, {draft:'20'}, {draft:'202'}, {draft:'2027',period:'2027'},
  ])
  assert.equal(parseWorkforceYearDraft('20x'),null)
  assert.equal(parseWorkforceYearDraft('20270'),null)
})
