# Codex RC19 UI Fix Handoff

## U01 Login responsive

- Branch: `fix/rc19-u01-zoom-codex`
- Base SHA: `505bc1b60c5c514b488f9c1f9faf7f9d9993d843`
- Regression assertion commit: `4a41fa51b704609d69164a929c7bc2f19a575b7e`
- U01 commit: `3e945ccca40f9df67c84f50c695c69c11a86955e`
- U01 source is committed. The pre-existing `.commandcode/` directory remains untouched; the handoff, baseline screenshots, and canonical memory projection are pending a documentation/metadata commit.

### Files in the handoff

- U01: `components/layouts/AuthLayout.tsx`, `components/ui/archetypes.tsx`, `tests/rc19-auth-responsive-layout.test.tsx`, `e2e/rc19-auth-zoom-accessibility.spec.ts`, `playwright.rc19-auth.config.ts`.
- Separate regression assertion: `tests/auth-identity-bridge.test.tsx`.
- Evidence: `docs/handoffs/rc19-u01-screenshots/{before,after}-*.png`.
- Canonical metadata refreshed after the commits: `project-memory/current-state.json` and `project-memory/generated/project-memory.md`.
- Handoff: `docs/handoffs/CODEX_RC19_UI_FIX_HANDOFF.md`.

### Change summary

- Removed the fixed wide-screen caps on the auth card and form container. At wide CSS viewports the card now uses 86vw, while the auth form can fill its panel. The two-column card and operations panel start at `xl` so zoomed layouts retain useful physical size.
- Kept the existing auth routes, form handlers, Supabase session helpers, redirects, and role checks unchanged.
- Updated the U01 layout assertions and browser coverage. The RC19 Playwright config now runs the development environment guard before Next dev.
- Updated the stale auth identity source assertion to match the service's existing `body?.ownerKey` guard. The service and access behavior did not change. This is committed separately as requested.

### Verification

- U01, U13, and auth identity focused tests: **15 PASS / 0 FAIL**.
- Browser QA: **16 PASS / 0 FAIL**. Login overflow checks passed at 320, 390, 614, 768, 960, 1024, 1152, 1366, 1440, 1800, 2020, 2880, and 4364 CSS px. Login/Register/Forgot Password/Reset Password rendered at 390, 768, and 1440 px without horizontal overflow. Skip-link keyboard behavior passed.
- Screenshot-only rerun after setting Playwright `caret: 'initial'`: **1 PASS**. This avoids Playwright's default screenshot caret injection causing a development-only hydration diagnostic.
- TypeScript: **PASS**. ESLint: **PASS**, 0 errors and 32 warnings in other existing files; scoped lint for changed source/config/tests: **PASS**.
- Full release regression with both OCR fixtures: **1,979 PASS / 0 FAIL / 3 SKIP**, exit 0. The three skips are the allow-listed staging-only checks. Shopee and TikTok OCR fixture checks both passed (19/19 spatial metrics each).
- Next build: **PASS** under the environment guard's `local: credential_free_build` mode (`CI=true`); no guard was disabled.
- `memory:sync` and `memory:validate`: **PASS**.

### Screenshot evidence

The `before-*` images render the committed RC19 base `505bc1b`; the `after-*` images render U01 commit `3e945cc`.

- Phone: [before](rc19-u01-screenshots/before-phone-505bc1b.png) / [after](rc19-u01-screenshots/after-phone.png)
- Desktop: [before](rc19-u01-screenshots/before-desktop-505bc1b.png) / [after](rc19-u01-screenshots/after-desktop.png)
- 50%-zoom-equivalent wide CSS viewport: [before](rc19-u01-screenshots/before-zoom-50-equivalent-505bc1b.png) / [after](rc19-u01-screenshots/after-zoom-50-equivalent.png)

The browser used CSS viewport widths corresponding to browser zoom on a 1440 px display (960/1152/1440/1800/2880/4364 for 150/125/100/80/50/33 percent), plus 2020 px for the observed 50 percent case. This is browser viewport emulation, not changing the browser chrome zoom control. The visual run used local mock mode and does not constitute authenticated Supabase UAT.

## U02 Dashboard audit only

Gemini's worktree `live-app-full-upgrade` is on `feat/ops-full-app-upgrade` at `283c0e148fd14ae3b8503cd9507e1925dc16818a`; it was clean when inspected. Relative to RC19 base, Gemini changed:

- `components/features/dashboard/DashboardOverview.tsx`
- `components/features/dashboard/presentation/admin/AdminDashboardView.tsx`

These overlap the U02 target. No U02 files were edited. `DashboardWorkspace.tsx` does not exist on the RC19 baseline; `DashboardWorkspace` is exported from `DashboardOverview.tsx`. Gemini did not change `components/ui/content-skeleton.tsx` in that Wave 1 commit.

RC19 audit findings and test cases to carry into integration:

1. `DashboardOverview` gates the whole dashboard on `loading || !data || !currentUser`. Refreshes set `loading` true even when prior data exists, so all widgets disappear behind one generic skeleton.
2. The first data read starts six requests together; it then waits for related shift reads and registrations before rendering the role dashboard. A limited upcoming-shifts request can populate an early section, but the remaining dashboard still waits for the full dataset.
3. `ContentSkeleton` shows four generic cards and five rows. It does not match the Admin view's KPI row, attention/live panels, operations table, performance, and activity regions.
4. Cache reads are keyed by operational identity and filters and revalidate the current actor. Preserve those account/role boundaries when splitting widget reads.
5. U02 tests should defer each widget API independently; verify the page shell and ready widgets render before slow widgets; test one widget failure and retry without blanking ready widgets; ensure missing values remain unknown rather than zero; switch account/role during a pending request and reject stale data; assert each request stays server-bounded; and measure first usable content plus request count against the RC19 baseline.

No before/after U02 performance measurements were taken because Gemini is editing the overlapping files. Do not cherry-pick U02 edits from this branch; integrate Wave 1 first, then port the audit/test plan to the merged source.

## Gemini integration

After reviewing this handoff, Gemini can cherry-pick the independent commits in order:

```text
git cherry-pick 4a41fa51b704609d69164a929c7bc2f19a575b7e
git cherry-pick 3e945ccca40f9df67c84f50c695c69c11a86955e
```

If Wave 1 changed the same auth layout or `PageShell` contract, port only the U01 width/breakpoint changes and keep the test/assertion updates. Do not merge either worktree automatically.

## U03–U05 Calendar and Shift List fixes (2026-10-25)

- Branch: `fix/rc19-u03-u05-calendar-shifts`
- Base: pushed U01 `f030cbfc1e1645ffe39f3615875e04f719ec0aa5`
- U03: `45a52ed738100ff928ec2fb96afc4433b8fb8de5`
- U04: `33aebff5de3697750817889019d713b0f3858960`
- U05: `9246d8e0e5ae3a20a781d3795008e97d06b44862`
- No U02 Dashboard, Design System, Supabase schema/RLS, Production, Gemini worktree, or RC12 stash changes. Pre-existing untracked `.commandcode/` was left untouched.

### U03 — Calendar window completeness

Changed `lib/services/calendarWindow.ts`, `components/features/calendar/CalendarView.tsx`, `tests/rc16l-calendar.test.ts`, `tests/calendar-range-fetching.test.ts`, and `e2e/rc19-calendar-density.spec.ts`.

- First page is marked as incomplete with an actual loaded/total count. A later page error clears the partial window; no partial result enters the cache or bulk approval.
- Remaining 50-row pages are fetched in batches of at most three. Page order, total, ownerKey, duplicate IDs, and exact final count remain checked. A 232-row window takes three sequential network rounds instead of five if each batch runs in parallel; this is a request-round calculation, not a measured network latency claim.
- Page content and bulk selection are hidden for a stale request key during month/filter transitions. The existing business-local date, one-day authority margin for overnight shifts, account/permission cache key, and server-side RLS checks remain in place.
- Focused tests: 25 PASS. Browser layout: 3 PASS at 390/768/1440 px. TypeScript, scoped ESLint, and guarded build: PASS.
- Evidence: [desktop after](evidence/rc19-u03-calendar-after-desktop.png), [mobile after](evidence/rc19-u03-calendar-after-mobile.png). A U03 before screenshot was not captured before the first edit; do not present these images as a before/after pair. The 232-row completeness check uses a known fixture. Authenticated staging/Production month totals were not queried.

### U04 — Calendar filter workflow

Changed `components/features/calendar/CalendarView.tsx`, `components/features/calendar/WeekView.tsx`, `tests/calendar-filters.test.ts`, `e2e/rc19-calendar-filter-apply.spec.ts`, and `playwright.rc19-calendar.config.ts`.

- Existing Brand, Platform, Campaign, Studio, Status, Host, Support, Technical, time, Operational Role, Staffing, Registration, and imported-staffing controls now live in one responsive dialog. Edits stay in a draft until Apply; Reset edits the draft, Close/Escape discards it. Applied filters remain in URL state and chips across month/view navigation; each chip and Clear All can remove applied filters.
- The empty WeekView overlay was lowered below the dialog so it no longer intercepts filter actions. Existing search, export, staffing actions, and permission gates remain.
- Focused tests: 21 PASS. Browser: 5 PASS for layout and VI mobile/EN desktop Apply, Reset, chip removal, month/view URL persistence; one additional desktop rerun PASS for empty WeekView. TypeScript, scoped ESLint, and guarded build: PASS.
- Before U04: [desktop](evidence/rc19-u03-calendar-after-desktop.png), [mobile](evidence/rc19-u03-calendar-after-mobile.png). After U04: [desktop dialog](evidence/rc19-u04-filter-after-1440.png), [mobile drawer](evidence/rc19-u04-filter-after-390.png). These are local mock screenshots.

### U05 — Shift List date, page and selection

Changed `components/features/shifts/ShiftList.tsx`, `lib/utils/shiftDateWindow.ts`, `lib/utils/shiftListUrlState.ts`, `tests/rc18a-shift-date-window.test.ts`, `tests/rc18a-shift-list-url-state.test.ts`, `e2e/rc19-shifts-list.spec.ts`, and `playwright.rc19-shifts.config.ts`.

- Recent 30 Days, Upcoming and All remain. Month and validated custom date range now use the existing server `from`/`to` filters; invalid shared URL dates fall back to Recent. Date changes reset page but preserve status/search/sort and unrelated URL parameters.
- Toolbar and search stay mounted during server requests, so typing retains focus. Desktop table and mobile cards render the same bounded server page; pagination clamps to a valid page. Selection and delete/bulk actions are limited to rows on the current page, with a second check before deletion.
- Focused tests: 22 PASS. Browser VI mobile/EN desktop: 2 PASS plus 1 desktop selection rerun PASS, covering date modes, URL, typed search, total vs rendered rows, page clamp, status, sort, and selection clearing. TypeScript, scoped ESLint, and guarded build: PASS.
- Evidence: [mobile before](evidence/rc19-u05-shifts-before-390.png) / [mobile after](evidence/rc19-u05-shifts-after-390.png); [desktop before](evidence/rc19-u05-shifts-before-1440.png) / [desktop after](evidence/rc19-u05-shifts-after-1440.png). These use local seeded shifts, not Production data.

### Shared verification and integration

- Full release regression on U05 HEAD with the Shopee and TikTok OCR fixtures: **1,981 PASS / 0 FAIL / 3 SKIP**. The three skips are the manifest's named optional staging checks. Local log: `test_reports/rc19-u03-u05-full-regression.tap` (ignored from Git).
- Repository ESLint: **0 errors, 32 warnings**, all in unchanged files. Build on each ticket: **PASS**, with `[ENV GUARD] local: credential_free_build`. No environment guard was disabled.
- Browser evidence is local mock mode. Authenticated Supabase role/RLS UAT, real server month totals, and deployed SHA verification remain separate release gates; no Production deployment was performed.
- Wave 1 conflict candidates: `CalendarView.tsx`, `WeekView.tsx`, `ShiftList.tsx`, `calendarWindow.ts`, and the date/URL helpers if Gemini touched their data hooks or table integration. `ShiftList` deliberately keeps the existing `DataTable`; no EnterpriseDataTable or QueryProvider changes are included.

Cherry-pick the ticket commits in order after U01 is present in the integration branch:

```text
git cherry-pick 45a52ed738100ff928ec2fb96afc4433b8fb8de5
git cherry-pick 33aebff5de3697750817889019d713b0f3858960
git cherry-pick 9246d8e0e5ae3a20a781d3795008e97d06b44862
```

If Wave 1 changed the same Calendar or Shift List surfaces, port these focused diffs and their regression/browser tests against the merged source. Do not merge either worktree automatically.
