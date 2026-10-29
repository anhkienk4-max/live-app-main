import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const base='1befe23bea9380dac37061a7132ac38143cf678b'
const allowed=new Set(["app/(dashboard)/analytics/page.tsx","app/(dashboard)/calendar/page.tsx","app/(dashboard)/notifications/page.tsx","app/(dashboard)/payroll/page.tsx","app/(dashboard)/profile/page.tsx","app/(dashboard)/reports/page.tsx","app/(dashboard)/storage/page.tsx","app/(dashboard)/workforce/page.tsx","app/apple-icon.tsx","app/globals.css","app/icon.tsx","app/icon1/route.ts","app/icon2/route.ts","app/icon3/route.ts","app/layout.tsx","app/login/page.tsx","app/manifest.ts","app/pwa-splash/route.tsx","components/branding/AdaBrand.tsx","components/features/calendar/CalendarWorkspace.tsx","components/features/dashboard/DashboardOverview.tsx","components/features/dashboard/presentation/OpsMobileHome.tsx","components/features/dashboard/presentation/admin/AdminDashboardView.tsx","components/features/dashboard/presentation/leader/LeaderDashboardView.tsx","components/features/dashboard/presentation/member/MemberDashboardView.tsx","components/features/reports/ReportsList.tsx","components/features/staff/StaffList.tsx","components/features/workforce/WorkforceTeamOverview.tsx","components/layout/BottomNav.tsx","components/layout/Header.tsx","components/layout/ProductionAppShell.tsx","components/layouts/AuthLayout.tsx","components/ui/archetypes.tsx","components/ui/data-table.tsx","components/ui/filter-bar.tsx","e2e/pwa-consistency-mobile.spec.ts","e2e/pwa-dashboard-mobile.spec.ts","e2e/pwa-login-visual.spec.ts","e2e/pwa-staff-mobile.spec.ts","lib/pwa/AdaOpsIcon.tsx","lib/pwa/iconResponse.tsx","lib/ui/role-ux.ts","tests/e1-role-ux.test.ts","playwright.pwa.config.ts","playwright.pwa-dashboard.config.ts","e2e/pwa-functional-staging.uat.spec.ts","playwright.pwa-functional.uat.config.ts","scripts/run-pwa-functional-uat.ps1","scripts/validate-pwa-functional-uat.mjs","tests/pwa-functional-uat-contract.test.mjs","docs/pwa/ADA_OPS_PWA_FUNCTIONAL_UAT.md","docs/releases/VERCEL_CURRENT_PROD_1609DB_SHA1_20261028.json","scripts/verify-current-prod-source.mjs","scripts/verify-current-prod-ui-scope.mjs","docs/releases/ADA_OPS_UI_1609DB_RELEASE_GATE_20261028.md",".github/workflows/rc19-current-prod-ui-candidate.yml","scripts/verify-aliased-live-core-visible.mjs","docs/releases/VERCEL_ALIASED_LIVE_20261029_VISIBLE_SHA1.json"])
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:128*1024*1024})
const changed=git('diff','--name-only',base,'HEAD').trim().split(/\r?\n/).filter(Boolean)
for(const p of changed)assert.ok(allowed.has(p),'NO-GO unexpected path '+p)
for(const p of changed)assert.ok(!/^supabase\/|^lib\/services\/|^lib\/server\/|^lib\/auth\/|^app\/api\/|^proxy\.ts$/.test(p),'NO-GO backend/auth source modified: '+p)
const old=p=>git('show',base+':'+p)
const current=p=>readFileSync(p,'utf8')
for(const p of ['components/layout/BottomNav.tsx','components/layout/Header.tsx']){
 const roleExpr='filterNav(getNavigationForRole(resolveSystemPermission(currentUser)), currentUser)'
 assert.ok(old(p).includes(roleExpr),'baseline missing role filter: '+p)
 assert.ok(current(p).includes(roleExpr),'role filter changed: '+p)
 assert.ok(!current(p).includes('getSharedNavigation('),'role-nav regression: '+p)
}
// The new Production Sidebar uses a separately computed permission value.
// It is intentionally byte-for-byte untouched by this UI-only patch.
assert.equal(current('components/layout/Sidebar.tsx'),old('components/layout/Sidebar.tsx'),'Sidebar behavior changed unexpectedly')
assert.ok(current('components/layout/Sidebar.tsx').includes('filterNav(getNavigationForRole(permission), currentUser)'),'Sidebar role filter missing')
const calls=s=>[...new Set([...s.matchAll(/\b(?:userService|shiftService|reportService|payrollService|workforceService)\.([A-Za-z_]\w*)\s*\(/g)].map(m=>m[0]))].sort()
for(const p of ['components/features/staff/StaffList.tsx','components/features/reports/ReportsList.tsx','app/(dashboard)/payroll/page.tsx','app/(dashboard)/workforce/page.tsx'])assert.deepEqual(calls(old(p)),calls(current(p)),'service method usage changed: '+p)
for(const token of ['establishPasswordSession','startGoogleOAuth','clearLocalSession']){
 assert.ok(old('app/login/page.tsx').includes(token)&&current('app/login/page.tsx').includes(token),'auth entrypoint missing '+token)
}
assert.ok(current('components/layout/BottomNav.tsx').includes('ada-reference-tabs'))
assert.ok(current('app/globals.css').includes('--ada-mobile-control-height: 44px'))
const roleNavSource=current('lib/ui/role-ux.ts')
for(const roleName of ['adminNav','leaderNav','memberNav']) {
 const roleSection=roleNavSource.split('const '+roleName+': NavItem[] = [')[1]?.split('\n]')[0] ?? ''
 assert.equal((roleSection.match(/navCatalogue\.profile/g) ?? []).length,1,'Profile nav missing/duplicate: '+roleName)
 assert.equal((roleSection.match(/navCatalogue\.notifications/g) ?? []).length,1,'Notifications nav missing/duplicate: '+roleName)
}
console.log('UI-only release source guard PASS; real-role UAT remains required.')
