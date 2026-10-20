import assert from 'node:assert/strict'
import test from 'node:test'
import { currentPageCacheGeneration, invalidatePageCache } from '../lib/services/operationsPageCache.ts'
import { readTransientData } from '../lib/services/transientDataCache.ts'

test('shared operational references reuse one identity-scoped in-flight request and cached value', async () => {
  invalidatePageCache()
  let calls = 0
  const loader = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 0)); return { brands: ['verified'] } }
  const p1 = readTransientData('actor-a:admin:v1', 'directories', loader)
  const p2 = readTransientData('actor-a:admin:v1', 'directories', loader)
  const [first, second] = await Promise.all([p1,p2])
  assert.equal(first,second)
  assert.equal(calls,1)
  assert.equal((await readTransientData('actor-a:admin:v1','directories',loader)),first)
  assert.equal(calls,1)
  await readTransientData('actor-a:member:v2','directories',loader)
  await readTransientData('actor-b:admin:v1','directories',loader)
  assert.equal(calls,3)
})

test('failed and unauthorized directory requests are not cached', async () => {
  invalidatePageCache()
  let loads = 0
  await assert.rejects(readTransientData('actor','refs',async()=>{loads++;throw new Error('denied')}),/denied/)
  await assert.rejects(readTransientData('actor','refs',async()=>{loads++;return ['private']},async()=>false),/CACHE_IDENTITY_CHANGED/)
  assert.equal(loads,2)
  const okay=await readTransientData('actor','refs',async()=>{loads++;return ['public']})
  assert.deepEqual(okay,['public'])
  assert.equal(loads,3)
})

test('logout or mutation invalidates shared reference values and stale in-flight writes', async () => {
  invalidatePageCache()
  const start=currentPageCacheGeneration()
  let release!: (v:string[])=>void
  const delayed=readTransientData('actor','revalidate',()=>new Promise<string[]>(resolve=>{release=resolve}))
  await new Promise(resolve => setTimeout(resolve,0))
  invalidatePageCache()
  assert.equal(currentPageCacheGeneration(),start+1)
  release(['stale'])
  await assert.rejects(delayed,/CACHE_INVALIDATED/)
  const fresh=await readTransientData('actor','revalidate',async()=>['fresh'])
  assert.deepEqual(fresh,['fresh'])
})

test('Dashboard and Reports show authorized read-only rows before complete secondary requests', async () => {
  const {readFileSync}=await import('node:fs')
  const dash=readFileSync('components/features/dashboard/DashboardOverview.tsx','utf8')
  const reports=readFileSync('components/features/reports/ReportsList.tsx','utf8')
  assert.match(dash,/data-testid="dashboard-visible-first"/)
  assert.match(dash,/setEarly\(\{key:viewKey, items:visible.items\}\)/)
  assert.match(dash,/getOperationalReferences\(currentUser\)/)
  assert.match(reports,/data-testid="reports-visible-first"/)
  assert.match(reports,/setFirstRows\(\{key:pageKey,rows:page.items,shifts:related,total:page.total\}\)/)
  assert.match(reports,/shiftService\.getReportCandidates\(30\)/)
  assert.doesNotMatch(dash,/calculateAggregate\(future\.items/)
})
