import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const base = '1b96f38a17768e96b92f23056efba4b61cc76f84'
const allowed = new Set(["app/(dashboard)/analytics/page.tsx","app/(dashboard)/calendar/page.tsx","app/(dashboard)/notifications/page.tsx","app/(dashboard)/payroll/page.tsx","app/(dashboard)/profile/page.tsx","app/(dashboard)/reports/page.tsx","app/(dashboard)/storage/page.tsx","app/(dashboard)/workforce/page.tsx","app/apple-icon.tsx","app/globals.css","app/icon.tsx","app/icon1/route.ts","app/icon2/route.ts","app/icon3/route.ts","app/layout.tsx","app/login/page.tsx","app/manifest.ts","app/pwa-splash/route.tsx","components/branding/AdaBrand.tsx","components/features/calendar/CalendarWorkspace.tsx","components/features/dashboard/DashboardOverview.tsx","components/features/dashboard/presentation/OpsMobileHome.tsx","components/features/dashboard/presentation/admin/AdminDashboardView.tsx","components/features/dashboard/presentation/leader/LeaderDashboardView.tsx","components/features/dashboard/presentation/member/MemberDashboardView.tsx","components/features/reports/ReportsList.tsx","components/features/staff/StaffList.tsx","components/features/workforce/WorkforceTeamOverview.tsx","components/layout/BottomNav.tsx","components/layout/Header.tsx","components/layout/ProductionAppShell.tsx","components/layouts/AuthLayout.tsx","components/ui/archetypes.tsx","components/ui/data-table.tsx","components/ui/filter-bar.tsx","e2e/pwa-consistency-mobile.spec.ts","e2e/pwa-dashboard-mobile.spec.ts","e2e/pwa-login-visual.spec.ts","e2e/pwa-staff-mobile.spec.ts","lib/pwa/AdaOpsIcon.tsx","lib/pwa/iconResponse.tsx","playwright.pwa-dashboard.config.ts","playwright.pwa.config.ts","scripts/pwa-rc19-ui-release-scope.mjs","docs/releases/ADA_OPS_RC19_UI_ONLY_PRODUCTION_CANDIDATE_20261028.md",".github/workflows/rc19-pwa-ui-release-candidate.yml"])
const changed = execFileSync('git', ['diff','--name-only',base,'HEAD'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean)
for(const file of changed) assert.ok(allowed.has(file), 'NO-GO unexpected file outside approved UI/test/docs scope: '+file)
const prior = path => execFileSync('git',['show',base+':'+path],{encoding:'utf8'})
const now = path => readFileSync(path,'utf8')
const calls = s => [...new Set([...s.matchAll(/\b(?:userService|shiftService|reportService|payrollService|workforceService)\.([A-Za-z_]\w*)\s*\(/g)].map(m => m[0]))].sort()
for(const file of ['components/features/staff/StaffList.tsx','components/features/reports/ReportsList.tsx','app/(dashboard)/payroll/page.tsx','app/(dashboard)/workforce/page.tsx']) {
  assert.deepEqual(calls(prior(file)), calls(now(file)), 'NO-GO service calls changed in '+file)
}
for(const token of ['getSharedNavigation','mobilePrimaryNavigation']) {
  assert.ok(prior('components/layout/BottomNav.tsx').includes(token))
  assert.ok(now('components/layout/BottomNav.tsx').includes(token))
}
for(const token of ['establishPasswordSession','startGoogleOAuth','clearLocalSession']) {
  assert.ok(prior('app/login/page.tsx').includes(token))
  assert.ok(now('app/login/page.tsx').includes(token))
}
assert.ok(now('components/features/staff/StaffList.tsx').includes('staff-mobile-card-'))
assert.ok(now('app/globals.css').includes('--ada-mobile-control-height: 44px'))
console.log('PASS allowlist ('+changed.length+' files) and representative service/auth invariants; authenticated workflow UAT still required.')
