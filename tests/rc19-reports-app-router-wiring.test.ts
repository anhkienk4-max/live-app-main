import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const lazy=readFileSync(new URL('../lib/utils/lazyComponents.tsx',import.meta.url),'utf8')
const route=readFileSync(new URL('../app/(dashboard)/reports/page.tsx',import.meta.url),'utf8')
const reports=readFileSync(new URL('../components/features/reports/ReportsList.tsx',import.meta.url),'utf8')
const old=readFileSync(new URL('../components/features/reports/ReportsContainer.tsx',import.meta.url),'utf8')

test('production /reports uses scoped, server-paginated ReportsList rather than unbounded ReportsContainer',()=>{
 assert.match(route,/import \{ LazyReportsList \} from '@\/lib\/utils\/lazyComponents'/)
 assert.match(route,/<LazyReportsList\s*\/>/)
 assert.match(lazy,/import\('@\/components\/features\/reports\/ReportsList'\)/)
 assert.match(lazy,/default: mod\.ReportsList/)
 assert.doesNotMatch(lazy,/ReportsContainer/)
 assert.match(reports,/reportService\.getFilteredPage\(/)
 assert.match(reports,/getReportObligationPage\(/)
 assert.match(reports,/<CommandToolbar label=\{t\('filters'\)\}/)
 assert.match(reports,/data-testid="reports-apply-filters"/)
 assert.match(reports,/data-testid="reports-applied-filter-chips"/)
 assert.match(old,/reportService\.getAll\(\)/)
})
