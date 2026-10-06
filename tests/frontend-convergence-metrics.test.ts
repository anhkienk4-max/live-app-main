import assert from 'node:assert/strict'
import test from 'node:test'
import { reportMetricValue, calculateNullableAnalyticsMetrics } from '../lib/utils/analytics.ts'
import type { Report } from '../lib/types/database.types.ts'
const report = (values: Partial<Report> = {}): Report => ({ id:'test-report',shift_id:'test-shift',revenue:null,orders:null,peak_viewer:null,average_viewer:null,comments:null,shares:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',status:'confirmed',metrics_confirmed:true,...values })
test('absent metrics stay absent and recorded zero remains zero',()=>{
  assert.equal(reportMetricValue(report(),'revenue'),null)
  assert.equal(reportMetricValue(report(),'orders'),null)
  assert.equal(reportMetricValue(report({revenue:0,orders:0}),'revenue'),0)
  assert.equal(calculateNullableAnalyticsMetrics([]).revenue,null)
  assert.equal(calculateNullableAnalyticsMetrics([report({revenue:0})]).revenue,0)
  assert.equal(calculateNullableAnalyticsMetrics([report()]).ctr,null)
})
test('normalized metric precedence and available-only rate averages are preserved',()=>{
  const metrics=calculateNullableAnalyticsMetrics([report({revenue:10,orders:4,normalized_metrics:{revenue:100,ctr:2}}),report({revenue:20,orders:6,ctr:4}),report()])
  assert.equal(metrics.revenue,120)
  assert.equal(metrics.orders,10)
  assert.equal(metrics.averageOrderValue,12)
  assert.equal(metrics.ctr,3)
})
test('AOV excludes unpaired observations and does not divide by zero',()=>{
  assert.equal(calculateNullableAnalyticsMetrics([report({revenue:100,orders:0})]).averageOrderValue,null)
  assert.equal(calculateNullableAnalyticsMetrics([report({revenue:100,orders:2}),report({revenue:900})]).averageOrderValue,50)
})

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../lib/i18n.tsx'
import { ReportsView } from '../components/features/reports/ReportsView.tsx'
import { LiveOperationsConsole } from '../components/features/live/LiveOperationsConsole.tsx'
import type { Shift } from '../lib/types/database.types.ts'
;(globalThis as typeof globalThis & {React:typeof React}).React=React
const shift:Shift={id:'test-shift',title:'Actual test shift',date:'2026-01-01',start_time:'23:00',end_time:'01:00',timezone:'Asia/Ho_Chi_Minh',brand_id:'test-brand',platform_id:'test-platform',studio:'Actual test studio',status:'live',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}
const render=(content:React.ReactNode)=>renderToStaticMarkup(React.createElement(LanguageProvider,null,content))
test('Reports presenter uses actual shift metadata and handles absent and zero metrics',()=>{
  const markup=render(React.createElement(ReportsView,{reports:[report()],shifts:[shift],brands:[],platforms:[],campaigns:[],users:[],registrations:[],currentUser:null,onView:()=>{},onRemove:()=>{}}))
  assert.match(markup,/Actual test shift/)
  assert.match(markup,/Actual test studio/)
  assert.match(markup,/120/)
  assert.match(markup,/—/)
  assert.doesNotMatch(markup,/Static High-Fi|RPT-0906|KOC Platform|Real-time/)
})
test('Live console exposes the real state and unavailable metrics when there is no snapshot',()=>{
  const markup=render(React.createElement(LiveOperationsConsole,{shift,updates:[],report:null,brands:[],platforms:[],campaigns:[],users:[],registrations:[],loading:false,actions:null,snapshots:null,details:null,timeline:null,onRefresh:()=>{}}))
  assert.match(markup,/Actual test shift/)
  assert.match(markup,/Actual test studio/)
  assert.match(markup,/120/)
  assert.match(markup,/—/)
  assert.doesNotMatch(markup,/Pharmaton|Mega Sale|01:24:15|98.2|qaState/)
})


import { readFileSync } from 'node:fs'
import { DayView } from '../components/features/calendar/DayView.tsx'
import { StaffingShiftSummary } from '../components/features/calendar/StaffingWorkspace.tsx'
import type { Shift, ShiftRegistration } from '../lib/types/database.types.ts'

const gridShift: Shift = {id:'grid-test',title:'Test shift',date:'2100-09-09',start_time:'08:00',end_time:'10:00',brand_id:'test-brand',platform_id:'test-platform',required_host_count:2,required_support_count:1,required_technical_count:0,status:'scheduled',created_at:'2100-09-01T00:00:00Z',updated_at:'2100-09-01T00:00:00Z'}

test('compact Day grid keeps 08:00 and earlier real shifts visible',()=>{
  const render=(shift:Shift)=>renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(DayView,{currentDate:new Date(2100,8,9),shifts:[shift],brands:[],platforms:[],users:[],registrations:[]})))
  const normal=render(gridShift)
  assert.match(normal,/08:00/)
  assert.match(normal,/top:0;height:72px/)
  const early=render({...gridShift,start_time:'06:00',end_time:'07:00'})
  assert.match(early,/06:00/)
  assert.match(early,/top:0;height:36px/)
})

test('staffing summary scopes canonical approved registrations and excludes pending/other shifts',()=>{
  const registration=(id:string,shiftId:string,status:ShiftRegistration['status']):ShiftRegistration=>({id,shift_id:shiftId,user_id:id,operational_role:'host',status,source:'self_registration',requested_at:'2100-09-01T00:00:00Z',created_at:'2100-09-01T00:00:00Z',updated_at:'2100-09-01T00:00:00Z'})
  const html=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(StaffingShiftSummary,{shift:gridShift,registrations:[registration('approved',gridShift.id,'approved'),registration('pending',gridShift.id,'pending'),registration('other','other-shift','approved')]})))
  assert.match(html,/Host: 1\/2/)
  assert.match(html,/Support: 0\/1/)
  assert.doesNotMatch(html,/Host: 2\/2/)
})

test('production wave entrypoints have no visual-QA imports or business fixture controllers',()=>{
  const paths=['components/features/reports/ReportsContainer.tsx','components/features/reports/ReportsView.tsx','components/features/live/LiveOperationsConsole.tsx','components/features/live/LiveMonitoringDashboard.tsx','components/features/live/LiveSessionModal.tsx','components/features/analytics/DashboardAnalytics.tsx','components/features/calendar/CalendarView.tsx','components/features/shifts/ShiftList.tsx','components/features/shifts/ShiftFormDialog.tsx','components/features/staff/StaffList.tsx','components/features/calendar/StaffingWorkspace.tsx','components/features/registration/RegistrationReviewWorkspace.tsx','components/features/swaps/SwapRequestList.tsx','app/(dashboard)/notifications/page.tsx','components/features/calendar/ScheduleImportPanel.tsx','components/features/audit/AuditHistory.tsx','app/(dashboard)/settings/page.tsx','app/login/page.tsx','components/features/dashboard/DashboardOverview.tsx']
  for(const path of paths){const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.doesNotMatch(source,/from ['"][^'"]*(?:visual-qa|visual-fixtures)|qaState|__set[A-Z]|MOCK_CONFIRMED_REPORTS/,path)}
})


test('one frontend realtime owner updates both notification surfaces without duplicate toasts',()=>{
  const page=readFileSync(new URL('../app/(dashboard)/notifications/page.tsx',import.meta.url),'utf8')
  const header=readFileSync(new URL('../components/features/notifications/NotificationCenter.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(page,/_subscribeRealtime/)
  assert.match(header,/_subscribeRealtime/)
  assert.match(header,/dispatchEvent\(new CustomEvent\('livestream-ops-notifications-changed'/)
  assert.match(page,/addEventListener\('livestream-ops-notifications-changed'/)
  assert.match(page,/dispatchEvent\(new CustomEvent\('livestream-ops-notification-read-changed'/)
  assert.match(header,/addEventListener\('livestream-ops-notification-read-changed'/)
  assert.match(page,/setSelectedId\(id => id \?\? records\[0\]\?\.id \?\? null\)/)
})
